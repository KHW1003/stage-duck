"""STAGE DUCK API 서버. 실행: uvicorn app.main:app --reload (backend 폴더에서)."""
from fastapi import APIRouter, FastAPI

from app.admin import setup_admin
from app.core.config import get_settings
from app.core.errors import register_error_handlers


def create_app() -> FastAPI:
    app = FastAPI(title="STAGE DUCK API", version="0.1.0")
    register_error_handlers(app)

    api = APIRouter(prefix="/api/v1")

    @api.get("/health", tags=["common"])
    def health() -> dict:
        return {"status": "ok", "env": get_settings().app_env, "simulation": True}

    app.include_router(api)
    setup_admin(app)
    return app


app = create_app()
