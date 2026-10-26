import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import AccountStatus, AuthSession, User, UserRole
from app.security import hash_password, token_digest, verify_password
from reset_admin_password import CONFIRMATION_PHRASE, reset_admin_password


def add_user(client, email, role, password):
    with client.app.state.test_session_factory() as db:
        user = User(
            full_name="Recovery Test Account",
            email=client.app.state.test_email(email),
            password_hash=hash_password(password),
            role=role,
            account_status=AccountStatus.active,
            organization_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user.id, user.email, user.password_hash


def add_session(client, user_id, raw_token):
    now = datetime.now(timezone.utc)
    with client.app.state.test_session_factory() as db:
        db.add(
            AuthSession(
                user_id=user_id,
                token_hash=token_digest(raw_token),
                created_at=now,
                expires_at=now + timedelta(hours=1),
            )
        )
        db.commit()


def test_reset_updates_only_existing_admin_hash_and_revokes_its_sessions(client):
    admin_id, admin_email, old_admin_hash = add_user(
        client,
        "recoverable-admin@example.test",
        UserRole.organization_admin,
        "old-admin-password",
    )
    employee_id, _, old_employee_hash = add_user(
        client,
        "unchanged-employee@example.test",
        UserRole.employee,
        "employee-password",
    )
    add_session(client, admin_id, "admin-session-token-one")
    add_session(client, admin_id, "admin-session-token-two")
    add_session(client, employee_id, "employee-session-token")

    reset_admin_password(
        client.app.state.test_session_factory,
        admin_email,
        "new-admin-password-123",
        "new-admin-password-123",
        CONFIRMATION_PHRASE,
        "00000000-0000-0000-0000-000000000001",
    )

    with client.app.state.test_session_factory() as db:
        admin = db.get(User, admin_id)
        employee = db.get(User, employee_id)
        admin_sessions = db.scalars(select(AuthSession).where(AuthSession.user_id == admin_id)).all()
        employee_session = db.scalar(select(AuthSession).where(AuthSession.user_id == employee_id))
        assert admin is not None
        assert admin.role == UserRole.organization_admin
        assert admin.password_hash != old_admin_hash
        assert verify_password(admin.password_hash, "new-admin-password-123")
        assert not verify_password(admin.password_hash, "old-admin-password")
        assert employee is not None and employee.password_hash == old_employee_hash
        assert all(session.revoked_at is not None for session in admin_sessions)
        assert employee_session is not None and employee_session.revoked_at is None


def test_reset_refuses_non_admin_without_modifying_account_or_sessions(client):
    employee_id, email, original_hash = add_user(
        client,
        "employee-not-admin@example.test",
        UserRole.employee,
        "employee-password",
    )
    add_session(client, employee_id, "employee-session-token")

    with pytest.raises(ValueError, match="No Organization Admin account"):
        reset_admin_password(
            client.app.state.test_session_factory,
            email,
            "attempted-new-password",
            "attempted-new-password",
            CONFIRMATION_PHRASE,
            "00000000-0000-0000-0000-000000000001",
        )

    with client.app.state.test_session_factory() as db:
        employee = db.get(User, employee_id)
        session = db.scalar(select(AuthSession).where(AuthSession.user_id == employee_id))
        assert employee is not None and employee.password_hash == original_hash
        assert employee.role == UserRole.employee
        assert session is not None and session.revoked_at is None


def test_reset_refuses_wrong_confirmation_before_writing(client):
    admin_id, email, original_hash = add_user(
        client,
        "confirmation-admin@example.test",
        UserRole.organization_admin,
        "old-admin-password",
    )

    with pytest.raises(ValueError, match="Confirmation phrase"):
        reset_admin_password(
            client.app.state.test_session_factory,
            email,
            "new-admin-password-123",
            "new-admin-password-123",
            "no",
            "00000000-0000-0000-0000-000000000001",
        )

    with client.app.state.test_session_factory() as db:
        admin = db.get(User, admin_id)
        assert admin is not None and admin.password_hash == original_hash
