"""STAGE DUCK API 서버. 실행: uvicorn app.main:app --reload (backend 폴더에서)."""
from fastapi import APIRouter, FastAPI

from app.admin import setup_admin
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.dev.router import router as dev_router


def create_app() -> FastAPI:
    app = FastAPI(title="STAGE DUCK API", version="0.1.0")
    register_error_handlers(app)

    api = APIRouter(prefix="/api/v1")

    @api.get("/health", tags=["common"])
    def health() -> dict:
        return {"status": "ok", "env": get_settings().app_env, "simulation": True}

    if get_settings().is_test_env:  # AC-F1-16: 시연 계정 전환은 테스트 환경에서만
        api.include_router(dev_router)
    app.include_router(api)
    setup_admin(app)
    return app


app = create_app()
