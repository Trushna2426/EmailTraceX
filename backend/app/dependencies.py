from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import AccountStatus, AuthSession, User, UserRole
from app.security import token_digest


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw_token = request.cookies.get("emailtracex_session")
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    auth_session = db.scalar(
        select(AuthSession)
        .options(joinedload(AuthSession.user).joinedload(User.organization))
        .where(AuthSession.token_hash == token_digest(raw_token))
    )
    now = datetime.now(timezone.utc)
    if auth_session is None or auth_session.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    expires_at = auth_session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now or auth_session.user.account_status != AccountStatus.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return auth_session.user


def require_organization_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.organization_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization administrator required")
    return user
