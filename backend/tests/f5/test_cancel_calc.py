"""F5 취소 위약금·환불 계산 — AC-F5-08·09·10 (FR-PAY-03, D-39, D-53). 값은 docs/guides/시연_예시값.md."""
from datetime import date, datetime

import pytest

from app.payment.calc import CancelAmounts, cancel_amounts, cancel_phase, split_by_amount

LINES = [500000, 1350000]  # 공연장 C, 장비 D
FEE = 92500
SHOW = date(2026, 12, 20)


def test_ac_f5_08_d1_user_cancel_70_percent():
    """D-1 사용자 취소: 1,295,000원 → C 350,000 / D 945,000, 환불 555,000원 (이용료 환불 없음)."""
    assert cancel_amounts(LINES, FEE, "D1") == CancelAmounts(
        "D1", 70, 1942500, 1850000, 1295000, (350000, 945000), 0, 555000
    )


def test_ac_f5_09_before_payment_cancel_is_free():
    """결제 전 취소: 낸 돈이 없어 수수료·환불 모두 0원 (D-53)."""
    assert cancel_amounts(LINES, FEE, "BEFORE_PAYMENT") == CancelAmounts(
        "BEFORE_PAYMENT", 0, 0, 1850000, 0, (0, 0), 0, 0
    )


def test_ac_f5_08_d3_split_matches_demo_values():
    """D-3 30%: 555,000원 → C 150,000 / D 405,000 (시연 예시값)."""
    assert cancel_amounts(LINES, FEE, "D3").penalty_by_line == (150000, 405000)


def test_ac_f5_10_supplier_fault_full_refund_with_fee():
    """업체 사정 취소: 위약금 없이 이용료 포함 1,942,500원 전액 환불."""
    assert cancel_amounts(LINES, FEE, "SUPPLIER_FAULT") == CancelAmounts(
        "SUPPLIER_FAULT", 0, 1942500, 1850000, 0, (0, 0), FEE, 1942500
    )


@pytest.mark.parametrize(("phase", "penalty", "refund"), [
    ("UNTIL_D6", 0, 1850000),  # 위약금 없음, 이용료 92,500원은 돌려주지 않음
    ("D5_D4", 185000, 1665000), ("D3", 555000, 1295000),
    ("D2", 925000, 925000), ("D0", 1850000, 0),
])
def test_ac_f5_08_rate_by_phase(phase, penalty, refund):
    result = cancel_amounts(LINES, FEE, phase)
    assert (result.penalty_total, result.refund_total) == (penalty, refund)
    assert sum(result.penalty_by_line) == penalty


@pytest.mark.parametrize(("now", "phase"), [
    (datetime(2026, 12, 1, 0, 0), "UNTIL_D6"),
    (datetime(2026, 12, 14, 23, 59), "UNTIL_D6"),  # D-6 마지막 분
    (datetime(2026, 12, 15, 0, 0), "D5_D4"),  # D-5 시작 (자정)
    (datetime(2026, 12, 16, 23, 59), "D5_D4"),  # D-4 마지막 분
    (datetime(2026, 12, 17, 0, 0), "D3"),
    (datetime(2026, 12, 17, 23, 59), "D3"),
    (datetime(2026, 12, 18, 0, 0), "D2"),  # D-2 시작 (자정)
    (datetime(2026, 12, 18, 23, 59), "D2"),
    (datetime(2026, 12, 19, 0, 0), "D1"),
    (datetime(2026, 12, 19, 23, 59), "D1"),  # 자정 직전
    (datetime(2026, 12, 20, 0, 0), "D0"),  # 자정 직후
    (datetime(2026, 12, 20, 23, 59), "D0"),
])
def test_ac_f5_08_phase_changes_at_midnight(now, phase):
    assert cancel_phase(SHOW, now, paid=True) == phase


def test_ac_f5_09_unpaid_is_before_payment_even_on_d0():
    assert cancel_phase(SHOW, datetime(2026, 12, 20, 12, 0), paid=False) == "BEFORE_PAYMENT"


@pytest.mark.parametrize("paid", [True, False])
def test_ac_f5_08_rejects_cancel_after_show_date(paid):
    with pytest.raises(ValueError):
        cancel_phase(SHOW, datetime(2026, 12, 21, 0, 0), paid=paid)


@pytest.mark.parametrize(("total", "amounts", "shares"), [
    (700000, [333334, 333334, 333332], (233335, 233333, 233332)),  # 동점이면 앞 단계 업체가 나머지
    (10, [1, 1, 1], (4, 3, 3)),
    (100, [1, 2], (33, 67)),  # 나머지는 금액이 가장 큰 업체
    (5, [0, 7], (0, 5)),  # 0원 업체는 0원
    (0, [0, 0], (0, 0)),
    (0, [], ()),
])
def test_ac_f5_08_split_remainder_to_largest(total, amounts, shares):
    assert split_by_amount(total, amounts) == shares


@pytest.mark.parametrize(("lines", "fee", "phase"), [
    (LINES, FEE, "D4"), ([-1], FEE, "D1"), ([1.5], FEE, "D1"), ([True], FEE, "D1"), (LINES, -1, "D1"), (LINES, 0.5, "D1"),
])
def test_ac_f5_08_rejects_bad_input(lines, fee, phase):
    with pytest.raises(ValueError):
        cancel_amounts(lines, fee, phase)


def test_ac_f5_08_split_rejects_total_without_base():
    with pytest.raises(ValueError):
        split_by_amount(1, [0, 0])
