"""통합 청구서 API (api-contract.md 6.1, T4-05 #50, AC-F5-03·04). 사용자 본인 공연만."""
from datetime import date, datetime, time
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import not_found
from app.models.policy import WARNINGS_BEFORE_SUSPENSION
from app.models.user import User
from app.payment import cancel, reservations, service, sheet
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
    company_name: str
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
    payment_deadline: datetime | None = None  # D-57 결제 마감 (결제 전만)
    lines: list[OrderLineOut]


def _out(db: Session, user: User, performance_id: int) -> OrderOut:
    order, stage_types = service.get_order(db, user, performance_id)
    ledger = service.ledger_state(db, order.id)
    names = service.supplier_names(db, [line.supplier_id for line in order.lines])
    return OrderOut(
        id=order.id, performance_id=order.performance_id, status=order.status, items_total=order.items_total,
        platform_fee=order.platform_fee, total_amount=order.total_amount, issued_at=order.issued_at, paid_at=order.paid_at,
        payment_deadline=service.payment_deadline(db, order.performance_id) if order.status == "ISSUED" else None,
        lines=[OrderLineOut(stage_id=line.stage_id, stage_type=stage_types[line.stage_id], supplier_id=line.supplier_id,
                            company_name=names.get(line.supplier_id, ""),
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


# ---- 취소·위약금 (T4-07 #52, AC-F5-08·09·10) ----
class PenaltyShareOut(BaseModel):
    model_config = _OUT

    supplier_id: int
    name: str
    amount: int


class CancelQuoteOut(BaseModel):
    """api-contract.md 6.1 GET /performances/{id}/cancel-quote. 금액은 모두 서버 계산값."""

    model_config = _OUT

    phase: str
    rate_percent: int
    paid: int
    penalty_base: int
    penalty_total: int
    penalty_by_supplier: list[PenaltyShareOut]
    fee_refunded: int
    refund_total: int
    cancellation_id: int | None = None  # 취소했을 때만


def _cancel_out(q: cancel.CancelQuote, cancellation_id: int | None = None) -> CancelQuoteOut:
    a = q.amounts
    return CancelQuoteOut(
        phase=a.phase, rate_percent=a.rate_percent, paid=a.paid, penalty_base=a.penalty_base, penalty_total=a.penalty_total,
        penalty_by_supplier=[PenaltyShareOut(supplier_id=s, name=n, amount=v) for s, n, v in q.by_supplier],
        fee_refunded=a.fee_refunded, refund_total=a.refund_total, cancellation_id=cancellation_id,
    )


class UserCancelIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    phase: str
    rate_percent: int = Field(ge=0, le=100)
    paid: int = Field(ge=0)
    penalty_total: int = Field(ge=0)
    fee_refunded: int = Field(ge=0)
    refund_total: int = Field(ge=0)


class SupplierCancelIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)

    reason: str = Field(min_length=1, max_length=500)


@router.get("/{performance_id}/cancel-quote", response_model=CancelQuoteOut)
def get_cancel_quote(
    performance_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> CancelQuoteOut:
    """AC-F5-08·09: 지금 취소하면 내는 금액·환불 예정액 미리보기."""
    return _cancel_out(cancel.cancel_quote(db, user, performance_id, now=now))


@router.post("/{performance_id}/cancel", response_model=CancelQuoteOut)
def cancel_performance(
    performance_id: int, body: UserCancelIn | None = None, user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> CancelQuoteOut:
    """모의 취소. 확인받은 금액을 보냈다면 접수 직전 계산값과 비교한다."""
    expected = body.model_dump() if body is not None else None
    c, q = cancel.cancel_by_user(db, user, performance_id, now=now, expected=expected)
    return _cancel_out(q, c.id)


@router.post("/{performance_id}/cancel-by-supplier", response_model=CancelQuoteOut)
def cancel_by_supplier(
    performance_id: int, body: SupplierCancelIn, user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> CancelQuoteOut:
    """AC-F5-10: 확정 업체의 사정으로 취소 → 사용자 전액 환불(이용료 포함) + 그 업체 경고 1회."""
    c, q = cancel.cancel_by_supplier(db, user, performance_id, reason=body.reason, now=now)
    return _cancel_out(q, c.id)


# ---- 최종 담당표 (T4-08 #53, AC-F5-11·12) ----
class ScheduleItemOut(BaseModel):
    model_config = _OUT

    time: str
    title: str
    who: str


class ScopeLineOut(BaseModel):
    model_config = _OUT

    stage_type: str
    status: str
    company_name: str | None
    scope: str
    amount: int | None


class ContactOut(BaseModel):
    """결제 뒤에만 채워진다 (CLAUDE.md 20 — 연락처는 이 API와 GET /me 에서만)."""

    model_config = _OUT

    role: str
    name: str
    real_name: str | None
    phone: str
    email: str


class SheetOut(BaseModel):
    model_config = _OUT

    performance_id: int
    title: str
    show_date: date
    sido: str
    sigungu: str
    audience: int
    paid: bool
    paid_at: datetime | None
    schedule: list[ScheduleItemOut]
    lines: list[ScopeLineOut]
    contacts: list[ContactOut]


@router.get("/{performance_id}/sheet", response_model=SheetOut)
def get_sheet(
    performance_id: int, user: User = Depends(require_role("USER", "SUPPLIER")), db: Session = Depends(get_db)
) -> SheetOut:
    """AC-F5-11·12: 사용자와 확정 업체만 (그 밖은 404). 결제 전에는 연락처가 비어 있다."""
    s = sheet.get_sheet(db, user, performance_id)
    p = s.performance
    return SheetOut(
        performance_id=p.id, title=p.title, show_date=p.show_date, sido=p.sido, sigungu=p.sigungu, audience=p.audience,
        paid=s.paid_at is not None, paid_at=s.paid_at,
        schedule=[ScheduleItemOut.model_validate(i) for i in s.schedule],
        lines=[ScopeLineOut.model_validate(i) for i in s.lines],
        contacts=[ContactOut.model_validate(c) for c in s.contacts],
    )


# ---- 테스트 결제 (T4-06 #51, AC-F5-05·06) ----
payment_router = APIRouter(tags=["payment"])


class SupplierReservationOut(BaseModel):
    model_config = _OUT

    performance_id: int
    title: str
    show_date: date
    show_start: time
    show_end: time
    sido: str
    sigungu: str
    status: str
    stage_types: list[str]
    amount: int


@payment_router.get("/supplier/reservations", response_model=list[SupplierReservationOut])
def list_supplier_reservations(
    user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db),
) -> list[reservations.Reservation]:
    return reservations.list_reservations(db, user)


class SupplierWarningsOut(BaseModel):
    model_config = _OUT

    warning_count: int
    suspend_at: int


@payment_router.get("/supplier/warnings", response_model=SupplierWarningsOut)
def get_supplier_warnings(user: User = Depends(require_role("SUPPLIER"))) -> SupplierWarningsOut:
    """AC-F5-10: 업체 사정 취소 확인 창이 "이번 취소로 정지돼요"를 미리 알리도록 지금 경고 수를 준다 (3회째 자동 정지)."""
    return SupplierWarningsOut(warning_count=user.warning_count, suspend_at=WARNINGS_BEFORE_SUSPENSION)


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
