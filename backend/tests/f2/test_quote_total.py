"""AC-F2-17: 견적서 최종 합계 검증 (항목 합과 다르면 거부, 최소 10,000원)."""
import pytest
from pydantic import ValidationError

from app.core.errors import AppError
from app.quote.calc import MIN_TOTAL_AMOUNT, sum_amounts, verify_total
from app.quote.schemas import MAX_AMOUNT, QuoteAmounts

# api-contract.md 3.3 예시 값
EXAMPLE = {"items": 600000, "transport": 150000, "install": 200000, "labor": 300000, "etc": 0}
EXAMPLE_TOTAL = 1250000
ZERO = {"items": 0, "transport": 0, "install": 0, "labor": 0, "etc": 0}


def _assert_total_mismatch(exc: AppError) -> None:
    assert exc.status == 400
    assert exc.code == "TOTAL_MISMATCH"
    assert exc.field_errors == [{"field": "totalAmount", "reason": "항목 금액의 합과 같아야 해요."}]


def test_ac_f2_17_matching_total_passes():
    amounts = QuoteAmounts.model_validate(EXAMPLE)
    assert sum_amounts(amounts) == EXAMPLE_TOTAL
    verify_total(amounts, EXAMPLE_TOTAL)


@pytest.mark.parametrize("total", [EXAMPLE_TOTAL + 1, EXAMPLE_TOTAL - 1, 0])
def test_ac_f2_17_wrong_total_rejected(total):
    amounts = QuoteAmounts.model_validate(EXAMPLE)
    with pytest.raises(AppError) as err:
        verify_total(amounts, total)
    _assert_total_mismatch(err.value)


def _assert_below_min(exc: AppError) -> None:
    assert exc.status == 400
    assert exc.code == "VALIDATION_FAILED"
    assert exc.field_errors == [
        {"field": "totalAmount", "reason": "금액을 다시 확인해 주세요. 견적서 합계는 10,000원 이상이어야 해요."}
    ]


def test_ac_f2_17_all_zero_rejected():
    """모든 칸 0원, 합계 0원은 최소 금액보다 작아 거부한다."""
    with pytest.raises(AppError) as err:
        verify_total(QuoteAmounts.model_validate(ZERO), 0)
    _assert_below_min(err.value)


def test_ac_f2_17_below_min_total_rejected():
    """경계 값: 9,999원은 거부한다."""
    with pytest.raises(AppError) as err:
        verify_total(QuoteAmounts.model_validate({**ZERO, "items": 9_999}), 9_999)
    _assert_below_min(err.value)


def test_ac_f2_17_min_total_passes():
    """경계 값: 10,000원은 통과한다."""
    assert MIN_TOTAL_AMOUNT == 10_000
    verify_total(QuoteAmounts.model_validate({**ZERO, "items": 10_000}), 10_000)


def test_ac_f2_17_all_zero_with_nonzero_total_rejected():
    with pytest.raises(AppError) as err:
        verify_total(QuoteAmounts.model_validate(ZERO), 1)
    _assert_total_mismatch(err.value)


@pytest.mark.parametrize("field", list(EXAMPLE))
def test_ac_f2_17_negative_amount_rejected(field):
    with pytest.raises(ValidationError) as err:
        QuoteAmounts.model_validate({**EXAMPLE, field: -1})
    assert err.value.errors()[0]["loc"] == (field,)


@pytest.mark.parametrize("field", list(EXAMPLE))
def test_ac_f2_17_max_amount_passes(field):
    amounts = QuoteAmounts.model_validate({**ZERO, field: MAX_AMOUNT})
    verify_total(amounts, MAX_AMOUNT)


@pytest.mark.parametrize("field", list(EXAMPLE))
def test_ac_f2_17_over_max_amount_rejected(field):
    with pytest.raises(ValidationError) as err:
        QuoteAmounts.model_validate({**ZERO, field: MAX_AMOUNT + 1})
    assert err.value.errors()[0]["loc"] == (field,)


