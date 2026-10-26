from datetime import datetime, timedelta, timezone
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import AccountStatus, AuthSession, RoleInvitation, User, UserRole
from app.security import LoginRateLimiter, hash_password, token_digest, verify_password
from tests.conftest import create_user


def login(client: TestClient, email="member@example.com", password="correct-horse-battery", expected_role=None):
    csrf_response = client.get("/api/auth/csrf")
    payload = {"email": client.app.state.test_email(email), "password": password}
    if expected_role is not None:
        payload["expected_role"] = expected_role.value if isinstance(expected_role, UserRole) else expected_role
    return client.post(
        "/api/auth/login",
        json=payload,
        headers={"X-CSRF-Token": csrf_response.json()["csrf_token"]},
    )


def test_registration_normalizes_email_and_always_creates_employee(client, csrf_headers):
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "  Sample Employee  ",
            "email": f"  EMPLOYEE+{client.app.state.test_email('employee@example.com').split('+', 1)[1]} ",
            "password": "correct-horse-battery",
        },
        headers=csrf_headers,
    )
    assert response.status_code == 201
    assert response.json()["email"] == client.app.state.test_email("employee@example.com")
    assert response.json()["role"] == "employee"

    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == client.app.state.test_email("employee@example.com")))
        assert user is not None
        assert user.role == UserRole.employee
        assert user.account_status == AccountStatus.active
        assert user.password_hash != "correct-horse-battery"
        assert user.password_hash.startswith("$argon2id$")
        assert verify_password(user.password_hash, "correct-horse-battery")


def test_registration_rejects_duplicate_normalized_email(client, registered_employee):
    with client.app.state.test_session_factory() as db:
        original = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
        assert original is not None
        original_hash = original.password_hash

    response = create_user(client, email=" MEMBER@EXAMPLE.COM ")
    assert response.status_code == 409
    assert "Sign in or contact an authorized administrator" in response.json()["detail"]
    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
        assert user is not None
        assert user.role == UserRole.employee
        assert user.password_hash == original_hash


@pytest.mark.parametrize("role", ["soc_analyst", "organization_admin"])
def test_public_registration_cannot_request_privileged_role(client, role):
    response = create_user(client, email=f"role-{role}@example.com", extra={"role": role})

    assert response.status_code == 422
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/protected").status_code == 401
    with client.app.state.test_session_factory() as db:
        assert db.scalar(select(User.id).where(User.email == client.app.state.test_email(f"role-{role}@example.com"))) is None


def test_registration_rejects_weak_password(client):
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/auth/register",
        json={"full_name": "Weak User", "email": client.app.state.test_email("weak@example.com"), "password": "short"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("password", "expected_status"),
    [
        ("1234567", 422),
        ("12345678", 201),
        ("123456789012", 201),
        ("a" * 300, 201),
    ],
)
def test_registration_password_length_policy(client, password, expected_status):
    response = create_user(
        client,
        email=f"password-{len(password)}-{uuid.uuid4().hex}@example.com",
        password=password,
    )
    assert response.status_code == expected_status
    if expected_status == 201:
        email = response.json()["email"]
        with client.app.state.test_session_factory() as db:
            user = db.scalar(select(User).where(User.email == email))
            assert user is not None and verify_password(user.password_hash, password)


def test_registration_rejects_passwords_over_safe_utf8_byte_limit(client):
    response = create_user(
        client,
        email=f"password-too-long-{uuid.uuid4().hex}@example.com",
        password="é" * 513,
    )
    assert response.status_code == 422


def test_login_and_authenticated_me_returns_trusted_org_and_role(client, registered_employee):
    response = login(client)
    assert response.status_code == 200
    session_token = response.cookies.get("emailtracex_session")
    assert session_token
    session_cookie = next(
        cookie for cookie in response.headers.get_list("set-cookie")
        if cookie.startswith("emailtracex_session=")
    )
    assert "httponly" in session_cookie.lower()
    assert "samesite=lax" in session_cookie.lower()
    assert "secure" not in session_cookie.lower()

    with client.app.state.test_session_factory() as db:
        auth_session = db.scalar(
            select(AuthSession).where(AuthSession.user_id == uuid.UUID(registered_employee["id"]))
        )
        assert auth_session is not None
        assert auth_session.token_hash == token_digest(session_token)
        assert auth_session.token_hash != session_token

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    data = me.json()
    assert data["id"] == registered_employee["id"]
    assert data["email"] == client.app.state.test_email("member@example.com")
    assert data["role"] == "employee"
    assert data["organization_id"] == "00000000-0000-0000-0000-000000000001"
    assert data["account_status"] == "active"
    assert data["organization_name"] == client.app.state.test_organization_name
    assert client.get("/api/auth/protected").status_code == 200


