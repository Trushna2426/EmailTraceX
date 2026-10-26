from getpass import getpass
import uuid

from sqlalchemy import select

from app.config import Settings
from app.db import make_engine, make_session_factory
from app.models import AccountStatus, Organization, User, UserRole
from app.schemas import normalize_email
from app.security import MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, hash_password


def main() -> None:
    settings = Settings.from_environment()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    email = normalize_email(input("Administrator email: "))
    full_name = input("Administrator full name: ").strip()
    password = getpass(f"Administrator password ({MIN_PASSWORD_LENGTH}+ characters): ")
    confirmation = getpass("Confirm password: ")
    if len(full_name) < 2:
        raise SystemExit("Full name must contain at least 2 characters")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise SystemExit(f"Password must not exceed {MAX_PASSWORD_BYTES} UTF-8 bytes")
    if password != confirmation:
        raise SystemExit("Passwords do not match")

    with session_factory() as db:
        organization_id = uuid.UUID(settings.default_organization_id)
        organization = db.get(Organization, organization_id)
        if organization is None:
            raise SystemExit("Default organization missing; run alembic upgrade head first")
        existing_admin = db.scalar(
            select(User.id).where(
                User.organization_id == organization_id,
                User.role == UserRole.organization_admin,
            )
        )
        if existing_admin is not None:
            raise SystemExit(
                "An organization administrator already exists; provision additional admins "
                "through the authenticated /api/admin/role-assignments endpoint."
            )
        existing = db.scalar(select(User).where(User.email == email))
        if existing:
            raise SystemExit("That email already has an account; use protected role provisioning")
        db.add(
            User(
                full_name=full_name,
                email=email,
                password_hash=hash_password(password),
                role=UserRole.organization_admin,
                account_status=AccountStatus.active,
                organization_id=organization_id,
            )
        )
        db.commit()
    print(f"Organization administrator account created for {email}")
    engine.dispose()


if __name__ == "__main__":
    main()
