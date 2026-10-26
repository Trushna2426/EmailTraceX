import os
import uuid
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import Base, make_engine, make_session_factory
from app.main import create_app
from app.models import Organization

DEFAULT_ORGANIZATION_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
MYSQL_TEST_REVISION = "0003_role_invitations"


@pytest.fixture
def client(tmp_path):
    use_sqlite = os.getenv("AUTH_TEST_SQLITE", "").lower() in {"1", "true", "yes"}
    mysql_test_url = None if use_sqlite else os.getenv("AUTH_TEST_DATABASE_URL")
    if mysql_test_url:
        parsed_url = urlsplit(mysql_test_url)
        database_name = parsed_url.path.lstrip("/")
        if parsed_url.scheme != "mysql+pymysql" or not database_name.lower().endswith("_test"):
            pytest.fail(
                "AUTH_TEST_DATABASE_URL must use mysql+pymysql and name a dedicated "
                "database ending in _test; no database changes were made."
            )
        engine = make_engine(mysql_test_url)
        if engine.dialect.name != "mysql":
            engine.dispose()
            pytest.fail("AUTH_TEST_DATABASE_URL did not create a MySQL connection.")
        try:
            with engine.connect() as connection:
                if not inspect(connection).has_table("alembic_version"):
                    pytest.fail(
                        "The MySQL test database is not migrated. Run `alembic upgrade head` "
                        "with DATABASE_URL set to the same test database."
                    )
                revision = connection.scalar(text("SELECT version_num FROM alembic_version"))
                if revision != MYSQL_TEST_REVISION:
                    pytest.fail(
                        f"MySQL test database migration revision is {revision!r}; "
                        f"expected {MYSQL_TEST_REVISION!r}. Apply migrations first."
                    )
                organization_exists = connection.scalar(
                    select(Organization.id).where(Organization.id == DEFAULT_ORGANIZATION_ID)
                )
                if organization_exists is None:
                    pytest.fail("Migrated MySQL test database is missing its seeded organization.")
        except Exception:
            engine.dispose()
            raise

        organization_name = "Default Organization"
    else:
        sqlite_url = f"sqlite:///{tmp_path / 'auth-test.sqlite'}"
        engine = make_engine(sqlite_url)
        Base.metadata.create_all(engine)
        organization_name = "Test Organization"

    session_factory = make_session_factory(engine)
    if not mysql_test_url:
        with session_factory() as db:
            db.add(Organization(id=DEFAULT_ORGANIZATION_ID, name=organization_name))
            db.commit()
    settings = Settings(
        database_url=mysql_test_url or f"sqlite:///{tmp_path / 'auth-test.sqlite'}",
        app_env="test",
        session_ttl_seconds=3600,
        cookie_secure=False,
        cookie_same_site="lax",
        csrf_ttl_seconds=3600,
        csrf_secret="test-csrf-secret-with-enough-length-0123456789",
        login_rate_limit=100,
        login_rate_window_seconds=60,
        allowed_origins=("http://testserver",),
        default_organization_id=str(DEFAULT_ORGANIZATION_ID),
        max_email_upload_bytes=5 * 1024 * 1024,
    )
    app = create_app(settings=settings, engine=engine)
    app.state.test_organization_name = organization_name
    test_namespace = uuid.uuid4().hex
    app.state.test_email = lambda email: _unique_test_email(email, test_namespace)
    with TestClient(app) as test_client:
        test_client.app.state.test_session_factory = session_factory
        yield test_client
    engine.dispose()


def _unique_test_email(email: str, suffix: str) -> str:
    local, domain = email.rsplit("@", 1)
    return f"{local}+{suffix}@{domain}"


@pytest.fixture
def csrf_headers(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def create_user(
    client: TestClient,
    *,
    email: str = "member@example.com",
    full_name: str = "Test Member",
    password: str = "correct-horse-battery",
    extra: dict | None = None,
):
    payload = {"full_name": full_name, "email": client.app.state.test_email(email), "password": password}
    if extra:
        payload.update(extra)
    csrf_response = client.get("/api/auth/csrf")
    return client.post(
        "/api/auth/register",
        json=payload,
        headers={"X-CSRF-Token": csrf_response.json()["csrf_token"]},
    )


@pytest.fixture
def registered_employee(client):
    response = create_user(client)
    assert response.status_code == 201
    return response.json()
