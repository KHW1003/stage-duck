"""견적서 금액 계산 — DB를 모르는 순수 함수 (CLAUDE.md 6.1)."""
from app.core.errors import AppError
from app.quote.schemas import MAX_AMOUNT, QuoteAmounts


def sum_amounts(amounts: QuoteAmounts) -> int:
    """AC-F2-17: 항목별 금액(물품·운반·설치·인건비·기타)의 합."""
    return amounts.items + amounts.transport + amounts.install + amounts.labor + amounts.etc


def verify_total(amounts: QuoteAmounts, total_amount: int) -> None:
    """AC-F2-17: 최종 합계가 항목 합과 다르면 400 TOTAL_MISMATCH로 거부한다.

    합계 칸(quote_versions.total_amount)도 INT UNSIGNED라서, 항목 합이 그 최댓값을 넘으면 400 TOTAL_TOO_LARGE.
    """
    if sum_amounts(amounts) > MAX_AMOUNT:
        raise AppError(
            400,
            "TOTAL_TOO_LARGE",
            "항목 금액의 합이 너무 커요. 금액을 다시 확인해 주세요.",
            [{"field": "totalAmount", "reason": f"합계는 {MAX_AMOUNT:,}원 이하여야 해요."}],
        )
    if total_amount != sum_amounts(amounts):
        raise AppError(
            400,
            "TOTAL_MISMATCH",
            "최종 합계가 항목 금액의 합과 달라요. 항목 금액을 확인하고 합계를 다시 계산해 주세요.",
            [{"field": "totalAmount", "reason": "항목 금액의 합과 같아야 해요."}],
        )
