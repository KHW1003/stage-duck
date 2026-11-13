"""업체 심사 서비스 (FR-SUP-03). 관리자 화면(SQLAdmin) 액션이 이 함수만 부른다 (plan.md 6.5)."""
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, time

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


# ---------------------------------------------------------------------------
# 묶음 사이 약속 (roles.md 3장, CLAUDE.md 5장) — 1번 → 2번
# 이름·인자·돌려주는 모양을 바꾸려면 쓰는 쪽(2번 해원)과 먼저 합의한다.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class VenueSnapshot:
    """공연장이 확정되는 순간 공연에 복사해 두는 공간 조건 (FR-SPACE-02, data-model.md venues).

    원본 공간을 나중에 고쳐도 이미 확정된 공연은 이 값을 쓴다 (AC-F2-03).
    conditions 의 값: True = 있음/가능, False = 없음/불가, None = 미확인 (CHK-03 에서 `확인 필요`).
    """

    venue_id: int
    name: str
    sido: str
    sigungu: str
    venue_type: str  # CONCERT_HALL · CULTURE_SPACE · ROOFTOP · GARDEN · WAREHOUSE · ETC
    max_capacity: int
    checkin_time: time
    checkout_time: time
    has_resident_engineer: bool
    # 키: BAND_ALLOWED · EXTERNAL_EQUIPMENT_ALLOWED · EXTERNAL_ENGINEER_ALLOWED · HAS_WAITING_ROOM · HAS_STAGE_PLATFORM · HAS_PARKING
    conditions: Mapping[str, bool | None] = field(default_factory=dict)


def get_venue_snapshot(db: Session, venue_id: int) -> VenueSnapshot:
    """[약속 1 → 2] 공간의 지금 조건을 스냅샷으로 돌려준다. 없거나 숨김이면 not_found().

    쓰는 곳: 2번 요청서·배정, 3번 공연장 견적서(quote_versions.venue_snapshot), 4번 CHK-01·03·04·07.
    구현: 1번 세환 — T1-06 (#27).
    """
    raise NotImplementedError("1번 묶음 T1-06(#27)에서 구현한다")