@pytest.mark.parametrize("value", [1000.0, "1000", True])
def test_ac_f2_17_non_integer_amount_rejected(value):
    with pytest.raises(ValidationError) as err:
        QuoteAmounts.model_validate({**ZERO, "items": value})
    assert err.value.errors()[0]["loc"] == ("items",)


def test_ac_f2_17_sum_over_column_max_rejected():
    """항목은 각각 한도 안이어도 합이 합계 칸(INT UNSIGNED)을 넘으면 저장할 수 없다."""
    amounts = QuoteAmounts.model_validate({**ZERO, "items": MAX_AMOUNT, "transport": 1})
    with pytest.raises(AppError) as err:
        verify_total(amounts, MAX_AMOUNT + 1)
    assert err.value.status == 400
    assert err.value.code == "TOTAL_TOO_LARGE"
    assert err.value.field_errors[0]["field"] == "totalAmount"


# ---- 업체할인 (D-44): 최종 합계 = 항목 합 − 업체할인 ----

def test_ac_f2_17_discount_passes():
    """예시 값: 항목 합 1,250,000원 − 할인 50,000원 = 1,200,000원."""
    amounts = QuoteAmounts.model_validate(EXAMPLE)
    verify_total(amounts, 1_200_000, 50_000)


def test_ac_f2_17_discount_equal_to_sum_rejected_by_min():
    """경계 값: 할인 = 항목 합이면 합계 0원 → 할인 검사는 통과, 최소 금액에서 거부."""
    amounts = QuoteAmounts.model_validate(EXAMPLE)
    with pytest.raises(AppError) as err:
        verify_total(amounts, 0, EXAMPLE_TOTAL)
    _assert_below_min(err.value)


@pytest.mark.parametrize("discount", [EXAMPLE_TOTAL + 1, MAX_AMOUNT])
def test_ac_f2_17_discount_over_sum_rejected(discount):
    """할인이 항목 합보다 크면 합계를 맞춰 보내도 discountAmount 오류로 거부한다."""
    amounts = QuoteAmounts.model_validate(EXAMPLE)
    with pytest.raises(AppError) as err:
        verify_total(amounts, 0, discount)
    assert err.value.status == 400
    assert err.value.code == "VALIDATION_FAILED"
    assert [e["field"] for e in err.value.field_errors] == ["discountAmount"]


@pytest.mark.parametrize("total", [EXAMPLE_TOTAL, 1_200_001, 1_199_999])
def test_ac_f2_17_total_not_sum_minus_discount_rejected(total):
    """할인 50,000원인데 합계가 항목 합 − 할인과 다르면 TOTAL_MISMATCH (할인 안 뺀 합계 포함)."""
    amounts = QuoteAmounts.model_validate(EXAMPLE)
    with pytest.raises(AppError) as err:
        verify_total(amounts, total, 50_000)
    assert err.value.status == 400
    assert err.value.code == "TOTAL_MISMATCH"
    assert [e["field"] for e in err.value.field_errors] == ["totalAmount"]


def test_ac_f2_17_below_min_after_discount_rejected():
    """경계 값: 항목 합 20,000원 − 할인 10,001원 = 9,999원은 거부, 할인 10,000원이면 10,000원으로 통과."""
    amounts = QuoteAmounts.model_validate({**ZERO, "items": 20_000})
    with pytest.raises(AppError) as err:
        verify_total(amounts, 9_999, 10_001)
    _assert_below_min(err.value)
    verify_total(amounts, 10_000, 10_000)


def test_ac_f2_17_too_large_checked_before_discount():
    """검사 순서: 합이 너무 크면 할인·합계 오류보다 TOTAL_TOO_LARGE가 먼저."""
    amounts = QuoteAmounts.model_validate({**ZERO, "items": MAX_AMOUNT, "transport": 1})
    with pytest.raises(AppError) as err:
        verify_total(amounts, 0, MAX_AMOUNT + 2)
    assert err.value.code == "TOTAL_TOO_LARGE"
