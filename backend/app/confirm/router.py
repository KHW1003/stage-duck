"""최종 견적(견적 내역 확인 카드)·확정 API (api-contract.md 4.3, 이슈 #43, AC-F3-09~14)."""
from datetime import datetime

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.confirm import service
from app.core.db import get_db
from app.models.user import User
from app.request import service as request_service
from app.request.router import require_idempotency_key

router = APIRouter(tags=["confirm"])

_CFG = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def get_now() -> datetime:
    """지금 시각 (KST). 테스트에서 dependency_overrides 로 고정한다 (48시간 만료, AC-F3-12)."""
    return datetime.now()


class ConfirmRequestOut(BaseModel):
    model_config = _CFG

    id: int
    room_id: int
    quote_id: int
    quote_version_id: int
    version: int
    current_version: int  # 견적서 지금 버전. version 과 다르면 "새 견적이 있어요" (AC-F3-09)
    label: str
    total_amount: int
    stage_id: int
    stage_type: str
    performance_id: int
    status: str
    expires_at: datetime
    viewed_at: datetime | None
    decided_at: datetime | None
    # 확정(CONFIRMED)된 카드만: 확정 완료 카드의 [다음 단계로] / [통합 결제하기] (AC-F3-14)
    next_stage_type: str | None = None
    checkout_available: bool | None = None


class NextOut(BaseModel):
    model_config = _CFG

    stage_type: str | None
    suggest_skip: bool


class AcceptOut(BaseModel):
    model_config = _CFG

    stage_id: int
    stage_status: str
    confirmed_quote_version_id: int
    performance_id: int
    next: NextOut
    checkout_available: bool  # AC-F3-14: 마지막 필요 단계면 [통합 결제하기]
    card: ConfirmRequestOut


def _out(v: service.CardView, db: Session | None = None) -> ConfirmRequestOut:
    after = (
        request_service.after_confirm(db, v.stage.id, full_spec=v.quote.is_full_spec)
        if db is not None and v.card.status == "CONFIRMED" else None
    )
    return ConfirmRequestOut(
        id=v.card.id, room_id=v.room.id, quote_id=v.quote.id, quote_version_id=v.version.id, version=v.version.version,
        current_version=v.quote.current_version, label=v.quote.label, total_amount=v.version.total_amount,
        stage_id=v.stage.id, stage_type=v.stage.stage_type, performance_id=v.stage.performance_id, status=v.card.status,
        expires_at=v.card.expires_at, viewed_at=v.card.viewed_at, decided_at=v.card.decided_at,
        next_stage_type=after.next_stage_type if after else None,
        checkout_available=after.checkout_available if after else None,
    )


@router.post("/quotes/{quote_id}/confirm-requests", response_model=ConfirmRequestOut, status_code=status.HTTP_201_CREATED)
def send_card(
    quote_id: int, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> ConfirmRequestOut:
    """[최종 견적 보내기]: 지금 버전 고정, 48시간 (AC-F3-09·12). 방당 대기 카드 1장."""
    return _out(service.send_card(db, user, quote_id, now=now))


@router.get("/confirm-requests/{card_id}", response_model=ConfirmRequestOut)
def get_card(
    card_id: int, user: User = Depends(require_role("USER", "SUPPLIER")), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> ConfirmRequestOut:
    """채팅 카드 상태 (그 방 사용자·업체만, 남의 것 404). 48시간이 지났으면 여기서 EXPIRED 로 바뀐다."""
    return _out(service.get_card(db, user, card_id, now=now), db)


@router.post("/confirm-requests/{card_id}/view", response_model=ConfirmRequestOut)
def view_card(
    card_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> ConfirmRequestOut:
    """내역서 열람 기록 (AC-F3-10)."""
    return _out(service.mark_viewed(db, user, card_id, now=now))


@router.post("/confirm-requests/{card_id}/accept", response_model=AcceptOut)
def accept(
    card_id: int, _key: str = Depends(require_idempotency_key), user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> AcceptOut:
    """확정 (AC-F3-10·11·13·14). 같은 카드로 다시 오면 처음 결과 그대로."""
    r = service.accept(db, user, card_id, now=now)
    return AcceptOut(
        stage_id=r.view.stage.id, stage_status=r.view.stage.status, confirmed_quote_version_id=r.view.version.id,
        performance_id=r.view.stage.performance_id,
        next=NextOut(stage_type=r.after.next_stage_type, suggest_skip=r.after.suggest_skip),
        checkout_available=r.after.checkout_available, card=_out(r.view, db),
    )


@router.post("/confirm-requests/{card_id}/renegotiate", response_model=ConfirmRequestOut)
def renegotiate(
    card_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> ConfirmRequestOut:
    """[다시 조율]."""
    return _out(service.renegotiate(db, user, card_id, now=now))