def test_selected_login_role_mismatch_does_not_create_session_or_change_role(client, registered_employee):
    response = login(client, expected_role=UserRole.soc_analyst)

    assert response.status_code == 403
    assert "does not match this account" in response.json()["detail"]
    assert response.cookies.get("emailtracex_session") is None
    assert client.get("/api/auth/me").status_code == 401
    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
        assert user is not None and user.role == UserRole.employee


@pytest.mark.parametrize("role", [UserRole.soc_analyst, UserRole.organization_admin])
def test_authenticated_me_returns_each_privileged_role(client, role):
    email = f"{role.value}@example.com"
    password = "role-test-password-123"
    with client.app.state.test_session_factory() as db:
        db.add(
            User(
                full_name="Role Test User",
                email=client.app.state.test_email(email),
                password_hash=hash_password(password),
                role=role,
                account_status=AccountStatus.active,
                organization_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
            )
        )
        db.commit()

    assert login(client, email=email, password=password).status_code == 200
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["role"] == role.value


def test_invalid_email_and_password_have_same_response(client, registered_employee):
    invalid_password = login(client, password="incorrect-password")
    invalid_email = login(client, email="missing@example.com", password="incorrect-password")
    assert invalid_password.status_code == invalid_email.status_code == 401
    assert invalid_password.json() == invalid_email.json() == {"detail": "Invalid email or password"}


def test_logout_revokes_session(client, registered_employee):
    assert login(client).status_code == 200
    assert client.get("/api/auth/protected").status_code == 200
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    logout_response = client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logout_response.status_code == 200
    logout_cookie = next(
        cookie for cookie in logout_response.headers.get_list("set-cookie")
        if cookie.startswith("emailtracex_session=")
    )
    assert "httponly" in logout_cookie.lower()
    assert "samesite=lax" in logout_cookie.lower()
    assert "max-age=0" in logout_cookie.lower() or "expires=" in logout_cookie.lower()
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/protected").status_code == 401


def test_expired_session_is_rejected(client, registered_employee):
    assert login(client).status_code == 200
    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
        assert user is not None
        auth_session = db.scalar(select(AuthSession).where(AuthSession.user_id == user.id))
        assert auth_session is not None
        auth_session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_state_changing_auth_endpoint_requires_csrf(client):
    response = client.post(
        "/api/auth/register",
        json={"full_name": "No CSRF", "email": client.app.state.test_email("csrf@example.com"), "password": "correct-horse-battery"},
    )
    assert response.status_code == 403


def test_csrf_cookie_is_httponly_and_same_site(client):
    response = client.get("/api/auth/csrf")
    csrf_cookie = next(
        cookie for cookie in response.headers.get_list("set-cookie")
        if cookie.startswith("emailtracex_csrf=")
    )
    assert "httponly" in csrf_cookie.lower()
    assert "samesite=lax" in csrf_cookie.lower()


def test_csrf_token_must_match_the_signed_cookie(client):
    client.get("/api/auth/csrf")
    response = client.post(
        "/api/auth/register",
        json={"full_name": "No CSRF", "email": client.app.state.test_email("csrf-mismatch@example.com"), "password": "correct-horse-battery"},
        headers={"X-CSRF-Token": "attacker-controlled-token"},
    )
    assert response.status_code == 403


def test_protected_route_rejects_anonymous_request(client):
    assert client.get("/api/auth/protected").status_code == 401


def test_login_rate_limit_blocks_excess_attempts(client):
    client.app.state.login_limiter = LoginRateLimiter(limit=2, window_seconds=60)
    responses = []
    for _ in range(3):
        csrf = client.get("/api/auth/csrf").json()["csrf_token"]
        responses.append(client.post(
            "/api/auth/login",
            json={"email": client.app.state.test_email("missing@example.com"), "password": "wrong-password"},
            headers={"X-CSRF-Token": csrf},
        ))
    assert [response.status_code for response in responses] == [401, 401, 429]


@pytest.mark.parametrize("role", [UserRole.employee, UserRole.soc_analyst])
def test_non_admin_cannot_assign_privileged_roles(client, registered_employee, role):
    if role != UserRole.employee:
        with client.app.state.test_session_factory() as db:
            user = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
            assert user is not None
            user.role = role
            db.commit()

    assert login(client).status_code == 200
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/admin/role-assignments",
        json={"email": client.app.state.test_email("member@example.com"), "role": "organization_admin"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 403
    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
        assert user is not None and user.role == role


def test_privileged_role_assignment_requires_org_admin(client, registered_employee):
    with client.app.state.test_session_factory() as db:
        admin = User(
            full_name="Test Administrator",
            email=client.app.state.test_email("admin@example.com"),
            password_hash=hash_password("administrator-secure-password"),
            role=UserRole.organization_admin,
            account_status=AccountStatus.active,
            organization_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        )
        db.add(admin)
        db.commit()
    assert login(client, "admin@example.com", "administrator-secure-password").status_code == 200
    denied_without_csrf = client.post(
        "/api/admin/role-assignments",
        json={"email": client.app.state.test_email("member@example.com"), "role": "soc_analyst"},
    )
    assert denied_without_csrf.status_code == 403

    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/admin/role-assignments",
        json={"email": client.app.state.test_email("member@example.com"), "role": "soc_analyst"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "soc_analyst"
    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == client.app.state.test_email("member@example.com")))
        assert user is not None and user.role == UserRole.soc_analyst


