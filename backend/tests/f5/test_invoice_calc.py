"""F5 통합 청구서 금액 — AC-F5-03 (FR-PAY-01, D-39). 값은 docs/guides/시연_예시값.md."""
from decimal import Decimal

import pytest

from app.payment.calc import InvoiceAmounts, invoice_amounts

RATE = Decimal("0.05")


def test_ac_f5_03_venue_c_and_equipment_d_invoice():
    """공연장 C 50만 + 장비 D 135만, 엔지니어 건너뜀(줄 없음) → 185만 + 9만 2,500 = 194만 2,500원."""
    assert invoice_amounts([500000, 1350000], RATE) == InvoiceAmounts(1850000, 92500, 1942500)


@pytest.mark.parametrize(("lines", "fee"), [
    ([], 0), ([0], 0), ([19], 0), ([20], 1), ([39], 1), ([40], 2), ([1850019], 92500), ([1850020], 92501),
])
def test_ac_f5_03_fee_floors_below_one_won(lines, fee):
    result = invoice_amounts(lines, RATE)
    assert result.platform_fee == fee
    assert result.total_amount == result.items_total + result.platform_fee


@pytest.mark.parametrize(("lines", "rate"), [
    ([1000], 0.05), ([1000], Decimal("-0.01")), ([1000], Decimal("1")), ([-1], RATE), ([1.5], RATE), ([True], RATE),
])
def test_ac_f5_03_rejects_bad_input(lines, rate):
    with pytest.raises(ValueError):
        invoice_amounts(lines, rate)
