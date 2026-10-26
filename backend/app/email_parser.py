import re
from datetime import datetime
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from typing import Any

URL_PATTERN = re.compile(r"""(?i)\bhttps?://[^\s<>"']+""")
BODY_PREVIEW_LIMIT = 5000
URL_LIMIT = 100
AUTH_HEADER_NAMES = {
    "authentication-results",
    "arc-authentication-results",
    "received-spf",
    "dkim-signature",
    "domainkey-signature",
    "x-spf",
    "x-dkim",
    "x-dmarc",
}


def _decode_part(part: Any) -> str:
    try:
        content = part.get_content()
        if isinstance(content, str):
            return content
    except (LookupError, UnicodeError, TypeError):
        pass
    payload = part.get_payload(decode=True)
    if payload is None:
        raw_payload = part.get_payload()
        return raw_payload if isinstance(raw_payload, str) else ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def _header_values(message: Any, name: str) -> list[str]:
    return [str(value) for value in message.get_all(name, [])]


def _parse_date(values: list[str]) -> str | None:
    if not values:
        return None
    try:
        parsed = parsedate_to_datetime(values[0])
    except (TypeError, ValueError, OverflowError):
        return None
    if parsed is None:
        return None
    return parsed.isoformat()


def parse_email(raw_message: bytes) -> dict[str, Any]:
    if not raw_message.strip():
        raise ValueError("The uploaded email is empty.")

    message = BytesParser(policy=policy.default).parsebytes(raw_message)
    header_pairs = [(name, str(value)) for name, value in message.items()]
    headers = [{"name": name, "value": value} for name, value in header_pairs]
    if not headers:
        raise ValueError("No email headers were found; upload a valid .eml message.")

    text_parts: list[str] = []
    html_parts: list[str] = []
    mime_parts: list[dict[str, Any]] = []
    attachments: list[dict[str, Any]] = []
    warnings = [str(defect) for defect in message.defects]

    for part in message.walk():
        warnings.extend(str(defect) for defect in part.defects)
        if part.is_multipart():
            continue
        content_type = part.get_content_type()
        disposition = part.get_content_disposition()
        decoded_payload = part.get_payload(decode=True)
        decoded_size = len(decoded_payload) if decoded_payload is not None else 0
        filename = part.get_filename()
        mime_parts.append({
            "content_type": content_type,
            "disposition": disposition,
            "filename": filename,
            "decoded_size": decoded_size,
        })
        if filename is not None or disposition == "attachment":
            attachments.append({
                "filename": filename,
                "content_type": content_type,
                "decoded_size": decoded_size,
            })
            continue
        if content_type == "text/plain":
            text_parts.append(_decode_part(part))
        elif content_type == "text/html":
            html_parts.append(_decode_part(part))

    plain_body = "\n".join(value for value in text_parts if value).strip()
    html_source = "\n".join(value for value in html_parts if value)
    urls: list[str] = []
    seen_urls: set[str] = set()
    for content in (plain_body, html_source):
        for match in URL_PATTERN.findall(content):
            url = match.rstrip(".,;:!?)\\]")
            if url and url not in seen_urls:
                seen_urls.add(url)
                urls.append(url)

    date_values = _header_values(message, "Date")
    received = _header_values(message, "Received")
    authentication_headers = [
        {"name": name, "value": value}
        for name, value in header_pairs
        if name.casefold() in AUTH_HEADER_NAMES
        or (name.casefold().startswith("arc-") and "authentication" in name.casefold())
    ]
    if date_values and _parse_date(date_values) is None:
        warnings.append("The Date header is present but is not a valid date.")
    if len(urls) > URL_LIMIT:
        warnings.append(f"URL list truncated to the first {URL_LIMIT} unique URLs.")

    preview = plain_body[:BODY_PREVIEW_LIMIT]
    if len(plain_body) > BODY_PREVIEW_LIMIT:
        warnings.append(f"Plain-text preview truncated to {BODY_PREVIEW_LIMIT} characters.")

    return {
        "overview": {
            "subject": _header_values(message, "Subject"),
            "date": _parse_date(date_values),
            "message_id": _header_values(message, "Message-ID"),
            "return_path": _header_values(message, "Return-Path"),
        },
        "participants": {
            "from": _header_values(message, "From"),
            "to": _header_values(message, "To"),
            "cc": _header_values(message, "Cc"),
            "reply_to": _header_values(message, "Reply-To"),
        },
        "headers": headers,
        "routing": {"received": received},
        "authentication_headers": authentication_headers,
        "mime": {
            "parts": mime_parts,
            "html_available": bool(html_parts),
        },
        "attachments": attachments,
        "urls": urls[:URL_LIMIT],
        "plain_text_preview": preview,
        "plain_text_truncated": len(plain_body) > BODY_PREVIEW_LIMIT,
        "warnings": warnings,
    }
