"""관리자 로그인 — users.role = 'ADMIN' 이고 정지되지 않은 계정만 (plan.md 6.5)."""
import time
from datetime import datetime

from sqladmin.authentication import AuthenticationBackend
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

from app.auth import calc, reset
from app.auth import service as auth_service
from app.auth.tokens import ACCESS_COOKIE, clear_login_cookies, read_access_claims
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.models.user import User

SESSION_KEY = "admin_user_id"
SESSION_AT = "admin_login_at"  # 로그인한 시각(초)


def _check_admin(email: str, password: str) -> tuple[int | None, str | None]:
    """(관리자 id, 로그인 화면에 보일 문구). 비밀번호 검사·5회 잠금은 일반 로그인과 같다 (FR-AUTH-06, plan.md 6.5)."""
    with SessionLocal() as db:
        try:
            user = auth_service.login(db, email, password, now=datetime.now())
        except AppError as e:
            return None, e.message
        return (user.id if user.role == "ADMIN" and user.status == "ACTIVE" else None), None


def _still_admin(user_id: int, issued_at: int) -> bool:
    """지금도 이용 중인 관리자이고, 로그인한 뒤 비밀번호를 바꾸지 않았는지."""
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None or user.role != "ADMIN" or user.status != "ACTIVE":
            return False
        return not calc.refresh_revoked(issued_at, reset.last_reset_at(db, user_id))


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        user_id, request.state.login_error = await run_in_threadpool(
            _check_admin, str(form.get("username", "")), str(form.get("password", ""))
        )
        if user_id is None:
            return False
        request.session.update({SESSION_KEY: user_id, SESSION_AT: int(time.time())})
        return True

    async def logout(self, request: Request) -> Response:
        """사이트 로그인도 끊는다 — 남겨 두면 authenticate 가 바로 다시 들여보낸다."""
        request.session.clear()
        response = RedirectResponse(request.url_for("admin:login"), status_code=302)
        clear_login_cookies(response)
        return response

    async def authenticate(self, request: Request) -> Response | bool:
        """AC-F1-11: 사이트에서 로그인한 관리자는 다시 로그인하지 않는다.

        사이트 쿠키로는 관리자 세션만 만들고 첫 화면으로 보낸다. 요청한 주소를 바로 실행하지 않아 위조 링크로 액션이 돌지 않는다.
        """
        user_id = request.session.get(SESSION_KEY)
        if user_id is not None:
            # 요청마다 다시 본다 — 정지·강등·비밀번호 변경이 바로 반영되게
            if await run_in_threadpool(_still_admin, user_id, request.session.get(SESSION_AT, 0)):
                return True
            request.session.clear()
        if request.method != "GET":
            return False
        claims = read_access_claims(request.cookies.get(ACCESS_COOKIE))
        if claims is None or not await run_in_threadpool(_still_admin, *claims):
            return False
        request.session.update({SESSION_KEY: claims[0], SESSION_AT: claims[1]})
        return RedirectResponse(request.url_for("admin:index"), status_code=302)


def current_admin_id(request: Request) -> int | None:
    return request.session.get(SESSION_KEY)
