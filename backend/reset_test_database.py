import argparse
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.engine import URL, make_url

from app.config import Settings
from app.db import make_engine
from app.models import AuthSession, EmailRecord, Organization, RoleInvitation, User, UserRole

TARGET_DATABASE = "emailtracex_test"
EXPECTED_TABLES = {
    "alembic_version",
    "auth_sessions",
    "email_records",
    "organizations",
    "role_invitations",
    "users",
}
TABLE_CATEGORIES = {
    "alembic_version": "migration history (preserve)",
    "auth_sessions": "account/session data",
    "email_records": "forensic data (preserve unless explicitly confirmed)",
    "organizations": "organization configuration (preserve)",
    "role_invitations": "account/provisioning data",
    "users": "account data",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Safely reset account/provisioning data in the configured "
            "emailtracex_test database. The default preserves email records "
            "and their submitting accounts."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show a read-only inventory and planned row counts",
    )
    parser.add_argument(
        "--delete-forensic-data",
        action="store_true",
        help=(
            "also delete email_records belonging to the configured default "
            "organization, after a second explicit confirmation"
        ),
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        help="backup directory (defaults to the current user's local data directory)",
    )
    return parser.parse_args()


def _backup_directory(override: Path | None) -> Path:
    if override is not None:
        return override.expanduser().resolve()
    local_app_data = os.getenv("LOCALAPPDATA")
    base = Path(local_app_data) if local_app_data else Path.home()
    return base / "EmailTraceX" / "backups"


def _table_counts(connection) -> dict[str, int]:
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    views = set(inspector.get_view_names())
    if tables != EXPECTED_TABLES or views:
        raise RuntimeError(
            "Unexpected database schema; reset refused. "
            f"Tables found: {', '.join(sorted(tables)) or '(none)'}. "
            f"Views found: {', '.join(sorted(views)) or '(none)'}."
        )
    return {
        table_name: connection.scalar(text(f"SELECT COUNT(*) FROM `{table_name}`"))
        for table_name in sorted(tables)
    }


def _inventory(connection, organization_id: uuid.UUID) -> tuple[dict[str, int], dict[str, int]]:
    counts = _table_counts(connection)
    default_user_ids = select(User.id).where(User.organization_id == organization_id)
    details = {
        "default_org_users": connection.scalar(
            select(func.count()).select_from(User).where(User.organization_id == organization_id)
        ),
        "default_org_sessions": connection.scalar(
            select(func.count())
            .select_from(AuthSession)
            .where(AuthSession.user_id.in_(default_user_ids))
        ),
        "default_org_invitations": connection.scalar(
            select(func.count())
            .select_from(RoleInvitation)
            .where(RoleInvitation.organization_id == organization_id)
        ),
        "default_org_email_records": connection.scalar(
            select(func.count())
            .select_from(EmailRecord)
            .where(EmailRecord.organization_id == organization_id)
        ),
        "default_org_users_referenced_by_emails": connection.scalar(
            select(func.count(func.distinct(EmailRecord.submitted_by_user_id)))
            .select_from(EmailRecord)
            .join(User, User.id == EmailRecord.submitted_by_user_id)
            .where(User.organization_id == organization_id)
        ),
        "default_org_admins": connection.scalar(
            select(func.count())
            .select_from(User)
            .where(
                User.organization_id == organization_id,
                User.role == UserRole.organization_admin,
            )
        ),
        "default_org_admins_referenced_by_emails": connection.scalar(
            select(func.count(func.distinct(User.id)))
            .select_from(User)
            .join(EmailRecord, EmailRecord.submitted_by_user_id == User.id)
            .where(
                User.organization_id == organization_id,
                User.role == UserRole.organization_admin,
            )
        ),
        "cross_org_email_references": connection.scalar(
            select(func.count())
            .select_from(EmailRecord)
            .join(User, User.id == EmailRecord.submitted_by_user_id)
            .where(
                User.organization_id == organization_id,
                EmailRecord.organization_id != organization_id,
            )
        ),
        "cross_org_invitation_references": connection.scalar(
            select(func.count())
            .select_from(RoleInvitation)
            .join(User, User.id == RoleInvitation.invited_by_user_id)
            .where(
                User.organization_id == organization_id,
                RoleInvitation.organization_id != organization_id,
            )
        ),
        "default_organization_exists": connection.scalar(
            select(func.count()).select_from(Organization).where(Organization.id == organization_id)
        ),
    }
    return counts, details


