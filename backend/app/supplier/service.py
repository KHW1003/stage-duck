"""업체 심사 서비스 (FR-SUP-03). 관리자 화면(SQLAdmin) 액션이 이 함수만 부른다 (plan.md 6.5)."""
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, time
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.supplier import Supplier, SupplierCategory
from app.models.user import User
from app.models.venue import CONDITION_FIELDS, Venue, VenueEquipment
from app.supplier import calc
from app.supplier.schemas import ApplicationIn, VenueIn

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


def _notify(db: Session, user_id: int, type_: str, link: str, params: dict) -> None:
    """#45 사이트 안 알림 (3번 notification). 함수 안에서 import — 1번 ↔ 3번 순환을 피한다."""
    from app.notification import service as notification

    notification.notify(db, user_id, type_, link=link, params=params)


def approve(db: Session, supplier_id: int, *, actor_id: int | None) -> Supplier:
    """AC-F1-19: 승인되면 3단계 서비스 등록과 공고 목록이 열린다."""
    supplier = _transition(db, supplier_id, "APPROVED", actor_id, None)
    supplier.reject_reason = None
    supplier.approved_at = supplier.approved_at or datetime.now()
    _notify(db, supplier.user_id, "SUPPLIER_APPROVED", "/supplier/profile", {})
    db.commit()
    return supplier


def reject(db: Session, supplier_id: int, *, actor_id: int | None, reason: str | None) -> Supplier:
    """AC-F1-20: 반려 사유가 업체 화면에 보이고 고쳐서 다시 신청할 수 있다."""
    reason = _require_reason(reason)
    supplier = _transition(db, supplier_id, "REJECTED", actor_id, reason)
    supplier.reject_reason = reason
    _notify(db, supplier.user_id, "SUPPLIER_REJECTED", "/supplier/onboarding", {"reason": reason})
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


# ---------------------------------------------------------------------------
# 입점 신청 2단계 (FR-SUP-02) — 업체 본인
# ---------------------------------------------------------------------------


def _checked(body: ApplicationIn) -> calc.ApplicationInput:
    """AC-F1-18: 칸 검사 → 사업자번호 체크섬. 틀리면 저장하지 않고 이유를 돌려준다."""
    data = calc.ApplicationInput(**body.model_dump())
    errors = calc.application_field_errors(data)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    bad_no = calc.business_no_error(data)
    if bad_no:
        raise AppError(400, "INVALID_BUSINESS_NO", calc.BAD_BUSINESS_NO, [bad_no])
    return data


def _fill(supplier: Supplier, data: calc.ApplicationInput) -> None:
    """AC-F1-17: 개인(프리랜서)은 사업자등록번호·사업장 주소를 저장하지 않는다 (보내도 무시)."""
    business = data.business_type != "INDIVIDUAL"
    supplier.business_type = data.business_type
    supplier.company_name = data.company_name.strip()
    supplier.representative_name = data.representative_name.strip()
    supplier.business_reg_no = calc.normalize_business_no(data.business_reg_no.strip()) if business else None
    supplier.business_address = data.business_address.strip() if business else None
    supplier.main_phone = data.main_phone.strip()
    supplier.mail_order_no = (data.mail_order_no or "").strip() or None
    supplier.categories = [SupplierCategory(category=c) for c in data.categories]


def _mine(db: Session, user: User, *, lock: bool = False) -> Supplier | None:
    stmt = select(Supplier).where(Supplier.user_id == user.id)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def apply(db: Session, user: User, body: ApplicationIn) -> Supplier:
    """FR-SUP-02: 입점 신청 → 심사 중(PENDING). 이미 신청했으면 409 (고칠 때는 PUT)."""
    data = _checked(body)
    if _mine(db, user) is not None:
        raise invalid_state("이미 입점을 신청했어요. 신청 내용은 심사 상태 화면에서 확인해 주세요.")
    supplier = Supplier(user_id=user.id, review_status="PENDING")
    _fill(supplier, data)
    db.add(supplier)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()  # 같은 신청이 동시에 두 번 들어온 경우 (suppliers.user_id UNIQUE)
        raise invalid_state("이미 입점을 신청했어요. 신청 내용은 심사 상태 화면에서 확인해 주세요.") from None
    record_transition(
        db, entity_type="supplier", entity_id=supplier.id, from_status=None, to_status="PENDING", actor_user_id=user.id
    )
    db.commit()
    return supplier


