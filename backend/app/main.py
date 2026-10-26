from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.db import make_engine, make_session_factory
from app.models import Base
from app.prediction import EmailPredictionService
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.emails import router as emails_router
from app.security import LoginRateLimiter


def create_app(settings: Settings | None = None, engine=None) -> FastAPI:
    configured = settings or Settings.from_environment()
    database_engine = engine or make_engine(configured.database_url)
    session_factory = make_session_factory(database_engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        if engine is None:
            database_engine.dispose()

    application = FastAPI(title="EmailTraceX Authentication API", version="0.1.0", lifespan=lifespan)
    application.state.settings = configured
    application.state.engine = database_engine
    application.state.session_factory = session_factory
    default_model_path = Path(__file__).resolve().parents[1] / "artifacts" / "phishing-email-v1.joblib"
    application.state.prediction_service = EmailPredictionService(
        Path(os.getenv("EMAIL_MODEL_PATH", str(default_model_path)))
    )
    application.state.login_limiter = LoginRateLimiter(
        configured.login_rate_limit,
        configured.login_rate_window_seconds,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(configured.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    application.include_router(auth_router)
    application.include_router(admin_router)
    application.include_router(emails_router)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
