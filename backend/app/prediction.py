from pathlib import Path
import pickle
from typing import Any, Literal

import joblib
import numpy as np
from sklearn.pipeline import Pipeline

PREDICTION_THRESHOLD_LOW = 0.35
PREDICTION_THRESHOLD_HIGH = 0.65
MAX_PREDICTION_TEXT_LENGTH = 20_000


class ModelUnavailableError(RuntimeError):
    pass


class InvalidPredictionInput(ValueError):
    pass


def _string_values(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def prediction_text(parsed_email: Any) -> str:
    if not isinstance(parsed_email, dict):
        raise InvalidPredictionInput("Stored parsed email data is malformed.")
    overview = parsed_email.get("overview")
    participants = parsed_email.get("participants")
    if not isinstance(overview, dict) or not isinstance(participants, dict):
        raise InvalidPredictionInput("Stored parsed email data is malformed.")
    values = (
        _string_values(overview.get("subject"))
        + _string_values(participants.get("from"))
        + _string_values(participants.get("reply_to"))
        + _string_values(parsed_email.get("plain_text_preview"))
    )
    text = "\n".join(value.strip() for value in values if value.strip())
    if not text:
        raise InvalidPredictionInput("The parsed email has no text available for model analysis.")
    return text[:MAX_PREDICTION_TEXT_LENGTH]


class EmailPredictionService:
    def __init__(self, artifact_path: Path):
        self.artifact_path = artifact_path
        self._artifact: dict[str, Any] | None = None

    def _load_artifact(self) -> dict[str, Any]:
        if self._artifact is not None:
            return self._artifact
        if not self.artifact_path.is_file():
            raise ModelUnavailableError("The phishing model artifact is not installed.")
        try:
            artifact = joblib.load(self.artifact_path)
        except (OSError, EOFError, ValueError, TypeError, KeyError, pickle.UnpicklingError) as error:
            raise ModelUnavailableError("The phishing model artifact could not be loaded.") from error
        if (
            not isinstance(artifact, dict)
            or not isinstance(artifact.get("model_version"), str)
            or not isinstance(artifact.get("pipeline"), Pipeline)
            or not callable(getattr(artifact["pipeline"], "predict_proba", None))
        ):
            raise ModelUnavailableError("The phishing model artifact has an invalid format.")
        classes = artifact["pipeline"].named_steps["classifier"].classes_
        if list(classes) != [0, 1]:
            raise ModelUnavailableError("The phishing model artifact has unexpected label classes.")
        self._artifact = artifact
        return artifact

    @staticmethod
    def _explanation(pipeline: Pipeline, text: str, phishing_score: float) -> list[str]:
        vectorizer = pipeline.named_steps["tfidf"]
        classifier = pipeline.named_steps["classifier"]
        if hasattr(classifier, "coef_"):
            weights = np.asarray(classifier.coef_)[0]
        elif hasattr(classifier, "feature_log_prob_"):
            weights = classifier.feature_log_prob_[1] - classifier.feature_log_prob_[0]
        else:
            return ["The model does not expose feature-level explanation data."]

        vector = vectorizer.transform([text])
        feature_names = vectorizer.get_feature_names_out()
        influences = [
            (float(value * weights[index]), feature_names[index])
            for index, value in zip(vector.indices, vector.data)
        ]
        if phishing_score >= 0.5:
            influences = [item for item in influences if item[0] > 0]
            influences.sort(reverse=True)
        else:
            influences = [item for item in influences if item[0] < 0]
            influences.sort()
        terms = [term for _, term in influences[:5]]
        if not terms:
            return ["No strong text features were available to explain this model score."]
        return ["Text features influencing this model score: " + ", ".join(terms)]

    def predict(self, parsed_email: Any) -> dict[str, Any]:
        text = prediction_text(parsed_email)
        artifact = self._load_artifact()
        pipeline: Pipeline = artifact["pipeline"]
        phishing_index = list(pipeline.named_steps["classifier"].classes_).index(1)
        score = float(pipeline.predict_proba([text])[0][phishing_index])
        prediction: Literal["phishing", "legitimate", "inconclusive"]
        if score >= PREDICTION_THRESHOLD_HIGH:
            prediction = "phishing"
        elif score <= PREDICTION_THRESHOLD_LOW:
            prediction = "legitimate"
        else:
            prediction = "inconclusive"
        return {
            "predicted_class": prediction,
            "phishing_score": score,
            "score_type": "uncalibrated_model_score",
            "model_version": artifact["model_version"],
            "explanation": self._explanation(pipeline, text, score),
            "confirmed_finding": False,
            "review_recommended": prediction == "inconclusive",
        }
