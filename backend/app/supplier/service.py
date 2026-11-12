"""업체 심사 서비스 (FR-SUP-03). 관리자 화면(SQLAdmin) 액션이 이 함수만 부른다 (plan.md 6.5)."""
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.supplier import Supplier

# 허용되는 심사 상태 전이 (data-model.md 11장)
_ALLOWED = {
    ("PENDING", "APPROVED"),
    ("PENDING", "REJECTED"),
    ("REJECTED", "PENDING"),  # 업체가 고쳐서 재신청
    ("APPROVED", "SUSPENDED"),
    ("SUSPENDED", "APPROVED"),
}


def _require_reason(reason: str | None) -> str:
    if not reason or not reason.strip():
        raise AppError(400, "VALIDATION_FAILED", "사유를 입력해 주세요.", [{"field": "reason", "reason": "필수"}])
    return reason.strip()


def _transition(db: Session, supplier_id: int, to: str, actor_id: int | None, reason: str | None) -> Supplier:
    supplier = db.get(Supplier, supplier_id, with_for_update=True)
    if supplier is None:
        raise not_found()
    if (supplier.review_status, to) not in _ALLOWED:
        raise invalid_state(f"'{supplier.review_status}' 상태에서는 '{to}'(으)로 바꿀 수 없어요.")
    before = supplier.review_status
    supplier.review_status = to
    record_transition(
        db,
        entity_type="supplier",
        entity_id=supplier.id,
        from_status=before,
        to_status=to,
        actor_user_id=actor_id,
        reason=reason,
    )
    return supplier


def approve(db: Session, supplier_id: int, *, actor_id: int | None) -> Supplier:
    """AC-F1-19: 승인되면 3단계 서비스 등록과 공고 목록이 열린다."""
    supplier = _transition(db, supplier_id, "APPROVED", actor_id, None)
    supplier.reject_reason = None
    supplier.approved_at = supplier.approved_at or datetime.now()
    db.commit()
    return supplier


def reject(db: Session, supplier_id: int, *, actor_id: int | None, reason: str | None) -> Supplier:
    """AC-F1-20: 반려 사유가 업체 화면에 보이고 고쳐서 다시 신청할 수 있다."""
    reason = _require_reason(reason)
    supplier = _transition(db, supplier_id, "REJECTED", actor_id, reason)
    supplier.reject_reason = reason
    db.commit()
    return supplier


def resubmit(db: Session, supplier_id: int, *, actor_id: int | None) -> Supplier:
    supplier = _transition(db, supplier_id, "PENDING", actor_id, None)
    db.commit()
    return supplier


def suspend(db: Session, supplier_id: int, *, actor_id: int | None, reason: str | None) -> Supplier:
    reason = _require_reason(reason)
    supplier = _transition(db, supplier_id, "SUSPENDED", actor_id, reason)
    supplier.reject_reason = reason
    db.commit()
    return supplier


def unsuspend(db: Session, supplier_id: int, *, actor_id: int | None) -> Supplier:
    supplier = _transition(db, supplier_id, "APPROVED", actor_id, None)
    supplier.reject_reason = None
    db.commit()
    return supplier


def can_send_quotes(supplier: Supplier) -> bool:
    """AC-F1-15, AC-F4-08: 승인 상태이고 계정이 정지되지 않아야 견적서를 보낼 수 있다."""
    return supplier.review_status == "APPROVED" and supplier.user.status == "ACTIVE"
