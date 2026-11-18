"""STAGE DUCK API 서버. 실행: uvicorn app.main:app --reload (backend 폴더에서)."""
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.staticfiles import StaticFiles

from app.admin import setup_admin
from app.auth.csrf import CSRFMiddleware
from app.auth.router import me_router
from app.auth.router import router as auth_router
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.dev.router import router as dev_router
from app.supplier.router import router as supplier_router
from app.policy.router import router as reports_router
from app.files.router import router as files_router
from app.request.router import router as request_router
from app.request.router import stage_router
from app.quote.router import router as quote_router, stage_quote_router


def create_app() -> FastAPI:
    app = FastAPI(title="STAGE DUCK API", version="0.1.0")
    register_error_handlers(app)
    app.add_middleware(CSRFMiddleware)  # #24: /api/v1 의 POST·PUT·PATCH·DELETE 는 X-CSRF-Token 필요 (해원 승인)

    api = APIRouter(prefix="/api/v1")

    @api.get("/health", tags=["common"])
    def health() -> dict:
        return {"status": "ok", "env": get_settings().app_env, "simulation": True}

    api.include_router(auth_router)
    api.include_router(me_router)
    api.include_router(supplier_router)
    api.include_router(reports_router)
    api.include_router(files_router)
    api.include_router(request_router)
    api.include_router(stage_router)
    api.include_router(quote_router)
    api.include_router(stage_quote_router)
    if get_settings().is_test_env:  # AC-F1-16: 시연 계정 전환은 테스트 환경에서만
        api.include_router(dev_router)
    app.include_router(api)
    # 공개 사진 (uploads.md 3장). 비공개 파일은 /media 로 나가지 않는다 — GET /api/v1/files/{id}
    app.mount("/media", StaticFiles(directory=Path(get_settings().upload_dir) / "public", check_dir=False), name="media")
    setup_admin(app)
    return app


app = create_app()