def get_application(db: Session, user: User) -> Supplier:
    """AC-F1-20: 내 신청 내용·심사 상태·반려 사유. 아직 신청 전이면 404."""
    supplier = _mine(db, user)
    if supplier is None:
        raise not_found()
    return supplier


def update_application(db: Session, user: User, body: ApplicationIn) -> Supplier:
    """AC-F1-20: 반려된 신청을 고쳐서 다시 신청 → 심사 중. 반려 상태가 아니면 409."""
    data = _checked(body)
    supplier = _mine(db, user, lock=True)
    if supplier is None:
        raise not_found()
    if supplier.review_status != "REJECTED":
        raise invalid_state("반려된 신청만 고쳐서 다시 신청할 수 있어요.")
    _fill(supplier, data)
    _transition(db, supplier.id, "PENDING", user.id, None)
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
    # 기본 제공 장비 [{"category", "name", "quantity"}] — AC-F2-03 (기본 마이크 2개가 확정 공연에 남는다)
    equipment: tuple[Mapping[str, Any], ...] = ()


def get_venue_snapshot(db: Session, venue_id: int) -> VenueSnapshot:
    """[약속 1 → 2] 공간의 지금 조건을 스냅샷으로 돌려준다. 없거나 숨김이면 not_found().

    쓰는 곳: 2번 요청서·배정, 3번 공연장 견적서(quote_versions.venue_snapshot), 4번 CHK-01·03·04·07.
    """
    venue = db.get(Venue, venue_id)
    if venue is None or venue.status != "ACTIVE":
        raise not_found()
    return VenueSnapshot(
        venue_id=venue.id,
        name=venue.name,
        sido=venue.sido,
        sigungu=venue.sigungu,
        venue_type=venue.venue_type,
        max_capacity=venue.max_capacity,
        checkin_time=venue.checkin_time,
        checkout_time=venue.checkout_time,
        has_resident_engineer=venue.has_resident_engineer,
        conditions={f.upper(): getattr(venue, f) for f in CONDITION_FIELDS},
        equipment=tuple({"category": e.category, "name": e.name, "quantity": e.quantity} for e in venue.equipment),
    )


# 공간 등록·수정 (FR-SPACE-01·02) ----------------------------------------------------------------
def _venue_owner(db: Session, user: User) -> Supplier:
    """승인된 공연장 부문 업체만 공간을 다룬다 (api-contract.md S(VENUE))."""
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    if supplier is None or supplier.review_status in ("PENDING", "REJECTED"):
        raise AppError(403, "SUPPLIER_NOT_APPROVED", "입점 심사가 끝난 뒤에 공간을 등록할 수 있어요.")
    if supplier.review_status == "SUSPENDED":
        raise AppError(403, "ACCOUNT_SUSPENDED", "정지된 계정은 공간을 등록할 수 없어요. 고객센터로 문의해 주세요.")
    if "VENUE" not in {c.category for c in supplier.categories}:
        raise AppError(403, "CATEGORY_NOT_APPROVED", "공연장 부문으로 승인받은 업체만 공간을 등록할 수 있어요.")
    return supplier


def _fill_venue(venue: Venue, body: VenueIn) -> None:
    """AC-F2-02: 퇴실이 입실보다 늦어야 한다 (자정 넘김 미지원, data-model.md)."""
    if body.checkout_time <= body.checkin_time:
        raise AppError(400, "VALIDATION_FAILED", "퇴실 마감은 입실 시각보다 늦어야 해요.",
                       [{"field": "checkoutTime", "reason": "입실 시각보다 늦게 넣어 주세요."}])
    for key, value in body.model_dump(exclude={"equipment"}).items():
        setattr(venue, key, value)
    venue.equipment = [VenueEquipment(**e.model_dump()) for e in body.equipment]


