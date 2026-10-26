import argparse
from getpass import getpass
from datetime import datetime, timezone
import uuid

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import make_engine, make_session_factory
from app.models import AuthSession, User, UserRole
from app.schemas import normalize_email
from app.security import MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, hash_password

CONFIRMATION_PHRASE = "RESET ADMIN PASSWORD"


def reset_admin_password(
    session_factory: sessionmaker[Session],
    email: str,
    new_password: str,
    confirmation: str,
    confirmation_phrase: str,
    expected_organization_id: str,
) -> None:
    normalized_email = normalize_email(email)
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(new_password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must not exceed {MAX_PASSWORD_BYTES} UTF-8 bytes")
    if new_password != confirmation:
        raise ValueError("Passwords do not match")
    if confirmation_phrase != CONFIRMATION_PHRASE:
        raise ValueError("Confirmation phrase did not match; no changes were made")
    try:
        organization_id = uuid.UUID(expected_organization_id)
    except ValueError as error:
        raise ValueError("Configured default organization ID is invalid") from error

    with session_factory() as db:
        with db.begin():
            user = db.scalar(
                select(User)
                .where(
                    User.email == normalized_email,
                    User.role == UserRole.organization_admin,
                    User.organization_id == organization_id,
                )
                .with_for_update()
            )
            if user is None:
                raise ValueError("No Organization Admin account with that email exists in the configured default organization")
            user.password_hash = hash_password(new_password)
            db.execute(
                update(AuthSession)
                .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
                .values(revoked_at=datetime.now(timezone.utc))
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Locally reset the password for an existing default-organization administrator."
    )
    parser.add_argument("--email", required=True, help="Exact email of the existing Organization Admin account.")
    args = parser.parse_args()

    settings = Settings.from_environment()
    engine = make_engine(settings.database_url)
    try:
        new_password = getpass(f"New password ({MIN_PASSWORD_LENGTH}+ characters): ")
        confirmation = getpass("Confirm new password: ")
        phrase = input(f'Type "{CONFIRMATION_PHRASE}" to confirm this local account recovery: ')
        reset_admin_password(
            make_session_factory(engine),
            args.email,
            new_password,
            confirmation,
            phrase,
            settings.default_organization_id,
        )
    except ValueError as error:
        parser.exit(1, f"Password recovery refused: {error}\n")
    except (OSError, SQLAlchemyError):
        parser.exit(1, "Password recovery failed; no credential material was displayed.\n")
    finally:
        engine.dispose()

    print("Administrator password updated and active sessions revoked.")


if __name__ == "__main__":
    main()
