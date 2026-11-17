"""통합 청구서 금액 계산 (FR-PAY-01, D-39) — DB를 모르는 순수 함수.

금액은 원 단위 정수(부가세 포함). 이용료율은 부르는 쪽이 Settings.PLATFORM_FEE_RATE 에서 읽어 Decimal 로 넘긴다.
"""
from collections.abc import Sequence
from dataclasses import dataclass
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
