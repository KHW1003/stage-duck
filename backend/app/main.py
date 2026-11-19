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
from app.supplier.router import venue_router
from app.policy.router import router as reports_router
from app.files.router import router as files_router
from app.community.router import extra_router as community_extra_router
from app.community.router import router as community_router
from app.request.router import router as request_router
from app.request.router import me_router as request_me_router, stage_router
from app.board.router import router as board_router
from app.quote.router import postings_router, router as quote_router, stage_quote_router
from app.chat.router import router as chat_router
from app.seo.router import router as seo_router
from app.tech.router import router as tech_router
from app.support.router import inquiry_router
from app.support.router import router as notice_router
from app.check.router import router as compare_router


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
    api.include_router(venue_router)
    api.include_router(reports_router)
    api.include_router(files_router)
    api.include_router(request_router)
    api.include_router(community_router)
    api.include_router(community_extra_router)
    api.include_router(stage_router)
    api.include_router(request_me_router)  # #39 GET /me/posting-limit
    api.include_router(board_router)  # #30 업체 찾기
    api.include_router(quote_router)
    api.include_router(stage_quote_router)
    api.include_router(postings_router)
    api.include_router(chat_router)  # #42 채팅
    api.include_router(tech_router)  # #49 기술 확인
    api.include_router(notice_router)  # #103 공지사항
    api.include_router(inquiry_router)  # #102 1:1 문의
    api.include_router(compare_router)  # #48 견적 비교
    if get_settings().is_test_env:  # AC-F1-16: 시연 계정 전환은 테스트 환경에서만
        api.include_router(dev_router)
    app.include_router(api)
    # 공개 사진 (uploads.md 3장). 비공개 파일은 /media 로 나가지 않는다 — GET /api/v1/files/{id}
    app.mount("/media", StaticFiles(directory=Path(get_settings().upload_dir) / "public", check_dir=False), name="media")
    setup_admin(app)
    # 화면: 빌드된 JS·CSS, 그리고 나머지 주소는 head 를 채운 index.html (specs/seo.md 1장). 반드시 맨 마지막
    app.mount("/assets", StaticFiles(directory=Path(get_settings().frontend_dist) / "assets", check_dir=False), name="assets")
    app.include_router(seo_router)
    return app


app = create_app()