def _create_admin(client, email="admin@example.com", password="administrator-secure-password"):
    with client.app.state.test_session_factory() as db:
        admin = User(
            full_name="Test Administrator",
            email=client.app.state.test_email(email),
            password_hash=hash_password(password),
            role=UserRole.organization_admin,
            account_status=AccountStatus.active,
            organization_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        )
        db.add(admin)
        db.commit()
    assert login(client, email, password).status_code == 200


def _issue_invitation(client, email="analyst@example.com", role="soc_analyst"):
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    return client.post(
        "/api/admin/invitations",
        json={"email": client.app.state.test_email(email), "role": role},
        headers={"X-CSRF-Token": csrf},
    )


def _register_invited(client, email="analyst@example.com", token="invalid-invitation-token-value-123"):
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    return client.post(
        "/api/auth/register/invited",
        json={
            "full_name": "Invited Analyst",
            "email": client.app.state.test_email(email),
            "password": "analyst-secure-password",
            "invitation_token": token,
        },
        headers={"X-CSRF-Token": csrf},
    )


def test_soc_analyst_invitation_requires_authorized_admin(client, registered_employee):
    assert login(client).status_code == 200
    response = _issue_invitation(client)
    assert response.status_code == 403
    assert not response.cookies.get("emailtracex_session")


def test_admin_invitation_provisions_soc_analyst_for_bound_email_and_org(client):
    _create_admin(client)
    response = _issue_invitation(client)
    assert response.status_code == 201
    invitation_data = response.json()
    assert invitation_data["role"] == "soc_analyst"
    assert invitation_data["email"] == client.app.state.test_email("analyst@example.com")
    token = invitation_data["invitation_token"]

    with client.app.state.test_session_factory() as db:
        invitation = db.scalar(select(RoleInvitation).where(RoleInvitation.email == invitation_data["email"]))
        assert invitation is not None
        assert invitation.token_hash == token_digest(token)
        assert invitation.token_hash != token
        assert invitation.organization_id == uuid.UUID("00000000-0000-0000-0000-000000000001")

    created = _register_invited(client, token=token)
    assert created.status_code == 201
    assert created.json()["role"] == "soc_analyst"
    with client.app.state.test_session_factory() as db:
        user = db.scalar(select(User).where(User.email == invitation_data["email"]))
        invitation = db.scalar(select(RoleInvitation).where(RoleInvitation.token_hash == token_digest(token)))
        assert user is not None and user.role == UserRole.soc_analyst
        assert user.organization_id == uuid.UUID("00000000-0000-0000-0000-000000000001")
        assert invitation is not None and invitation.consumed_at is not None

    assert login(client, "analyst@example.com", "analyst-secure-password", UserRole.soc_analyst).status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "soc_analyst"

    reused = _register_invited(client, token=token)
    assert reused.status_code == 409
    assert reused.json()["detail"] == "This invitation has already been used."


def test_invalid_invitation_is_rejected(client):
    response = _register_invited(client)
    assert response.status_code == 400
    assert "invalid" in response.json()["detail"]


def test_invitation_cannot_be_used_for_another_email(client):
    _create_admin(client)
    invitation = _issue_invitation(client).json()
    response = _register_invited(client, email="different@example.com", token=invitation["invitation_token"])
    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]


def test_expired_invitation_is_rejected(client):
    _create_admin(client)
    invitation = _issue_invitation(client).json()
    with client.app.state.test_session_factory() as db:
        saved = db.scalar(
            select(RoleInvitation).where(RoleInvitation.token_hash == token_digest(invitation["invitation_token"]))
        )
        assert saved is not None
        saved.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

    response = _register_invited(client, token=invitation["invitation_token"])
    assert response.status_code == 400
    assert response.json()["detail"] == "This invitation has expired."


def test_wrong_role_invitation_is_rejected(client):
    _create_admin(client)
    token = "administrator-role-invitation-token"
    with client.app.state.test_session_factory() as db:
        db.add(
            RoleInvitation(
                email=client.app.state.test_email("analyst@example.com"),
                token_hash=token_digest(token),
                role=UserRole.organization_admin,
                organization_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                invited_by_user_id=db.scalar(select(User.id).where(User.email == client.app.state.test_email("admin@example.com"))),
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        db.commit()

    response = _register_invited(client, token=token)
    assert response.status_code == 400
    assert response.json()["detail"] == "This invitation is not for SOC Analyst access."
