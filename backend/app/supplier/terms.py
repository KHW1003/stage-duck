"""업체 계정의 거래 약관 확인. 버전은 업체 약관:개인정보 처리방침 순."""
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.terms import SupplierTermsReview
from app.models.user import User
from app.supplier import service

TERMS_VERSION = "1.0:1.0"


def review_status(db: Session, user: User) -> bool:
    return db.get(SupplierTermsReview, (user.id, TERMS_VERSION)) is not None


def require_review(db: Session, user: User) -> None:
    if not review_status(db, user):
        raise AppError(409, "SUPPLIER_TERMS_REVIEW_REQUIRED", "업체 거래 약관을 확인한 뒤 진행해 주세요.")


def require_approved(db: Session, user: User) -> None:
    if not service.can_send_quotes(service.get_application(db, user)):
        raise AppError(403, "SUPPLIER_NOT_APPROVED", "입점 승인이 완료되면 거래 약관을 확인할 수 있어요.")


def confirm_review(db: Session, user: User, version: str) -> None:
    if version != TERMS_VERSION:
        raise AppError(409, "SUPPLIER_TERMS_VERSION_CHANGED", "약관이 바뀌었어요. 화면을 새로고침하고 다시 확인해 주세요.")
    # 동시 요청이 같은 계정의 확인 기록을 중복 저장하지 않도록 직렬화한다.
    db.get(User, user.id, with_for_update=True)
    if db.get(SupplierTermsReview, (user.id, version), with_for_update=True) is None:
        db.add(SupplierTermsReview(user_id=user.id, version=version, reviewed_at=datetime.now()))
    db.commit()
