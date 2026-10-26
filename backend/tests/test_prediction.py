import uuid
from pathlib import Path

import joblib
import pytest
from fastapi.testclient import TestClient
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.models import AccountStatus, EmailRecord, Organization, User, UserRole
from app.prediction import EmailPredictionService, InvalidPredictionInput, ModelUnavailableError
from app.schemas import EmailPredictionResponse
from app.security import hash_password

SYNTHETIC_TEXTS = [
    "urgent verify your account and reset the password now",
    "click here to confirm your account payment details",
    "credential security alert update your login immediately",
    "claim prize now verify account information",
    "team meeting notes and project schedule for next week",
    "hello team please review the quarterly project agenda",
    "meeting minutes and budget planning document",
    "lunch schedule office calendar update",
]
SYNTHETIC_LABELS = [1, 1, 1, 1, 0, 0, 0, 0]
PARSED_EMAIL = {
    "overview": {"subject": ["Urgent account verification"], "date": None, "message_id": [], "return_path": []},
    "participants": {"from": ["security@example.test"], "reply_to": [], "to": [], "cc": []},
    "plain_text_preview": "Please verify your account and reset the password now.",
}


def create_synthetic_model(path):
    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
        ("classifier", LogisticRegression(random_state=42)),
    ])
    pipeline.fit(SYNTHETIC_TEXTS, SYNTHETIC_LABELS)
    joblib.dump({"model_version": "synthetic-test-only", "pipeline": pipeline}, path)


@pytest.fixture
def synthetic_service(tmp_path):
    artifact = tmp_path / "synthetic-model.joblib"
    create_synthetic_model(artifact)
    return EmailPredictionService(artifact)


def test_prediction_requires_valid_nonempty_parsed_text(synthetic_service):
    with pytest.raises(InvalidPredictionInput, match="malformed"):
        synthetic_service.predict(None)
    with pytest.raises(InvalidPredictionInput, match="no text"):
        synthetic_service.predict({
            "overview": {"subject": []},
            "participants": {"from": [], "reply_to": []},
            "plain_text_preview": "",
        })


def test_model_loads_once_and_returns_structured_prediction(synthetic_service):
    first = synthetic_service.predict(PARSED_EMAIL)
    loaded_artifact = synthetic_service._artifact
    second = synthetic_service.predict(PARSED_EMAIL)

    assert synthetic_service._artifact is loaded_artifact
    assert first == second
    assert first["model_version"] == "synthetic-test-only"
    assert first["score_type"] == "uncalibrated_model_score"
    assert first["predicted_class"] in {"phishing", "legitimate", "inconclusive"}
    assert 0 <= first["phishing_score"] <= 1
    assert first["confirmed_finding"] is False
    assert first["explanation"]
    EmailPredictionResponse(**first)


def test_missing_model_artifact_is_explicit(tmp_path):
    service = EmailPredictionService(tmp_path / "missing-model.joblib")
    with pytest.raises(ModelUnavailableError, match="not installed"):
        service.predict(PARSED_EMAIL)


