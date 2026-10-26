import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import get_db
from app.dependencies import get_current_user
from app.email_parser import parse_email
from app.models import EmailRecord, User, UserRole
from app.prediction import InvalidPredictionInput, ModelUnavailableError
from app.schemas import EmailPredictionResponse
from app.security import enforce_csrf

router = APIRouter(prefix="/api/emails", tags=["emails"])
ALLOWED_CONTENT_TYPES = {
    "application/octet-stream",
    "application/vnd.ms-outlook",
    "message/rfc822",
    "text/plain",
}
READ_CHUNK_SIZE = 64 * 1024


def _serialize(record: EmailRecord) -> dict[str, Any]:
    parsed = record.parsed_result
    return {
        "id": str(record.id),
        "original_filename": record.original_filename,
        "uploaded_at": record.uploaded_at.isoformat(),
        "submitted_by_user_id": str(record.submitted_by_user_id),
        "parsed": parsed,
        "prediction": parsed.get("prediction"),
    }


def _require_soc_analyst(user: User) -> None:
    if user.role != UserRole.soc_analyst:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SOC Analyst access required",
        )


async def _read_limited_body(request: Request, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > max_bytes:
            raise HTTPException(status_code=413, detail="Email content exceeds the upload size limit.")
        chunks.append(chunk)
    if total_size == 0:
        raise HTTPException(status_code=422, detail="The email content is empty.")
    return b"".join(chunks)


async def _read_limited_upload(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total_size = 0
    while True:
        chunk = await file.read(min(READ_CHUNK_SIZE, max_bytes + 1 - total_size))
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > max_bytes:
            raise HTTPException(status_code=413, detail="Email file exceeds the upload size limit.")
        chunks.append(chunk)
    if total_size == 0:
        raise HTTPException(status_code=422, detail="The uploaded email is empty.")
    return b"".join(chunks)


def _persist_email(db: Session, user: User, raw_email: bytes, filename: str) -> dict[str, Any]:
    try:
        parsed = parse_email(raw_email)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    record = EmailRecord(
        organization_id=user.organization_id,
        submitted_by_user_id=user.id,
        original_filename=filename[:255],
        parsed_result=parsed,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _serialize(record)


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_email(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    _require_soc_analyst(user)
    settings: Settings = request.app.state.settings
    enforce_csrf(request, settings.csrf_secret, settings.csrf_ttl_seconds)
    filename = file.filename or ""
    if not filename.lower().endswith(".eml"):
        raise HTTPException(status_code=415, detail="Upload a file with the .eml extension.")
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported email file content type.")
    try:
        raw_email = await _read_limited_upload(file, settings.max_email_upload_bytes)
    finally:
        await file.close()
    safe_filename = filename.rsplit("\\", 1)[-1].rsplit("/", 1)[-1][:255] or "uploaded.eml"
    return _persist_email(db, user, raw_email, safe_filename)


@router.post("/paste", status_code=status.HTTP_201_CREATED)
async def paste_email(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    _require_soc_analyst(user)
    settings: Settings = request.app.state.settings
    enforce_csrf(request, settings.csrf_secret, settings.csrf_ttl_seconds)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type not in {"text/plain", "message/rfc822"}:
        raise HTTPException(status_code=415, detail="Paste raw email content as text/plain.")
    raw_email = await _read_limited_body(request, settings.max_email_upload_bytes)
    if b"\r\n\r\n" not in raw_email and b"\n\n" not in raw_email:
        raise HTTPException(
            status_code=422,
            detail="A complete raw email with headers and a blank-line separator is required. Body-only text cannot be used for forensic analysis.",
        )
    return _persist_email(db, user, raw_email, "pasted-email")


@router.get("")
def list_emails(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    _require_soc_analyst(user)
    records = db.scalars(
        select(EmailRecord)
        .where(EmailRecord.organization_id == user.organization_id)
        .order_by(desc(EmailRecord.uploaded_at), desc(EmailRecord.id))
        .limit(limit)
        .offset(offset)
    ).all()
    return {"items": [_serialize(record) for record in records], "limit": limit, "offset": offset}


@router.get("/{record_id}")
def get_email(
    record_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    _require_soc_analyst(user)
    record = db.scalar(
        select(EmailRecord).where(
            EmailRecord.id == record_id,
            EmailRecord.organization_id == user.organization_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Email record not found.")
    return _serialize(record)


@router.post("/{record_id}/prediction", response_model=EmailPredictionResponse)
def predict_email(
    record_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EmailPredictionResponse:
    if user.role != UserRole.soc_analyst:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SOC Analyst access required")
    settings: Settings = request.app.state.settings
    enforce_csrf(request, settings.csrf_secret, settings.csrf_ttl_seconds)
    record = db.scalar(
        select(EmailRecord).where(
            EmailRecord.id == record_id,
            EmailRecord.organization_id == user.organization_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email record not found.")
    try:
        result = request.app.state.prediction_service.predict(record.parsed_result)
    except ModelUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except InvalidPredictionInput as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    prediction = EmailPredictionResponse(**result)
    record.parsed_result = {
        **record.parsed_result,
        "prediction": prediction.model_dump(mode="json"),
    }
    db.commit()
    return prediction