def _print_inventory(counts: dict[str, int], details: dict[str, int], delete_forensic_data: bool) -> None:
    print(f"Database: {TARGET_DATABASE}")
    print("Read-only table inventory:")
    for table_name, count in counts.items():
        print(f"  {table_name}: {count} rows - {TABLE_CATEGORIES[table_name]}")
    print("Configured default-organization impact:")
    for key, value in details.items():
        if key != "default_organization_exists":
            print(f"  {key.replace('_', ' ')}: {value}")
    if delete_forensic_data:
        print("Plan: delete default-organization email records and all its accounts.")
    else:
        retained = details["default_org_users_referenced_by_emails"]
        removable = details["default_org_users"] - retained
        print(
            "Plan: preserve all email records and their submitting accounts; "
            f"delete the other {removable} default-organization accounts."
        )


def _confirm(details: dict[str, int], delete_forensic_data: bool) -> None:
    if input(f"Type RESET {TARGET_DATABASE} to continue: ").strip() != f"RESET {TARGET_DATABASE}":
        raise SystemExit("Confirmation did not match; no database changes were made.")
    if delete_forensic_data:
        expected = (
            "DELETE DEFAULT-ORG EMAIL RECORDS "
            f"{details['default_org_email_records']}"
        )
        if input(f"Type {expected} to confirm forensic-data deletion: ").strip() != expected:
            raise SystemExit("Forensic-data confirmation did not match; no database changes were made.")


