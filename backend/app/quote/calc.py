"""견적서 금액 계산 — DB를 모르는 순수 함수 (CLAUDE.md 6.1)."""
from app.core.errors import AppError
from app.quote.schemas import MAX_AMOUNT, QuoteAmounts

# 견적서 최종 합계의 최소 금액 (원). 팀장 결정 2026-11-16.
MIN_TOTAL_AMOUNT = 10_000


def sum_amounts(amounts: QuoteAmounts) -> int:
    """AC-F2-17: 항목별 금액(물품·운반·설치·인건비·기타)의 합."""
    return amounts.items + amounts.transport + amounts.install + amounts.labor + amounts.etc


def verify_total(amounts: QuoteAmounts, total_amount: int, discount_amount: int = 0) -> None:
    """AC-F2-17: 최종 합계가 항목 합 − 업체할인과 다르면 400 TOTAL_MISMATCH로 거부한다 (D-43·D-44).

    합계 칸(quote_versions.total_amount)도 INT UNSIGNED라서, 항목 합이 그 최댓값을 넘으면 400 TOTAL_TOO_LARGE.
    업체할인이 항목 합보다 크면 400 VALIDATION_FAILED (field discountAmount).
    합계가 MIN_TOTAL_AMOUNT보다 작으면 400 VALIDATION_FAILED (field totalAmount).
    검사 순서: TOTAL_TOO_LARGE → 할인 > 항목 합 → TOTAL_MISMATCH → 최소 금액 (api-contract.md 3.3).
    """
    subtotal = sum_amounts(amounts)
    if subtotal > MAX_AMOUNT:
        raise AppError(
            400,
            "TOTAL_TOO_LARGE",
            "항목 금액의 합이 너무 커요. 금액을 다시 확인해 주세요.",
            [{"field": "totalAmount", "reason": f"합계는 {MAX_AMOUNT:,}원 이하여야 해요."}],
        )
    if discount_amount > subtotal:
        raise AppError(
            400,
            "VALIDATION_FAILED",
            "입력값을 확인해 주세요.",
            [{"field": "discountAmount", "reason": "업체할인은 항목 금액의 합보다 클 수 없어요. 할인 금액을 줄여 주세요."}],
        )
    if total_amount != subtotal - discount_amount:
        if discount_amount:
            message = "최종 합계가 항목 금액의 합에서 업체할인을 뺀 값과 달라요. 합계를 다시 계산해 주세요."
            reason = "항목 금액의 합에서 업체할인을 뺀 값과 같아야 해요."
        else:
            message = "최종 합계가 항목 금액의 합과 달라요. 항목 금액을 확인하고 합계를 다시 계산해 주세요."
            reason = "항목 금액의 합과 같아야 해요."
        raise AppError(400, "TOTAL_MISMATCH", message, [{"field": "totalAmount", "reason": reason}])
    if total_amount < MIN_TOTAL_AMOUNT:
        raise AppError(
            400,
            "VALIDATION_FAILED",
            "입력값을 확인해 주세요.",
            [
                {
                    "field": "totalAmount",
                    "reason": f"금액을 다시 확인해 주세요. 견적서 합계는 {MIN_TOTAL_AMOUNT:,}원 이상이어야 해요.",
                }
            ],
        )
