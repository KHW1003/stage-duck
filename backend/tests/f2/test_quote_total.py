"""AC-F2-17: 견적서 최종 합계 검증 (항목 합과 다르면 거부)."""
import pytest
from pydantic import ValidationError

from app.core.errors import AppError
from app.quote.calc import sum_amounts, verify_total
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


def test_ac_f2_17_all_zero_passes():
    verify_total(QuoteAmounts.model_validate(ZERO), 0)


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