def _create_backup(database_url: URL, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = backup_dir / f"{TARGET_DATABASE}-{stamp}.sql"
    command = [
        "mysqldump",
        "--host",
        database_url.host or "localhost",
        "--port",
        str(database_url.port or 3306),
        "--user",
        database_url.username or "",
        "--password",
        "--single-transaction",
        "--routines",
        "--triggers",
        "--events",
        "--databases",
        TARGET_DATABASE,
    ]
    try:
        with backup_path.open("xb") as output:
            result = subprocess.run(command, stdin=None, stdout=output, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        if backup_path.exists():
            backup_path.unlink()
        raise RuntimeError(
            "Database backup failed; no reset was performed. Ensure mysqldump is installed "
            "and its interactive database-password prompt succeeds."
        ) from exc
    if result.returncode != 0 or not backup_path.is_file() or backup_path.stat().st_size == 0:
        if backup_path.exists():
            backup_path.unlink()
        raise RuntimeError(
            "Database backup failed or produced an empty file; no reset was performed."
        )
    try:
        os.chmod(backup_path, 0o600)
    except OSError as exc:
        raise RuntimeError(
            "Backup completed but its permissions could not be restricted; no reset was performed."
        ) from exc
    print(f"Database backup completed: {backup_path}")
    print("The backup contains account hashes and email records; keep it private.")
    return backup_path


def _perform_reset(
    engine,
    organization_id: uuid.UUID,
    expected_counts: dict[str, int],
    expected_details: dict[str, int],
    expected_revisions: list[str],
    delete_forensic_data: bool,
) -> tuple[dict[str, int], list[str]]:
    with engine.begin() as connection:
        if connection.scalar(text("SELECT DATABASE()")) != TARGET_DATABASE:
            raise RuntimeError("Connected database changed; reset refused.")
        for model in (User, AuthSession, RoleInvitation, EmailRecord):
            connection.execute(select(model.id).with_for_update()).all()
        current_counts, current_details = _inventory(connection, organization_id)
        if current_counts != expected_counts or current_details != expected_details:
            raise RuntimeError(
                "Database contents changed after inventory; reset refused. "
                "Run the command again to review the new inventory."
            )
        revision_rows = connection.execute(
            text("SELECT version_num FROM alembic_version ORDER BY version_num")
        ).scalars().all()
        if revision_rows != expected_revisions:
            raise RuntimeError("Alembic revision changed after inventory; reset refused.")
        if not current_details["default_organization_exists"]:
            raise RuntimeError("Configured default organization is missing; reset refused.")
        if current_details["cross_org_email_references"] or current_details["cross_org_invitation_references"]:
            raise RuntimeError(
                "Default-organization users are referenced by another organization's "
                "forensic or invitation data; reset refused."
            )

        if delete_forensic_data:
            connection.execute(
                delete(EmailRecord).where(EmailRecord.organization_id == organization_id)
            )
        connection.execute(
            delete(RoleInvitation).where(RoleInvitation.organization_id == organization_id)
        )
        connection.execute(
            delete(AuthSession).where(
                AuthSession.user_id.in_(
                    select(User.id).where(User.organization_id == organization_id)
                )
            )
        )
        if delete_forensic_data:
            connection.execute(delete(User).where(User.organization_id == organization_id))
        else:
            referenced_user_ids = select(EmailRecord.submitted_by_user_id)
            connection.execute(
                delete(User).where(
                    User.organization_id == organization_id,
                    ~User.id.in_(referenced_user_ids),
                )
            )

        after_counts, after_details = _inventory(connection, organization_id)
        deleted_users = (
            expected_details["default_org_users"]
            if delete_forensic_data
            else expected_details["default_org_users"]
            - expected_details["default_org_users_referenced_by_emails"]
        )
        projected_counts = {
            "alembic_version": expected_counts["alembic_version"],
            "auth_sessions": expected_counts["auth_sessions"] - expected_details["default_org_sessions"],
            "email_records": expected_counts["email_records"]
            - (expected_details["default_org_email_records"] if delete_forensic_data else 0),
            "organizations": expected_counts["organizations"],
            "role_invitations": expected_counts["role_invitations"]
            - expected_details["default_org_invitations"],
            "users": expected_counts["users"] - deleted_users,
        }
        expected_email_records = (
            0 if delete_forensic_data else expected_details["default_org_email_records"]
        )
        expected_users = (
            0
            if delete_forensic_data
            else expected_details["default_org_users_referenced_by_emails"]
        )
        if (
            after_counts != projected_counts
            or after_details["default_org_users"] != expected_users
            or after_details["default_org_sessions"] != 0
            or after_details["default_org_invitations"] != 0
            or after_details["default_org_email_records"] != expected_email_records
            or after_details["default_org_admins"] != 0
        ):
            raise RuntimeError("Post-reset verification failed; transaction rolled back.")
        revision_rows = connection.execute(
            text("SELECT version_num FROM alembic_version ORDER BY version_num")
        ).scalars().all()
        if revision_rows != expected_revisions:
            raise RuntimeError("Alembic revision changed unexpectedly; transaction rolled back.")
        return after_counts, revision_rows


def main() -> None:
    args = parse_args()
    settings = Settings.from_environment()
    database_url = make_url(settings.database_url)
    if database_url.drivername != "mysql+pymysql" or database_url.database != TARGET_DATABASE:
        raise SystemExit(
            f"Refusing to connect: DATABASE_URL must target exactly {TARGET_DATABASE} "
            "using mysql+pymysql."
        )
    try:
        organization_id = uuid.UUID(settings.default_organization_id)
    except ValueError as exc:
        raise SystemExit("DEFAULT_ORGANIZATION_ID is invalid; no database changes were made.") from exc

    engine = make_engine(settings.database_url)
    try:
        with engine.connect() as connection:
            if connection.scalar(text("SELECT DATABASE()")) != TARGET_DATABASE:
                raise SystemExit("Connected database name does not match; reset refused.")
            counts, details = _inventory(connection, organization_id)
            revisions_before = connection.execute(
                text("SELECT version_num FROM alembic_version ORDER BY version_num")
            ).scalars().all()
            if not details["default_organization_exists"]:
                raise SystemExit("Configured default organization is missing; reset refused.")
            if not revisions_before:
                raise SystemExit("Alembic revision is missing; reset refused.")

        _print_inventory(counts, details, args.delete_forensic_data)
        if args.dry_run:
            print("Dry run only; no backup or database changes were made.")
            return
        print("Stop the FastAPI application and background workers before resetting.")
        if details["cross_org_email_references"] or details["cross_org_invitation_references"]:
            raise SystemExit(
                "Default-organization users are referenced by another organization's "
                "forensic or invitation data; no reset was performed."
            )
        if (
            not args.delete_forensic_data
            and details["default_org_admins_referenced_by_emails"]
        ):
            raise SystemExit(
                "A default-organization administrator owns preserved forensic data. "
                "Review the data and use --delete-forensic-data only if its deletion "
                "is explicitly authorized."
            )
        _confirm(details, args.delete_forensic_data)
        _create_backup(database_url, _backup_directory(args.backup_dir))
        after_counts, revisions_after = _perform_reset(
            engine,
            organization_id,
            counts,
            details,
            revisions_before,
            args.delete_forensic_data,
        )
        print("Reset completed. Preserved all organization records and Alembic migration history.")
        print(f"Alembic revision preserved: {', '.join(revisions_after)}")
        print("Post-reset table counts:")
        for table_name, count in after_counts.items():
            print(f"  {table_name}: {count}")
        print(
            "Verify the migration state from the backend directory with: "
            "python -m alembic current"
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
