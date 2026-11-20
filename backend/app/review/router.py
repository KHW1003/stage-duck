"""공연 후기·평점 API (specs/reviews.md, api-contract.md)."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import current_user, require_role
from app.core.db import get_db
from app.models.user import User
from app.review import service

router = APIRouter(tags=["review"])
_CFG = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


def get_today() -> date:
    return date.today()


def get_now() -> datetime:
    return datetime.now()


class ReviewOut(BaseModel):
    model_config = _CFG
    id: int
    rating: int
    content: str
    created_at: datetime


class StageReviewOut(BaseModel):
    model_config = _CFG
    stage_id: int
    stage_type: str
    supplier_id: int
    company_name: str
    review: ReviewOut | None


class PerformanceReviewsOut(BaseModel):
    model_config = _CFG
    can_write: bool
    items: list[StageReviewOut]


class ReviewIn(BaseModel):
    model_config = _CFG
    stage_id: int
    rating: int
    content: str = Field(max_length=2000)


class PublicReviewOut(BaseModel):
    model_config = _CFG
    id: int
    rating: int
    content: str
    nickname: str
    stage_type: str
    show_month: str
    created_at: datetime


class SupplierReviewsOut(BaseModel):
    model_config = _CFG
    average: float | None
    count: int
    distribution: dict[str, int]
    items: list[PublicReviewOut]
    next_before: int | None


class SummaryOut(BaseModel):
    model_config = _CFG
    supplier_id: int
    average: float
    count: int


@router.get("/performances/{performance_id}/reviews", response_model=PerformanceReviewsOut)
def my_performance_reviews(
    performance_id: int,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
) -> PerformanceReviewsOut:
    can, items = service.performance_reviews(db, user, performance_id, today=today)
    return PerformanceReviewsOut(can_write=can, items=items)


@router.post("/performances/{performance_id}/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def write_review(
    performance_id: int,
    body: ReviewIn,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
    now: datetime = Depends(get_now),
) -> ReviewOut:
    r = service.write(
        db, user, performance_id, stage_id=body.stage_id, rating=body.rating, content=body.content, today=today, now=now
    )
    return ReviewOut.model_validate(r)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(review_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    service.delete(db, user, review_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/suppliers/{supplier_id}/reviews", response_model=SupplierReviewsOut)
def supplier_reviews(
    supplier_id: int, before: int | None = Query(default=None, ge=1), db: Session = Depends(get_db)
) -> SupplierReviewsOut:
    return SupplierReviewsOut(**service.supplier_reviews(db, supplier_id, before=before))


@router.get("/review-summaries", response_model=list[SummaryOut])
def review_summaries(ids: str = Query(max_length=1000), db: Session = Depends(get_db)) -> list[SummaryOut]:
    """목록 카드의 별점: ?ids=1,2,3 (업체 id, 100개까지). 후기가 없는 업체는 빠진다."""
    wanted = [int(x) for x in ids.split(",") if x.strip().isdigit()][:100]
    return [SummaryOut(supplier_id=k, average=a, count=n) for k, (a, n) in service.summary(db, wanted).items()]
