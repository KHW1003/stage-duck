"""로그인 사용자·역할 의존성 (roles.md 3장 1 → 전원, plan.md 4장).

사용 예:
    @router.post("/performances")
    def create(..., user: User = Depends(require_role("USER")), db: Session = Depends(get_db)): ...

- 역할 검사는 여기서, **소유권 검사는 각 서비스에서 다시** 한다 (CLAUDE.md 6.1).
- 업체 승인·정지 여부는 역할이 아니라 supplier.service.can_send_quotes() 로 본다.
"""
from collections.abc import Callable

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.auth.tokens import read_access_token
from app.core.db import get_db
from app.core.errors import AppError, not_found
from app.models.user import USER_ROLES, User


def unauthenticated() -> AppError:
    return AppError(401, "UNAUTHENTICATED", "로그인이 필요해요. 다시 로그인해 주세요.")


def current_user(access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> User:
    """FR-AUTH-07: 쿠키가 없거나, 위조·만료됐거나, 계정이 없거나 탈퇴했으면 401."""
    user_id = read_access_token(access_token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None or user.status == "WITHDRAWN":
        raise unauthenticated()
    return user


def require_role(*roles: str) -> Callable[..., User]:
    """FR-AUTH-07: 고른 역할만 통과. 다른 역할은 존재 여부를 숨기려고 404 (CLAUDE.md 10)."""
    unknown = set(roles) - set(USER_ROLES)
    if not roles or unknown:
        raise ValueError(f"require_role 에 쓸 수 있는 역할은 {USER_ROLES} 예요: {sorted(unknown)}")

    def _dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise not_found()
        return user

    return _dependency
