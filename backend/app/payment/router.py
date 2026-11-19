"""통합 청구서 API (api-contract.md 6.1, T4-05 #50, AC-F5-03·04). 사용자 본인 공연만."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import not_found
from app.models.user import User
from app.payment import service
from app.request.router import require_idempotency_key

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
    ledger_state: str | None  # 결제 전 None · HOLD 보관 중 · SETTLE_SCHEDULED 정산 예정 (AC-F5-07)


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
    ledger = service.ledger_state(db, order.id)
    return OrderOut(
        id=order.id, performance_id=order.performance_id, status=order.status, items_total=order.items_total,
        platform_fee=order.platform_fee, total_amount=order.total_amount, issued_at=order.issued_at, paid_at=order.paid_at,
        lines=[OrderLineOut(stage_id=line.stage_id, stage_type=stage_types[line.stage_id], supplier_id=line.supplier_id,
                            quote_version_id=line.quote_version_id, amount=line.amount,
                            ledger_state=ledger.get(line.supplier_id)) for line in order.lines],
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
    """AC-F5-03·07: 내 공연의 통합 청구서와 장부 상태. 아직 없으면 404."""
    return _out(db, user, performance_id)


# ---- 테스트 결제 (T4-06 #51, AC-F5-05·06) ----
payment_router = APIRouter(tags=["payment"])


class PaymentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    amount: int = Field(ge=0)  # 화면이 보낸 금액 — 서버 계산값과 다르면 400 AMOUNT_MISMATCH
    mock_result: Literal["SUCCESS", "FAIL"] = "SUCCESS"


class PaymentOut(BaseModel):
    model_config = _OUT

    payment_id: int
    status: str  # PENDING · SUCCEEDED · FAILED
    amount: int
    order_status: str


@payment_router.post("/orders/{order_id}/payments", response_model=PaymentOut)
def pay(
    order_id: int, body: PaymentIn, user: User = Depends(require_role("USER")), db: Session = Depends(get_db),
    key: str = Depends(require_idempotency_key), now: datetime = Depends(get_now),
) -> PaymentOut:
    """AC-F5-05·06: 테스트 결제 — 실제 청구되지 않는다. 같은 Idempotency-Key 면 처음 결과 그대로."""
    payment, order = service.pay_order(db, user, order_id, amount=body.amount, mock_result=body.mock_result,
                                       idempotency_key=key[:64], now=now)
    return PaymentOut(payment_id=payment.id, status=payment.status, amount=payment.amount, order_status=order.status)


class MockCallbackIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    provider_tx_id: str = Field(min_length=1, max_length=64)
    result: Literal["SUCCESS", "FAIL"]


@payment_router.post("/payments/mock/callback", status_code=status.HTTP_204_NO_CONTENT)
def mock_callback(body: MockCallbackIn, db: Session = Depends(get_db), now: datetime = Depends(get_now)) -> Response:
    """AC-F5-06: 모의 결제 결과 콜백 (테스트 환경만). 같은 providerTxId 는 한 번만 반영한다."""
    if not get_settings().is_test_env:
        raise not_found()
    service.apply_mock_callback(db, body.provider_tx_id, body.result, now=now)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
