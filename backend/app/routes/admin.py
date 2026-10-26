from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_db
from app.dependencies import require_organization_admin
from app.models import RoleInvitation, User, UserRole
from app.schemas import InvitationRequest, InvitationResponse, ProvisionRoleRequest
from app.security import create_opaque_token, enforce_csrf, token_digest

router = APIRouter(prefix="/api/admin", tags=["administration"])
INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60


@router.post("/role-assignments")
def assign_privileged_role(
    payload: ProvisionRoleRequest,
    request: Request,
    db: Session = Depends(get_db),
    administrator: User = Depends(require_organization_admin),
) -> dict[str, str]:
    settings: Settings = request.app.state.settings
    enforce_csrf(request, settings.csrf_secret, settings.csrf_ttl_seconds)
    user = db.scalar(
        select(User).where(
            User.email == payload.email,
            User.organization_id == administrator.organization_id,
        )
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization user not found")
    user.role = payload.role
    db.commit()
    return {"email": user.email, "role": user.role.value}


@router.post("/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def create_role_invitation(
    payload: InvitationRequest,
    request: Request,
    db: Session = Depends(get_db),
    administrator: User = Depends(require_organization_admin),
) -> InvitationResponse:
    settings: Settings = request.app.state.settings
    enforce_csrf(request, settings.csrf_secret, settings.csrf_ttl_seconds)
    existing_user = db.scalar(select(User.id).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already has an account. Use role assignment instead of an invitation.",
        )
    token = create_opaque_token()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=INVITATION_TTL_SECONDS)
    db.add(
        RoleInvitation(
            email=payload.email,
            token_hash=token_digest(token),
            role=UserRole.soc_analyst,
            organization_id=administrator.organization_id,
            invited_by_user_id=administrator.id,
            expires_at=expires_at,
        )
    )
    db.commit()
    return InvitationResponse(
        email=payload.email,
        role=UserRole.soc_analyst,
        invitation_token=token,
        expires_at=expires_at,
    )
