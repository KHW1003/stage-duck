"""통합 청구서 API (api-contract.md 6.1, T4-05 #50, AC-F5-03·04). 사용자 본인 공연만."""
from datetime import datetime

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.user import User
from app.payment import service

router = APIRouter(prefix="/performances", tags=["payment"])
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


def get_now() -> datetime:
    """지금 시각. 테스트는 dependency_overrides 로 바꾼다."""
    return datetime.now()


class OrderLineOut(BaseModel):
    model_config = _OUT

    stage_id: int
    stage_type: str
    supplier_id: int
    quote_version_id: int
    amount: int  # 업체 금액 (원, 부가세 포함)


class OrderOut(BaseModel):
    """GET·POST /performances/{id}/order: 업체별 금액, 이용료, 합계. 금액은 모두 서버가 계산한 원 단위 정수."""

    model_config = _OUT

    id: int
    performance_id: int
    status: str
    items_total: int
    platform_fee: int
    total_amount: int
    issued_at: datetime
    paid_at: datetime | None
    lines: list[OrderLineOut]


def _out(db: Session, user: User, performance_id: int) -> OrderOut:
    order, stage_types = service.get_order(db, user, performance_id)
    return OrderOut(
        id=order.id, performance_id=order.performance_id, status=order.status, items_total=order.items_total,
        platform_fee=order.platform_fee, total_amount=order.total_amount, issued_at=order.issued_at, paid_at=order.paid_at,
        lines=[OrderLineOut(stage_id=line.stage_id, stage_type=stage_types[line.stage_id], supplier_id=line.supplier_id,
                            quote_version_id=line.quote_version_id, amount=line.amount) for line in order.lines],
    )


@router.post("/{performance_id}/order", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def issue_order(
    performance_id: int, response: Response, user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> OrderOut:
    """AC-F5-03·04: 통합 청구서 발행. 확정 안 된 단계가 있으면 409 INVALID_STATE. 이미 있으면 그 청구서 (200)."""
    _, created = service.issue_order(db, user, performance_id, now=now)
    if not created:
        response.status_code = status.HTTP_200_OK
    return _out(db, user, performance_id)


@router.get("/{performance_id}/order", response_model=OrderOut)
def get_order(performance_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)) -> OrderOut:
    """AC-F5-03: 내 공연의 통합 청구서. 아직 없으면 404."""
    return _out(db, user, performance_id)