def login_as(client: TestClient, role: UserRole, email: str) -> User:
    password = "temporary-test-password"
    with client.app.state.test_session_factory() as db:
        user = User(
            full_name="Prediction Test User",
            email=client.app.state.test_email(email),
            password_hash=hash_password(password),
            role=role,
            account_status=AccountStatus.active,
            organization_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    response = client.post(
        "/api/auth/login",
        json={"email": client.app.state.test_email(email), "password": password},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    with client.app.state.test_session_factory() as db:
        return db.get(User, user_id)


def add_email_record(client: TestClient, user: User, parsed=PARSED_EMAIL, organization_id=None) -> uuid.UUID:
    with client.app.state.test_session_factory() as db:
        record = EmailRecord(
            organization_id=organization_id or user.organization_id,
            submitted_by_user_id=user.id,
            original_filename="synthetic-test.eml",
            parsed_result=parsed,
        )
        db.add(record)
        db.commit()
        return record.id


def request_prediction(client: TestClient, record_id: uuid.UUID):
    csrf = client.get("/api/auth/csrf").json()["csrf_token"]
    return client.post(
        f"/api/emails/{record_id}/prediction",
        headers={"X-CSRF-Token": csrf},
    )


def test_prediction_api_requires_soc_analyst_authorization(client, synthetic_service):
    client.app.state.prediction_service = synthetic_service
    employee = login_as(client, UserRole.employee, "employee-prediction@example.test")
    record_id = add_email_record(client, employee)

    assert request_prediction(client, record_id).status_code == 403


def test_prediction_api_returns_model_output_for_org_email(client, synthetic_service):
    client.app.state.prediction_service = synthetic_service
    analyst = login_as(client, UserRole.soc_analyst, "analyst-prediction@example.test")
    record_id = add_email_record(client, analyst)

    response = request_prediction(client, record_id)

    assert response.status_code == 200
    data = response.json()
    assert data["model_version"] == "synthetic-test-only"
    assert data["confirmed_finding"] is False
    EmailPredictionResponse(**data)
    listing = client.get("/api/emails")
    saved_record = next(item for item in listing.json()["items"] if item["id"] == str(record_id))
    assert saved_record["prediction"] == data
    with client.app.state.test_session_factory() as db:
        saved = db.get(EmailRecord, record_id)
        assert saved.parsed_result["prediction"] == data


def test_prediction_api_uses_installed_artifact_when_available(client):
    artifact = Path(__file__).resolve().parents[1] / "artifacts" / "phishing-email-v1.joblib"
    if not artifact.is_file():
        pytest.skip("The locally trained model artifact is not installed.")
    client.app.state.prediction_service = EmailPredictionService(artifact)
    analyst = login_as(client, UserRole.soc_analyst, "analyst-installed-model@example.test")
    record_id = add_email_record(client, analyst)

    response = request_prediction(client, record_id)

    assert response.status_code == 200
    data = response.json()
    assert data["model_version"] == "email-phishing-tfidf-v1"
    assert data["score_type"] == "uncalibrated_model_score"
    assert data["explanation"]
    EmailPredictionResponse(**data)


def test_prediction_api_rejects_records_outside_analyst_organization(client, synthetic_service):
    client.app.state.prediction_service = synthetic_service
    analyst = login_as(client, UserRole.soc_analyst, "analyst-scope@example.test")
    other_organization_id = uuid.uuid4()
    with client.app.state.test_session_factory() as db:
        db.add(Organization(id=other_organization_id, name="Other Prediction Test Organization"))
        other_user = User(
            full_name="Other Organization User",
            email=client.app.state.test_email("other-org-prediction@example.test"),
            password_hash=hash_password("temporary-test-password"),
            role=UserRole.employee,
            account_status=AccountStatus.active,
            organization_id=other_organization_id,
        )
        db.add(other_user)
        db.flush()
        other_record = EmailRecord(
            organization_id=other_organization_id,
            submitted_by_user_id=other_user.id,
            original_filename="other-organization.eml",
            parsed_result=PARSED_EMAIL,
        )
        db.add(other_record)
        db.commit()
        record_id = other_record.id

    assert request_prediction(client, record_id).status_code == 404


def test_prediction_api_reports_missing_model_as_unavailable(client, tmp_path):
    client.app.state.prediction_service = EmailPredictionService(tmp_path / "missing-model.joblib")
    analyst = login_as(client, UserRole.soc_analyst, "analyst-missing-model@example.test")
    record_id = add_email_record(client, analyst)

    response = request_prediction(client, record_id)
    assert response.status_code == 503
    listing = client.get("/api/emails")
    saved_record = next(item for item in listing.json()["items"] if item["id"] == str(record_id))
    assert saved_record["prediction"] is None
    assert "model artifact is not installed" in response.json()["detail"]


def test_prediction_api_requires_csrf(client, synthetic_service):
    client.app.state.prediction_service = synthetic_service
    analyst = login_as(client, UserRole.soc_analyst, "analyst-csrf@example.test")
    record_id = add_email_record(client, analyst)

    assert client.post(f"/api/emails/{record_id}/prediction").status_code == 403
