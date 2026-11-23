"""견적 요청(직접 오퍼)·관심 업체 (FR-OFFER-01~03, AC-F3-16~19, api-contract.md 4.4, 이슈 #32).

규칙
- 사용자 본인 공연의 **지금 열린 단계**에만 보낸다. 닫힌·아직 안 열린 단계는 409 STAGE_NOT_OPEN (AC-F3-16)
- 그 단계 부문의 승인·정상 업체에게만 (부문이 다르면 400, 승인 전·정지면 400)
- 단계당 동시 10곳 (PENDING·QUOTED). 11번째는 409 OFFER_LIMIT — 단계 행을 잠그고 센다 (AC-F3-17)
- 같은 업체에 두 번은 안 된다 (409 INVALID_STATE, UNIQUE (stage_id, supplier_id))
- 48시간 안에 답이 없으면 EXPIRED. 스케줄러 대신 읽고 셀 때 바꾼다 (plan.md 5.7 의 오퍼 만료와 같은 결과)
- 업체가 그 단계에 견적서를 보내면 요청은 QUOTED, 견적서에 offer_id 가 붙어 "내가 요청한 업체" 표시 (AC-F3-18)
- 연락처는 어디에도 넣지 않는다. 사용자는 닉네임만 (CLAUDE.md 20)
알림(#45): 보낼 때 업체에게 OFFER_RECEIVED, 거절하면 사용자에게 OFFER_DECLINED, 만료되면 사용자에게 OFFER_EXPIRED.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.chat.calc import has_contact_pattern
from app.core.errors import AppError, invalid_state, not_found
from app.models.offer import FavoriteSupplier, Offer
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.notification import service as notification
from app.request import service as request_service
from app.supplier import service as supplier_service

OFFER_LIMIT = 10
OFFER_HOURS = 48
ACTIVE = ("PENDING", "QUOTED")
DECLINE_LABEL = {"SCHEDULE": "일정이 맞지 않아요", "CAPACITY": "규모가 맞지 않아요", "REGION": "지역이 맞지 않아요",
                 "BUDGET": "예산이 맞지 않아요", "ETC": "기타"}


def _bad(field: str, reason: str) -> AppError:
    return AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": field, "reason": reason}])


def expire_due(db: Session, now: datetime) -> None:
    """48시간이 지난 PENDING 요청을 EXPIRED 로 바꾸고 사용자에게 OFFER_EXPIRED (#45). 커밋하지 않는다."""
    due = db.execute(
        select(Offer, Supplier.company_name, Stage.performance_id)
        .join(Supplier, Supplier.id == Offer.supplier_id).join(Stage, Stage.id == Offer.stage_id)
        .where(Offer.status == "PENDING", Offer.expires_at <= now).with_for_update(of=Offer)
    ).all()
    for offer, company, performance_id in due:
        offer.status = "EXPIRED"
        notification.notify(
            db, offer.user_id, "OFFER_EXPIRED", link=f"/performances/{performance_id}",
            params={"company": company}, payload={"offerId": offer.id, "performanceId": performance_id},
        )
    db.flush()


def _supplier_stage_types(supplier: Supplier) -> set[str]:
    return {request_service.CATEGORY_STAGE[c.category] for c in supplier.categories}


def _own_stage(db: Session, user: User, stage_id: int, *, lock: bool = False) -> Stage:
    stage = db.get(Stage, stage_id, with_for_update=lock)
    if stage is None or stage.performance.user_id != user.id:
        raise not_found()
    return stage


# ---------------------------------------------------------------------------
# 사용자: 보내기·보낸 목록
# ---------------------------------------------------------------------------


def send_offer(db: Session, user: User, stage_id: int, supplier_id: int, message: str | None, *, now: datetime) -> Offer:
    """AC-F3-16·17: 열린 단계 × 그 부문 승인 업체에게 견적 요청. 단계 행을 잠그고 10곳을 센다."""
    stage = _own_stage(db, user, stage_id, lock=True)
    opened = request_service.get_open_stage(db, stage.performance_id)
    if opened is None or opened.stage_id != stage.id:
        raise AppError(409, "STAGE_NOT_OPEN", "아직 열리지 않은 단계예요. 관심 업체로 저장해 두면 그 단계가 열릴 때 알려 드려요.")
    supplier = db.get(Supplier, supplier_id)
    if supplier is None or not supplier_service.can_send_quotes(supplier):
        raise _bad("supplierId", "지금은 견적을 요청할 수 없는 업체예요.")
    if stage.stage_type not in _supplier_stage_types(supplier):
        raise _bad("supplierId", "이 단계 부문의 업체가 아니에요.")
    text = (message or "").strip() or None
    if text and has_contact_pattern(text):
        raise _bad("message", "전화번호·계좌번호는 적을 수 없어요. 연락처는 결제 뒤 최종 담당표에서 공개돼요.")

    expire_due(db, now)
    if db.scalar(select(Offer.id).where(Offer.stage_id == stage.id, Offer.supplier_id == supplier.id)) is not None:
        raise invalid_state("이미 견적을 요청한 업체예요.")
    count = db.scalar(select(func.count()).select_from(Offer).where(Offer.stage_id == stage.id, Offer.status.in_(ACTIVE)))
    if count >= OFFER_LIMIT:
        raise AppError(409, "OFFER_LIMIT", f"한 단계에 동시에 {OFFER_LIMIT}곳까지 견적을 요청할 수 있어요.")

    offer = Offer(
        stage_id=stage.id, user_id=user.id, supplier_id=supplier.id, status="PENDING", message=text,
        expires_at=now + timedelta(hours=OFFER_HOURS),
    )
    db.add(offer)
    db.flush()
    perf = stage.performance
    notification.notify(
        db, supplier.user_id, "OFFER_RECEIVED", link="/supplier/offers",
        params={"title": perf.title, "date": notification.month_day(perf.show_date)},
        payload={"offerId": offer.id, "stageId": stage.id},
    )
    db.commit()
    return offer


def stage_offers(db: Session, user: User, stage_id: int, *, now: datetime) -> tuple[int, list[tuple[Offer, str]]]:
    """GET /stages/{id}/offers: 내 단계에 보낸 요청 (업체 상호와 함께), 동시 요청 수."""
    stage = _own_stage(db, user, stage_id)
    expire_due(db, now)
    db.commit()
    rows = db.execute(
        select(Offer, Supplier.company_name).join(Supplier, Supplier.id == Offer.supplier_id)
        .where(Offer.stage_id == stage.id).order_by(Offer.id)
    ).all()
    active = sum(1 for o, _ in rows if o.status in ACTIVE)
    return active, [(o, name) for o, name in rows]


# ---------------------------------------------------------------------------
# 업체: 받은 요청·거절
# ---------------------------------------------------------------------------


@dataclass
class ReceivedOffer:
    offer: Offer
    stage_type: str
    stage_open: bool
    performance_id: int
    title: str
    show_date: date
    sido: str
    sigungu: str
    audience: int
    nickname: str


def received_offers(db: Session, user: User, *, now: datetime) -> list[ReceivedOffer]:
    """GET /supplier/offers: 받은 견적 요청 (최근 순). 승인 전 업체는 403."""
    supplier = supplier_service.get_application(db, user)
    if not supplier_service.can_send_quotes(supplier):
        raise AppError(403, "SUPPLIER_NOT_APPROVED", "입점 승인이 끝나면 견적 요청을 받을 수 있어요.")
    expire_due(db, now)
    db.commit()
    rows = db.execute(
        select(Offer, Stage, Performance, User.nickname)
        .join(Stage, Stage.id == Offer.stage_id)
        .join(Performance, Performance.id == Stage.performance_id)
        .join(User, User.id == Offer.user_id)
        .where(Offer.supplier_id == supplier.id)
        .order_by(Offer.id.desc())
    ).all()
    out = []
    for offer, stage, perf, nickname in rows:
        opened = request_service.get_open_stage(db, perf.id)
        out.append(ReceivedOffer(
            offer=offer, stage_type=stage.stage_type, stage_open=opened is not None and opened.stage_id == stage.id,
            performance_id=perf.id, title=perf.title, show_date=perf.show_date, sido=perf.sido, sigungu=perf.sigungu,
            audience=perf.audience, nickname=nickname or "사용자",
        ))
    return out


def decline_offer(db: Session, user: User, offer_id: int, reason: str, *, now: datetime) -> Offer:
    """POST /offers/{id}/decline: 받은 업체 본인만, 답하기 전(PENDING)만. 남의 요청은 404."""
    supplier = supplier_service.get_application(db, user)
    offer = db.get(Offer, offer_id, with_for_update=True)
    if offer is None or offer.supplier_id != supplier.id:
        raise not_found()
    expire_due(db, now)
    db.refresh(offer)
    if offer.status != "PENDING":
        raise invalid_state("이미 답했거나 기한이 지난 요청이에요.")
    offer.status = "DECLINED"
    offer.decline_reason = reason
    stage = db.get(Stage, offer.stage_id)
    notification.notify(
        db, offer.user_id, "OFFER_DECLINED", link=f"/performances/{stage.performance_id}",
        params={"company": supplier.company_name, "reason": DECLINE_LABEL[reason]},
        payload={"offerId": offer.id, "performanceId": stage.performance_id},
    )
    db.commit()
    return offer


def link_quote(db: Session, *, stage_id: int, supplier_id: int, now: datetime) -> int | None:
    """[1 → 3] 업체가 이 단계에 견적서를 보낼 때 부른다 (quote.send_quote). 답 기다리는 요청이 있으면 QUOTED 로 바꾸고 id 를 돌려준다.

    견적서에 offer_id 를 붙이면 사용자 견적 비교에 "내가 요청한 업체" 표시가 된다 (AC-F3-18). 커밋하지 않는다.
    """
    offer = db.scalar(
        select(Offer).where(Offer.stage_id == stage_id, Offer.supplier_id == supplier_id).with_for_update()
    )
    if offer is None:
        return None
    if offer.status == "PENDING" and offer.expires_at <= now:
        offer.status = "EXPIRED"
    if offer.status == "PENDING":
        offer.status = "QUOTED"
    return offer.id if offer.status == "QUOTED" else None


def has_offer(db: Session, user_id: int, supplier_id: int) -> bool:
    """이 사용자가 이 업체에 견적을 요청한 적이 있는가 (개인 프로필 열람, AC-F5-17)."""
    return db.scalar(select(Offer.id).where(Offer.user_id == user_id, Offer.supplier_id == supplier_id).limit(1)) is not None


# ---------------------------------------------------------------------------
# 관심 업체
# ---------------------------------------------------------------------------


def add_favorite(db: Session, user: User, supplier_id: int) -> None:
    """POST /favorites: 승인 업체만 저장. 이미 저장했으면 그대로 (여러 번 눌러도 같다)."""
    supplier = db.get(Supplier, supplier_id)
    if supplier is None or supplier.review_status != "APPROVED":
        raise not_found()
    if db.get(FavoriteSupplier, (user.id, supplier_id)) is None:
        db.add(FavoriteSupplier(user_id=user.id, supplier_id=supplier_id))
        db.commit()


def remove_favorite(db: Session, user: User, supplier_id: int) -> None:
    row = db.get(FavoriteSupplier, (user.id, supplier_id))
    if row is not None:
        db.delete(row)
        db.commit()


def list_favorites(db: Session, user: User) -> list[Supplier]:
    """GET /favorites: 저장한 순 (최근 먼저). 승인이 취소됐거나 정지된 업체는 빼고 보여 준다."""
    rows = db.scalars(
        select(Supplier).join(FavoriteSupplier, FavoriteSupplier.supplier_id == Supplier.id)
        .where(FavoriteSupplier.user_id == user.id).order_by(FavoriteSupplier.created_at.desc(), Supplier.id.desc())
    ).all()
    return [s for s in rows if supplier_service.can_send_quotes(s)]
