"""시연 계정 전환 (FR-AUTH-08). APP_ENV=test 에서만 동작한다 (NFR-OPS-01)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import not_found
from app.models.supplier import Supplier
from app.models.user import User


def switch_account(db: Session, user_id: int) -> tuple[User, str | None]:
    """AC-F1-16: 운영 설정이면 라우터가 등록되지 않고, 여기서도 한 번 더 404로 막는다.

    고른 계정과 (업체라면) 심사 상태를 돌려준다. 없거나 탈퇴한 계정은 404.
    """
    if not get_settings().is_test_env:
        raise not_found()
    user = db.get(User, user_id)
    if user is None or user.status == "WITHDRAWN":
        raise not_found()
    review_status = None
    if user.role == "SUPPLIER":
        review_status = db.scalar(select(Supplier.review_status).where(Supplier.user_id == user.id))
    return user, review_status
