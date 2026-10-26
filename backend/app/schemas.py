import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import AccountStatus, UserRole
from app.security import MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, validate_new_password


def normalize_email(value: str) -> str:
    email = value.strip().casefold()
    if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("Enter a valid email address")
    return email


Password = Annotated[str, Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_BYTES)]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[str, Field(min_length=2, max_length=120)]
    email: str
    password: Password

    @field_validator("full_name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must contain at least 2 characters")
        return cleaned

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        validate_new_password(value)
        return value


class LoginRequest(BaseModel):
    email: str
    password: Annotated[str, Field(min_length=1, max_length=MAX_PASSWORD_BYTES)]
    expected_role: UserRole | None = None

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def limit_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
            raise ValueError(f"Password must not exceed {MAX_PASSWORD_BYTES} UTF-8 bytes")
        return value


class RegistrationResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    account_status: AccountStatus


class InvitationRegistrationRequest(BaseModel):
    full_name: Annotated[str, Field(min_length=2, max_length=120)]
    email: str
    password: Password
    invitation_token: Annotated[str, Field(min_length=32, max_length=128)]

    @field_validator("full_name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must contain at least 2 characters")
        return cleaned

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        validate_new_password(value)
        return value


class InvitationRequest(BaseModel):
    email: str
    role: Literal[UserRole.soc_analyst]

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        return normalize_email(value)


class InvitationResponse(BaseModel):
    email: str
    role: Literal[UserRole.soc_analyst]
    invitation_token: str
    expires_at: datetime


class AuthenticatedUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    role: UserRole
    organization_id: uuid.UUID
    organization_name: str
    account_status: AccountStatus


class EmailPredictionResponse(BaseModel):
    predicted_class: Literal["phishing", "legitimate", "inconclusive"]
    phishing_score: float = Field(ge=0, le=1)
    score_type: Literal["uncalibrated_model_score"]
    model_version: str
    explanation: list[str]
    confirmed_finding: Literal[False]
    review_recommended: bool


class ProvisionRoleRequest(BaseModel):
    email: str
    role: Literal[UserRole.soc_analyst, UserRole.organization_admin]

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        return normalize_email(value)
