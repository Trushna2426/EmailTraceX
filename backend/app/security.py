import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from threading import Lock

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import HTTPException, Request, status

password_hasher = PasswordHasher(type=Type.ID)
_DUMMY_PASSWORD_HASH = password_hasher.hash("not-a-real-user-password")
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_BYTES = 1024


def hash_password(password: str) -> str:
    validate_new_password(password)
    return password_hasher.hash(password)


def validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must not exceed {MAX_PASSWORD_BYTES} UTF-8 bytes")


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def create_csrf_token(secret: str) -> str:
    issued_at = str(int(time.time()))
    nonce = secrets.token_urlsafe(32)
    payload = f"{issued_at}.{nonce}"
    signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def enforce_csrf(request: Request, secret: str, ttl_seconds: int) -> None:
    cookie_token = request.cookies.get("emailtracex_csrf")
    header_token = request.headers.get("x-csrf-token")
    if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")
    try:
        issued_at, nonce, supplied_signature = cookie_token.split(".", 2)
        age_seconds = int(time.time()) - int(issued_at)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed") from None
    payload = f"{issued_at}.{nonce}"
    expected_signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).hexdigest()
    if age_seconds < 0 or age_seconds > ttl_seconds or not secrets.compare_digest(supplied_signature, expected_signature):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")


class LoginRateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self._lock:
            attempts = self._attempts[client_ip]
            while attempts and now - attempts[0] >= self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many login attempts. Try again later.",
                    headers={"Retry-After": str(self.window_seconds)},
                )
            attempts.append(now)


def verify_login_or_dummy(password_hash: str | None, password: str) -> bool:
    return verify_password(password_hash or _DUMMY_PASSWORD_HASH, password) and password_hash is not None
