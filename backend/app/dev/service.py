"""시연 계정 전환 (FR-AUTH-08). APP_ENV=test 에서만 동작한다 (NFR-OPS-01)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import not_found
from app.models.supplier import Supplier
from app.models.user import User

# 시연 계정(사용자·업체 A~G·관리자)은 모두 이 도메인이다 (CLAUDE.md 27). 실제 이메일 회원은 전환하지 않는다.
DEMO_EMAIL_DOMAIN = "@stageduck.test"


def switch_account(db: Session, user_id: int) -> tuple[User, str | None]:
    """AC-F1-16: 운영 설정이면 라우터가 등록되지 않고, 여기서도 한 번 더 404로 막는다.

    고른 계정과 (업체라면) 심사 상태를 돌려준다. 없거나 탈퇴한 계정, 시연 계정이 아닌
    (이메일이 @stageduck.test 로 끝나지 않는) 계정은 404 — 실제 회원의 개인정보가 /me 로 보이지 않게 한다.
    관리자 계정도 404 (11/25 보안 점검): 비밀번호 없이 관리자 권한(비공개 파일 열람 등)을 얻지 못하게.
    관리자 화면(/admin)은 원래 비밀번호 로그인만 받는다.
    """
    if not get_settings().is_test_env:
        raise not_found()
    user = db.get(User, user_id)
    if (user is None or user.status == "WITHDRAWN" or user.role == "ADMIN"
            or not user.email.lower().endswith(DEMO_EMAIL_DOMAIN)):
        raise not_found()
    review_status = None
    if user.role == "SUPPLIER":
        review_status = db.scalar(select(Supplier.review_status).where(Supplier.user_id == user.id))
    return user, review_status
