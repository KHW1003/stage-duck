"""robots.txt · sitemap.xml · 화면 주소 → head 채운 index.html (specs/seo.md). main.py 에서 맨 마지막에 붙인다."""
from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse, Response
from sqlalchemy.orm import Session
from starlette.routing import Match

from app.core.db import get_db
from app.core.errors import AppError, not_found
from app.seo import service

router = APIRouter(include_in_schema=False)

# 화면이 아닌 주소: API 는 JSON 404 로 둔다
_NOT_SCREENS = ("api/", "ws/", "media/", "assets/")


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots() -> str:
    return service.robots()


@router.get("/sitemap.xml")
def sitemap(db: Session = Depends(get_db)) -> Response:
    return Response(service.sitemap(db), media_type="application/xml")


def _method_not_allowed(request: Request) -> bool:
    """다른 라우트가 주소는 맞고 메서드만 다르면 405 (이 라우트가 모든 메서드를 받아서 생기는 404 를 막는다)."""
    return any(
        r.matches(request.scope)[0] == Match.PARTIAL
        for r in request.app.router.routes
        if getattr(r, "endpoint", None) is not screen
    )


@router.api_route("/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
def screen(path: str, request: Request, db: Session = Depends(get_db)) -> Response:
    if request.method not in ("GET", "HEAD") or path in ("api", "ws") or path.startswith(_NOT_SCREENS):
        if _method_not_allowed(request):
            raise AppError(405, "METHOD_NOT_ALLOWED", "허용하지 않는 요청이에요.")
        raise not_found()
    if path == "admin":  # 관리자 화면(SQLAdmin)은 /admin/ 아래라 여기서 React 404 로 잡히지 않게 넘긴다
        return RedirectResponse("/admin/")
    file = service.static_file(path)
    if file is not None:
        return FileResponse(file)
    body, status = service.render(db, "/" + path)
    return HTMLResponse(body, status_code=status)
