from dataclasses import replace
import uuid

from fastapi.testclient import TestClient
from app.email_parser import parse_email
from app.models import EmailRecord, Organization, User, UserRole
from app.prediction import EmailPredictionService
from tests.conftest import create_user

SIMPLE_EMAIL = (
    b"From: Sender <sender@example.net>\r\n"
    b"To: recipient@example.com\r\n"
    b"Subject: Test message\r\n"
    b"Date: Tue, 01 Oct 2024 10:00:00 +0000\r\n"
    b"Message-ID: <sample@example.net>\r\n"
    b"Received: from mail.example.net\r\n"
    b"Authentication-Results: mx.example; spf=pass\r\n"
    b"\r\n"
    b"Visit https://example.net/path.\r\n"
)


def _login(client: TestClient) -> None:
    create_user(client)
    with client.app.state.test_session_factory() as db:
        user = db.query(User).filter_by(email=client.app.state.test_email("member@example.com")).one()
        user.role = UserRole.soc_analyst
        db.commit()
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/auth/login",
        json={
            "email": client.app.state.test_email("member@example.com"),
            "password": "correct-horse-battery",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200


def _login_employee(client: TestClient) -> None:
    create_user(client)
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/auth/login",
        json={
            "email": client.app.state.test_email("member@example.com"),
            "password": "correct-horse-battery",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200


def _upload(client: TestClient, body: bytes = SIMPLE_EMAIL, name: str = "message.eml"):
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    return client.post(
        "/api/emails/upload",
        files={"file": (name, body, "message/rfc822")},
        headers={"X-CSRF-Token": csrf},
    )


def _paste(client: TestClient, body: bytes = SIMPLE_EMAIL):
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    return client.post(
        "/api/emails/paste",
        content=body,
        headers={"Content-Type": "text/plain; charset=utf-8", "X-CSRF-Token": csrf},
    )


def test_parser_extracts_headers_body_and_urls_without_verdict():
    parsed = parse_email(SIMPLE_EMAIL)
    assert parsed["overview"]["subject"] == ["Test message"]
    assert parsed["participants"]["from"] == ["Sender <sender@example.net>"]
    assert parsed["routing"]["received"] == ["from mail.example.net"]
    assert parsed["authentication_headers"] == [
        {"name": "Authentication-Results", "value": "mx.example; spf=pass"}
    ]
    assert parsed["urls"] == ["https://example.net/path"]
    assert "threat_verdict" not in parsed


def test_parser_handles_duplicate_headers_and_invalid_date():
    raw = (
        b"From: sender@example.net\r\n"
        b"Received: first hop\r\n"
        b"Received: second hop\r\n"
        b"Date: not a date\r\n"
        b"\r\nbody\r\n"
    )
    parsed = parse_email(raw)
    assert parsed["routing"]["received"] == ["first hop", "second hop"]
    assert parsed["overview"]["date"] is None
    assert any("Date header" in warning for warning in parsed["warnings"])


def test_parser_handles_multipart_html_and_attachment_without_saving():
    raw = (
        b"From: sender@example.net\r\n"
        b"Subject: multipart\r\n"
        b"Content-Type: multipart/mixed; boundary=trace\r\n"
        b"\r\n"
        b"--trace\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPlain https://plain.example\r\n"
        b"--trace\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<a href=\"https://html.example\">open</a>\r\n"
        b"--trace\r\nContent-Type: application/octet-stream; name=\"sample.bin\"\r\n"
        b"Content-Disposition: attachment; filename=\"sample.bin\"\r\n"
        b"Content-Transfer-Encoding: base64\r\n\r\nAQID\r\n"
        b"--trace--\r\n"
    )
    parsed = parse_email(raw)
    assert parsed["plain_text_preview"] == "Plain https://plain.example"
    assert parsed["mime"]["html_available"] is True
    assert parsed["urls"] == ["https://plain.example", "https://html.example"]
    assert parsed["attachments"] == [
        {"filename": "sample.bin", "content_type": "application/octet-stream", "decoded_size": 3}
    ]


def test_parser_decodes_encoded_subject():
    parsed = parse_email(
        b"From: sender@example.net\r\nSubject: =?utf-8?b?SGVsbMO2?=\r\n\r\nbody\r\n"
    )
    assert parsed["overview"]["subject"] == ["Hellö"]


def test_parser_does_not_expose_html_as_plain_body():
    raw = (
        b"From: sender@example.net\r\n"
        b"Content-Type: text/html; charset=utf-8\r\n\r\n"
        b"<script>doNotRun()</script><a href=\"https://hostile.example\">Link</a>"
    )
    parsed = parse_email(raw)
    assert parsed["plain_text_preview"] == ""
    assert parsed["mime"]["html_available"] is True
    assert parsed["urls"] == ["https://hostile.example"]


def test_parser_rejects_empty_and_headerless_content():
    for raw in (b"", b"just plain text without message headers"):
        try:
            parse_email(raw)
        except ValueError:
            continue
        raise AssertionError("Malformed or empty message should be rejected")


def test_upload_requires_authentication(client):
    response = _upload(client)
    assert response.status_code == 401


def test_upload_requires_csrf(client):
    _login(client)
    response = client.post(
        "/api/emails/upload",
        files={"file": ("message.eml", SIMPLE_EMAIL, "message/rfc822")},
    )
    assert response.status_code == 403


def test_upload_parses_and_persists_real_result(client):
    _login(client)
    response = _upload(client)
    assert response.status_code == 201
    record = response.json()
    assert record["parsed"]["overview"]["subject"] == ["Test message"]
    assert record["parsed"]["urls"] == ["https://example.net/path"]
    with client.app.state.test_session_factory() as db:
        saved = db.get(EmailRecord, uuid.UUID(record["id"]))
        user = db.query(User).filter_by(email=client.app.state.test_email("member@example.com")).one()
        assert saved is not None
        assert saved.organization_id == user.organization_id
        assert saved.submitted_by_user_id == user.id


def test_upload_rejects_wrong_extension_and_empty_file(client):
    _login(client)
    assert _upload(client, name="message.txt").status_code == 415
    assert _upload(client, body=b"").status_code == 422


def test_upload_rejects_unsupported_content_type(client):
    _login(client)
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/emails/upload",
        files={"file": ("message.eml", SIMPLE_EMAIL, "application/pdf")},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 415


def test_upload_and_paste_require_soc_analyst_authorization(client):
    _login_employee(client)
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    headers = {"X-CSRF-Token": csrf}
    assert client.post(
        "/api/emails/upload",
        files={"file": ("message.eml", SIMPLE_EMAIL, "message/rfc822")},
        headers=headers,
    ).status_code == 403
    assert client.post(
        "/api/emails/paste",
        content=SIMPLE_EMAIL,
        headers={**headers, "Content-Type": "text/plain"},
    ).status_code == 403


def test_upload_enforces_size_limit(client):
    _login(client)
    client.app.state.settings = replace(client.app.state.settings, max_email_upload_bytes=64)
    response = _upload(client, body=SIMPLE_EMAIL)
    assert response.status_code == 413


def test_paste_parses_and_persists_complete_email(client):
    _login(client)
    response = _paste(client)
    assert response.status_code == 201
    record = response.json()
    assert record["original_filename"] == "pasted-email"
    assert record["parsed"]["overview"]["subject"] == ["Test message"]
    assert record["prediction"] is None
    listing = client.get("/api/emails")
    assert listing.status_code == 200
    assert record["id"] in {item["id"] for item in listing.json()["items"]}


def test_paste_rejects_body_only_and_missing_separator_without_fabricating_headers(client):
    _login(client)
    body_only = _paste(client, b"This is body text only.")
    assert body_only.status_code == 422
    assert "headers" in body_only.json()["detail"]
    no_separator = _paste(client, b"From: sender@example.net\nSubject: missing separator")
    assert no_separator.status_code == 422
    assert client.get("/api/emails").json()["items"] == []


def test_paste_rejects_empty_content_and_enforces_size_limit(client):
    _login(client)
    assert _paste(client, b"").status_code == 422
    client.app.state.settings = replace(client.app.state.settings, max_email_upload_bytes=64)
    assert _paste(client).status_code == 413
    assert client.get("/api/emails").json()["items"] == []


def test_paste_requires_csrf_and_supported_content_type(client):
    _login(client)
    assert client.post("/api/emails/paste", content=SIMPLE_EMAIL).status_code == 403
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/emails/paste",
        content=SIMPLE_EMAIL,
        headers={"Content-Type": "application/json", "X-CSRF-Token": csrf},
    )
    assert response.status_code == 415


def test_pasted_email_remains_in_queue_when_prediction_is_unavailable(client, tmp_path):
    _login(client)
    saved = _paste(client)
    assert saved.status_code == 201
    client.app.state.prediction_service = EmailPredictionService(tmp_path / "missing-model.joblib")
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    prediction = client.post(
        f"/api/emails/{saved.json()['id']}/prediction",
        headers={"X-CSRF-Token": csrf},
    )
    assert prediction.status_code == 503
    listed = client.get("/api/emails")
    queued = next(item for item in listed.json()["items"] if item["id"] == saved.json()["id"])
    assert queued["prediction"] is None
    assert queued["parsed"]["overview"]["subject"] == ["Test message"]


def test_email_listing_and_details_are_scoped_to_authenticated_organization(client):
    _login(client)
    created = _upload(client)
    assert created.status_code == 201
    record_id = created.json()["id"]
    listed = client.get("/api/emails")
    assert listed.status_code == 200
    assert record_id in {item["id"] for item in listed.json()["items"]}
    assert client.get(f"/api/emails/{record_id}").status_code == 200

    other_organization_id = uuid.uuid4()
    with client.app.state.test_session_factory() as db:
        db.add(Organization(id=other_organization_id, name="Other Organization"))
        db.flush()
        other_user = User(
            full_name="Other User",
            email=client.app.state.test_email("other@example.com"),
            password_hash="unused",
            role="employee",
            account_status="active",
            organization_id=other_organization_id,
        )
        db.add(other_user)
        db.flush()
        other_record = EmailRecord(
            organization_id=other_organization_id,
            submitted_by_user_id=other_user.id,
            original_filename="other.eml",
            parsed_result={"overview": {"subject": ["private"]}},
        )
        db.add(other_record)
        db.commit()
        other_record_id = other_record.id
    assert client.get(f"/api/emails/{other_record_id}").status_code == 404
    assert str(other_record_id) not in {item["id"] for item in client.get("/api/emails").json()["items"]}


def test_email_listing_requires_authentication(client):
    assert client.get("/api/emails").status_code == 401


def test_email_listing_requires_soc_analyst_and_returns_empty_items(client):
    _login_employee(client)
    assert client.get("/api/emails").status_code == 403
    _login(client)
    response = client.get("/api/emails")
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_email_listing_supports_pagination_without_omitting_records(client):
    _login(client)
    for index in range(5):
        response = _upload(client, name=f"message-{index}.eml")
        assert response.status_code == 201
    first = client.get("/api/emails?limit=2&offset=0").json()
    second = client.get("/api/emails?limit=2&offset=2").json()
    assert len(first["items"]) == 2
    assert len(second["items"]) == 2
    assert not ({item["id"] for item in first["items"]} & {item["id"] for item in second["items"]})
