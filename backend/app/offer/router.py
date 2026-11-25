"""견적 요청(직접 오퍼)·관심 업체 API (api-contract.md 4.4, 이슈 #32, AC-F3-16~19)."""
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.supplier import Supplier
from app.models.user import User
from app.offer import service
from app.request.service import CATEGORY_STAGE

router = APIRouter(tags=["offer"])

_CFG = ConfigDict(alias_generator=to_camel, populate_by_name=True)


def get_now() -> datetime:
    """지금 시각 (KST 서버 시각). 테스트에서 dependency_overrides 로 고정할 수 있다."""
    return datetime.now()


class OfferIn(BaseModel):
    model_config = _CFG

    supplier_id: int
    message: str | None = Field(default=None, max_length=300)


class OfferOut(BaseModel):
    model_config = _CFG

    offer_id: int
    supplier_id: int
    company_name: str
    status: str
    decline_reason: str | None
    expires_at: datetime
    created_at: datetime


class StageOffersOut(BaseModel):
    model_config = _CFG

    active_count: int
    limit: int
    items: list[OfferOut]


class ReceivedOfferOut(BaseModel):
    model_config = _CFG

    offer_id: int
    stage_id: int
    stage_type: str
    stage_open: bool
    performance_id: int
    title: str
    show_date: date
    sido: str
    sigungu: str
    audience: int
    nickname: str
    message: str | None
    status: str
    decline_reason: str | None
    expires_at: datetime
    created_at: datetime


class DeclineIn(BaseModel):
    reason: Literal["SCHEDULE", "CAPACITY", "REGION", "BUDGET", "ETC"]


class FavoriteIn(BaseModel):
    model_config = _CFG

    supplier_id: int


class FavoriteOut(BaseModel):
    model_config = _CFG

    supplier_id: int
    company_name: str
    categories: list[str]
    stage_types: list[str]  # 이 업체에게 견적을 요청할 수 있는 단계 (VENUE·EQUIPMENT·ENGINEER)
    image_url: str | None = None  # 업체 대표 이미지 (11/25)


def _offer_out(o, company_name: str) -> OfferOut:
    return OfferOut(
        offer_id=o.id, supplier_id=o.supplier_id, company_name=company_name, status=o.status,
        decline_reason=o.decline_reason, expires_at=o.expires_at, created_at=o.created_at,
    )


def _favorite_out(db: Session, s: Supplier) -> FavoriteOut:
    from app.files.service import avatar_url

    cats = sorted(c.category for c in s.categories)
    return FavoriteOut(
        supplier_id=s.id, company_name=s.company_name, categories=cats,
        stage_types=sorted({CATEGORY_STAGE[c] for c in cats}), image_url=avatar_url(db, s.image_file_id),
    )


@router.post("/stages/{stage_id}/offers", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
def send_offer(
    stage_id: int, body: OfferIn, user: User = Depends(require_role("USER")), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> OfferOut:
    """AC-F3-16·17: 열린 단계에 업체 지정 견적 요청 (동시 10곳, 409 OFFER_LIMIT · STAGE_NOT_OPEN)."""
    offer = service.send_offer(db, user, stage_id, body.supplier_id, body.message, now=now)
    return _offer_out(offer, db.get(Supplier, offer.supplier_id).company_name)


@router.get("/stages/{stage_id}/offers", response_model=StageOffersOut)
def stage_offers(
    stage_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> StageOffersOut:
    """내 단계에 보낸 견적 요청과 동시 요청 수 (n / 10곳)."""
    active, rows = service.stage_offers(db, user, stage_id, now=now)
    return StageOffersOut(active_count=active, limit=service.OFFER_LIMIT, items=[_offer_out(o, n) for o, n in rows])


@router.get("/supplier/offers", response_model=list[ReceivedOfferOut])
def received_offers(
    user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> list[ReceivedOfferOut]:
    """받은 견적 요청 (사용자는 닉네임만, 연락처 없음)."""
    return [
        ReceivedOfferOut(
            offer_id=r.offer.id, stage_id=r.offer.stage_id, stage_type=r.stage_type, stage_open=r.stage_open,
            performance_id=r.performance_id, title=r.title, show_date=r.show_date, sido=r.sido, sigungu=r.sigungu,
            audience=r.audience, nickname=r.nickname, message=r.offer.message, status=r.offer.status,
            decline_reason=r.offer.decline_reason, expires_at=r.offer.expires_at, created_at=r.offer.created_at,
        )
        for r in service.received_offers(db, user, now=now)
    ]


@router.post("/offers/{offer_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_offer(
    offer_id: int, body: DeclineIn, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> Response:
    """받은 견적 요청 거절 (사유 선택). 답하기 전만."""
    service.decline_offer(db, user, offer_id, body.reason, now=now)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(user: User = Depends(require_role("USER")), db: Session = Depends(get_db)) -> list[FavoriteOut]:
    """AC-F3-19: 관심 업체 목록 (열린 단계 부문과 맞는 업체를 화면이 골라 "견적을 요청할까요?" 안내)."""
    return [_favorite_out(db, s) for s in service.list_favorites(db, user)]


@router.post("/favorites", status_code=status.HTTP_204_NO_CONTENT)
def add_favorite(body: FavoriteIn, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)) -> Response:
    """AC-F3-16: 관심 업체 저장 (단계가 열리지 않아도 저장할 수 있다)."""
    service.add_favorite(db, user, body.supplier_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/favorites/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(supplier_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)) -> Response:
    service.remove_favorite(db, user, supplier_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
