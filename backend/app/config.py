import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    app_env: str
    session_ttl_seconds: int
    cookie_secure: bool
    cookie_same_site: Literal["lax", "strict", "none"]
    csrf_ttl_seconds: int
    csrf_secret: str
    login_rate_limit: int
    login_rate_window_seconds: int
    allowed_origins: tuple[str, ...]
    default_organization_id: str
    max_email_upload_bytes: int

    @classmethod
    def from_environment(cls) -> "Settings":
        app_env = os.getenv("APP_ENV", "development").lower()
        cookie_secure_default = app_env == "production"
        same_site = os.getenv("COOKIE_SAME_SITE", "lax").lower()
        if same_site not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAME_SITE must be lax, strict, or none")
        cookie_secure = os.getenv("COOKIE_SECURE", str(cookie_secure_default)).lower() == "true"
        if app_env == "production" and not cookie_secure:
            raise ValueError("COOKIE_SECURE=true is required in production")
        if same_site == "none" and not cookie_secure:
            raise ValueError("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true")
        csrf_secret = os.getenv("CSRF_SECRET", "")
        if app_env == "production" and len(csrf_secret) < 32:
            raise ValueError("CSRF_SECRET must contain at least 32 characters in production")
        if not csrf_secret:
            csrf_secret = secrets.token_urlsafe(48)
        session_ttl = int(os.getenv("SESSION_TTL_SECONDS", "28800"))
        csrf_ttl = int(os.getenv("CSRF_TTL_SECONDS", "3600"))
        rate_limit = int(os.getenv("LOGIN_RATE_LIMIT", "10"))
        rate_window = int(os.getenv("LOGIN_RATE_WINDOW_SECONDS", "60"))
        max_email_upload_bytes = int(os.getenv("MAX_EMAIL_UPLOAD_BYTES", str(5 * 1024 * 1024)))
        if min(session_ttl, csrf_ttl, rate_limit, rate_window, max_email_upload_bytes) <= 0:
            raise ValueError("Session, CSRF, rate-limit, and upload settings must be positive")
        origins = tuple(
            origin.strip()
            for origin in os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if origin.strip()
        )
        return cls(
            database_url=os.getenv(
                "DATABASE_URL",
                "mysql+pymysql://emailtracex:replace-me@127.0.0.1:3306/emailtracex",
            ),
            app_env=app_env,
            session_ttl_seconds=int(os.getenv("SESSION_TTL_SECONDS", "28800")),
            cookie_secure=cookie_secure,
            cookie_same_site=same_site,  # type: ignore[arg-type]
            csrf_ttl_seconds=csrf_ttl,
            csrf_secret=csrf_secret,
            login_rate_limit=rate_limit,
            login_rate_window_seconds=rate_window,
            allowed_origins=origins,
            default_organization_id=os.getenv(
                "DEFAULT_ORGANIZATION_ID",
                "00000000-0000-0000-0000-000000000001",
            ),
            max_email_upload_bytes=max_email_upload_bytes,
        )
