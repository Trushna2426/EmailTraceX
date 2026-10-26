import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import Settings
from app.db import get_db
from app.dependencies import get_current_user
from app.models import AccountStatus, AuthSession, Organization, User, UserRole
from app.schemas import (
    AuthenticatedUserResponse,
    InvitationRegistrationRequest,
    LoginRequest,
    RegisterRequest,
    RegistrationResponse,
)
from app.models import RoleInvitation
from app.security import (
    LoginRateLimiter,
    create_opaque_token,
    create_csrf_token,
    enforce_csrf,
    hash_password,
    token_digest,
    verify_login_or_dummy,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])
SESSION_COOKIE = "emailtracex_session"
CSRF_COOKIE = "emailtracex_csrf"
INVALID_CREDENTIALS = "Invalid email or password"
INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60
DUPLICATE_ACCOUNT_DETAIL = (
    "This email already has an account. Sign in or contact an authorized administrator to change access."
)


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _set_cookie(response: Response, settings: Settings, key: str, value: str, *, httponly: bool, max_age: int) -> None:
    response.set_cookie(
        key,
        value,
        max_age=max_age,
        httponly=httponly,
        secure=settings.cookie_secure,
        samesite=settings.cookie_same_site,
        path="/",
    )


def _user_response(user: User) -> AuthenticatedUserResponse:
    return AuthenticatedUserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        organization_id=user.organization_id,
        organization_name=user.organization.name,
        account_status=user.account_status,
    )


@router.get("/csrf")
def issue_csrf_token(request: Request, response: Response) -> dict[str, str]:
    settings = _settings(request)
    token = create_csrf_token(settings.csrf_secret)
    _set_cookie(response, settings, CSRF_COOKIE, token, httponly=True, max_age=settings.csrf_ttl_seconds)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return {"csrf_token": token}


@router.post("/register", response_model=RegistrationResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RegistrationResponse:
    enforce_csrf(request, _settings(request).csrf_secret, _settings(request).csrf_ttl_seconds)
    settings = _settings(request)
    existing_user = db.scalar(select(User.id).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_ACCOUNT_DETAIL)
    organization_id = uuid.UUID(settings.default_organization_id)
    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Default organization is not provisioned. Apply database migrations.",
        )
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.employee,
        account_status=AccountStatus.active,
        organization_id=organization.id,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_ACCOUNT_DETAIL) from None
    db.refresh(user)
    return RegistrationResponse(id=user.id, email=user.email, role=UserRole.employee, account_status=user.account_status)


@router.post("/register/invited", response_model=RegistrationResponse, status_code=status.HTTP_201_CREATED)
def register_invited(
    payload: InvitationRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RegistrationResponse:
    settings = _settings(request)
    enforce_csrf(request, settings.csrf_secret, settings.csrf_ttl_seconds)
    invitation = db.scalar(
        select(RoleInvitation)
        .where(RoleInvitation.token_hash == token_digest(payload.invitation_token))
        .with_for_update()
    )
    if invitation is None or invitation.email != payload.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation is invalid or does not match this email.")
    if invitation.consumed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This invitation has already been used.")
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invitation has expired.")
    if invitation.role != UserRole.soc_analyst:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invitation is not for SOC Analyst access.")
    if db.scalar(select(User.id).where(User.email == payload.email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_ACCOUNT_DETAIL)

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=invitation.role,
        account_status=AccountStatus.active,
        organization_id=invitation.organization_id,
    )
    invitation.consumed_at = datetime.now(timezone.utc)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_ACCOUNT_DETAIL) from None
    db.refresh(user)
    return RegistrationResponse(id=user.id, email=user.email, role=user.role, account_status=user.account_status)


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    enforce_csrf(request, _settings(request).csrf_secret, _settings(request).csrf_ttl_seconds)
    request.app.state.login_limiter.check(request)
    user = db.scalar(select(User).where(User.email == payload.email))
    password_valid = verify_login_or_dummy(user.password_hash if user else None, payload.password)
    if not password_valid or user is None or user.account_status != AccountStatus.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS)
    if payload.expected_role is not None and payload.expected_role != user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Selected role does not match this account. Choose the account's assigned role and try again.",
        )
    raw_token = create_opaque_token()
    now = datetime.now(timezone.utc)
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=token_digest(raw_token),
        created_at=now,
        expires_at=now + timedelta(seconds=_settings(request).session_ttl_seconds),
    )
    db.add(auth_session)
    db.commit()
    _set_cookie(
        response,
        _settings(request),
        SESSION_COOKIE,
        raw_token,
        httponly=True,
        max_age=_settings(request).session_ttl_seconds,
    )
    return {"message": "Signed in"}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    enforce_csrf(request, _settings(request).csrf_secret, _settings(request).csrf_ttl_seconds)
    raw_token = request.cookies.get(SESSION_COOKIE)
    if raw_token:
        auth_session = db.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(raw_token)))
        if auth_session and auth_session.revoked_at is None:
            auth_session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/", secure=_settings(request).cookie_secure, httponly=True, samesite=_settings(request).cookie_same_site)
    return {"message": "Signed out"}


@router.get("/me", response_model=AuthenticatedUserResponse)
def me(user: User = Depends(get_current_user)) -> AuthenticatedUserResponse:
    return _user_response(user)


@router.get("/protected")
def protected(user: User = Depends(get_current_user)) -> dict[str, str]:
    return {"message": "Authenticated request accepted", "user_id": str(user.id)}
