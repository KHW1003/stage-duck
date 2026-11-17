"""통합 청구서 금액 (FR-PAY-01, D-39)·취소 위약금 (FR-PAY-03) 계산 — DB를 모르는 순수 함수.

금액은 원 단위 정수(부가세 포함). 이용료율은 부르는 쪽이 Settings.PLATFORM_FEE_RATE 에서 읽어 Decimal 로 넘긴다.
"""
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_FLOOR, Decimal


@dataclass(frozen=True)
class InvoiceAmounts:
    """orders 의 items_total · platform_fee · total_amount 칸과 같다 (data-model.md 8장)."""

    items_total: int  # 확정 견적서 금액 합 (업체 금액)
    platform_fee: int  # 플랫폼 이용료
    total_amount: int  # 청구서 합계 = items_total + platform_fee


def invoice_amounts(line_amounts: Sequence[int], fee_rate: Decimal) -> InvoiceAmounts:
    """AC-F5-03: 업체 금액 합계에 이용료율을 곱하고 원 미만은 버린다.

    예: [500000, 1350000], 0.05 → 1,850,000 + 92,500 = 1,942,500원.
    """
    if not isinstance(fee_rate, Decimal) or not Decimal(0) <= fee_rate < Decimal(1):
        raise ValueError("fee_rate 는 0 이상 1 미만의 Decimal 이어야 한다")
    if any(type(a) is not int or a < 0 for a in line_amounts):
        raise ValueError("line_amounts 는 0 이상의 정수여야 한다")
    items_total = sum(line_amounts)
    platform_fee = int((items_total * fee_rate).to_integral_value(rounding=ROUND_FLOOR))
    return InvoiceAmounts(items_total, platform_fee, items_total + platform_fee)


# 취소 시점별 비율 (FR-PAY-03, D-53, data-model.md cancellations.phase · rate_percent)
PHASE_RATE = {
    "BEFORE_PAYMENT": 0, "UNTIL_D6": 0, "D5_D4": 10, "D3": 30, "D2": 50, "D1": 70, "D0": 100, "SUPPLIER_FAULT": 0,
}
_DAY_PHASE = {0: "D0", 1: "D1", 2: "D2", 3: "D3", 4: "D5_D4", 5: "D5_D4"}


@dataclass(frozen=True)
class CancelAmounts:
    """GET /performances/{id}/cancel-quote 응답 칸과 같다 (api-contract.md 6.1)."""

    phase: str
    rate_percent: int
    paid: int  # 결제한 금액 (결제 전이면 0)
    penalty_base: int  # 업체 금액 합
    penalty_total: int  # 위약금
    penalty_by_line: tuple[int, ...]  # line_amounts 순서대로 업체별 몫
    fee_refunded: int  # 돌려주는 플랫폼 이용료
    refund_total: int  # 환불 예정액


def cancel_phase(performance_date: date, now: datetime, *, paid: bool) -> str:
    """AC-F5-08·09: 취소 시점(KST)을 정한다. D-day 는 공연 날짜 자정 기준 (NFR-RULE-03)."""
    days_left = (performance_date - now.date()).days
    if days_left < 0:
        raise ValueError("공연 날짜가 지난 뒤에는 취소 금액을 계산하지 않는다")
    if not paid:
        return "BEFORE_PAYMENT"
    return _DAY_PHASE.get(days_left, "UNTIL_D6")


def split_by_amount(total: int, amounts: Sequence[int]) -> tuple[int, ...]:
    """AC-F5-08·09: total 을 업체 금액 비율로 나눈다. 원 미만은 버리고, 남은 원은 금액이 가장 큰 업체에
    (같으면 앞 단계 업체에) 준다. 나눈 값의 합은 언제나 total 이다.
    """
    if any(type(a) is not int or a < 0 for a in amounts) or type(total) is not int or total < 0:
        raise ValueError("total · amounts 는 0 이상의 정수여야 한다")
    base = sum(amounts)
    if base == 0:
        if total:
            raise ValueError("업체 금액 합이 0 이면 나눌 금액도 0 이어야 한다")
        return tuple(0 for _ in amounts)
    shares = [total * a // base for a in amounts]
    shares[amounts.index(max(amounts))] += total - sum(shares)
    return tuple(shares)


def cancel_amounts(line_amounts: Sequence[int], platform_fee: int, phase: str) -> CancelAmounts:
    """AC-F5-08·09·10: 취소 시 위약금·업체별 몫·환불 예정액.

    위약금은 업체 금액 합 × 비율(원 미만 버림). 사용자 사정이면 이용료는 돌려주지 않고,
    SUPPLIER_FAULT(결제한 공연의 업체 사정 취소)면 위약금 없이 이용료까지 전액 돌려준다 (D-39).
    결제 전 취소는 낸 돈도 위약금도 없다 (D-53, 반려 카운트는 서비스에서 기록).
    """
    if phase not in PHASE_RATE:
        raise ValueError(f"모르는 phase: {phase}")
    if type(platform_fee) is not int or platform_fee < 0:
        raise ValueError("platform_fee 는 0 이상의 정수여야 한다")
    if any(type(a) is not int or a < 0 for a in line_amounts):
        raise ValueError("line_amounts 는 0 이상의 정수여야 한다")
    rate = PHASE_RATE[phase]
    base = sum(line_amounts)
    penalty = base * rate // 100
    by_line = split_by_amount(penalty, line_amounts)
    if phase == "BEFORE_PAYMENT":
        return CancelAmounts(phase, rate, 0, base, penalty, by_line, 0, 0)
    paid = base + platform_fee
    fee_refunded = platform_fee if phase == "SUPPLIER_FAULT" else 0
    refund = paid - penalty - platform_fee + fee_refunded
    return CancelAmounts(phase, rate, paid, base, penalty, by_line, fee_refunded, refund)