def create_venue(db: Session, user: User, body: VenueIn) -> Venue:
    """AC-F2-01·02: 수용 인원 1~500, 퇴실 > 입실이어야 저장된다."""
    venue = Venue(supplier_id=_venue_owner(db, user).id)
    _fill_venue(venue, body)
    db.add(venue)
    db.commit()
    return venue


def my_venues(db: Session, user: User) -> list[Venue]:
    """GET /supplier/venues: 내 공간만 (숨긴 공간도). 승인된 공연장 부문 업체가 아니면 403 (_venue_owner)."""
    supplier = _venue_owner(db, user)
    return list(db.scalars(select(Venue).where(Venue.supplier_id == supplier.id).order_by(Venue.id)))


def _public_venues():
    """누구나 보는 공간: 숨김 아님 + 승인된 업체 (정지 업체 공간은 숨기고, 풀리면 다시 보인다 — D-34와 같은 방식)."""
    return (
        select(Venue, Supplier.company_name)
        .join(Supplier, Supplier.id == Venue.supplier_id)
        .where(Venue.status == "ACTIVE", Supplier.review_status == "APPROVED")
    )


def list_venues(
    db: Session, *, sido: str | None, sigungu: str | None, min_capacity: int | None, venue_type: str | None,
    band_allowed: bool | None, sort: str, page: int, size: int,
) -> tuple[list[tuple[Venue, str]], int]:
    """AC-F5-01: 지역·수용 인원·유형·밴드 가능으로 거른다. bandAllowed=true 는 '가능'만 (미확인 NULL 은 빠진다)."""
    q = _public_venues()
    if sido:
        q = q.where(Venue.sido == sido)
    if sigungu:
        q = q.where(Venue.sigungu == sigungu)
    if min_capacity:
        q = q.where(Venue.max_capacity >= min_capacity)
    if venue_type:
        q = q.where(Venue.venue_type == venue_type)
    if band_allowed is not None:
        q = q.where(Venue.band_allowed.is_(band_allowed))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    order = {
        "fee": (Venue.rental_fee, Venue.id),
        "capacity": (Venue.max_capacity.desc(), Venue.id),
        "views": (Venue.view_count.desc(), Venue.id.desc()),  # 조회수 같으면 최근 등록 먼저
    }.get(sort, (Venue.id,))
    rows = db.execute(q.order_by(*order).offset((page - 1) * size).limit(size)).all()
    return [(v, name) for v, name in rows], total


def supplier_public_venues(db: Session, supplier_id: int) -> list[Venue]:
    """AC-F5-15: 업체 프로필의 등록 공간. 공간 탐색과 같은 기준(_public_venues)."""
    return [v for v, _ in db.execute(_public_venues().where(Venue.supplier_id == supplier_id).order_by(Venue.id)).all()]


def get_public_venue(db: Session, venue_id: int) -> tuple[Venue, str]:
    """공간 상세. 숨김·미승인·정지 업체 공간은 404."""
    row = db.execute(_public_venues().where(Venue.id == venue_id)).first()
    if row is None:
        raise not_found()
    return row[0], row[1]


def count_venue_view(db: Session, venue: Venue) -> None:
    """공간 상세를 열 때마다 조회 수 +1 (11/25). 동시에 열어도 빠지지 않게 DB 에서 더한다."""
    db.execute(update(Venue).where(Venue.id == venue.id).values(view_count=Venue.view_count + 1))
    db.commit()


def update_venue(db: Session, user: User, venue_id: int, body: VenueIn) -> Venue:
    """AC-F2-03: 원본을 고쳐도 이미 보낸 견적서·확정 공연은 venue_snapshot 을 그대로 쓴다. 남의 공간은 404."""
    supplier = _venue_owner(db, user)
    venue = db.get(Venue, venue_id, with_for_update=True)
    if venue is None or venue.supplier_id != supplier.id:
        raise not_found()
    _fill_venue(venue, body)
    db.commit()
    return venue

