"""관리자 로그인 — users.role = 'ADMIN' 이고 정지되지 않은 계정만 (plan.md 6.5)."""
from sqladmin.authentication import AuthenticationBackend
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request

from app.core.db import SessionLocal
from app.core.security import verify_password
from app.models.user import User

SESSION_KEY = "admin_user_id"


def _check_admin(email: str, password: str) -> int | None:
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).one_or_none()
        if user and user.role == "ADMIN" and user.status == "ACTIVE" and verify_password(password, user.password_hash):
            return user.id
    return None


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        user_id = await run_in_threadpool(_check_admin, str(form.get("username", "")), str(form.get("password", "")))
        if user_id is None:
            return False
        request.session[SESSION_KEY] = user_id
        return True

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        return SESSION_KEY in request.session


def current_admin_id(request: Request) -> int | None:
    return request.session.get(SESSION_KEY)
