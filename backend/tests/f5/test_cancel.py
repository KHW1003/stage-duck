"""취소·위약금·업체 사정 취소 API (T4-07 #52, FR-PAY-03, AC-F5-08·09·10, D-57).

공연 2026-11-28, 업체 C 500,000 + D 1,350,000 = 1,850,000, 이용료 92,500, 결제 1,942,500 (2026-11-20 10:00 결제).
"""
from datetime import date, datetime

import pytest
from sqlalchemy import func, select

from app.main import app
from app.models.payment import Cancellation, LedgerEntry, Order
from app.models.rejection import RejectionEvent
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.payment.deadline import calc_deadline
from app.payment.router import get_now
from app.payment.service import payment_deadline
from tests.conftest import make_supplier, make_user
from tests.f2.test_quotes import _as
from tests.f5.test_order import NOW, _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

TOTAL = 1942500
SHOW = date(2026, 11, 28)


def _at(when: datetime):
    app.dependency_overrides[get_now] = lambda: when


def _paid(client, db):
    user, perf_id, (c, d) = _ready(client, db)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    assert user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": TOTAL},
                     headers={"Idempotency-Key": "k"}).json()["status"] == "SUCCEEDED"
    return user, perf_id, order_id, (c, d)


def _ledger(db, order_id):
    db.expire_all()
    return [(e.supplier_id, e.entry_type, e.amount) for e in
            db.scalars(select(LedgerEntry).where(LedgerEntry.order_id == order_id).order_by(LedgerEntry.id))]


def test_ac_f5_08_d1_user_cancel_70_percent_split_by_amount(client, db):
    user, perf_id, order_id, (c, d) = _paid(client, db)
    _at(datetime(2026, 11, 27, 10, 0))  # D-1

    preview = user.get(f"/api/v1/performances/{perf_id}/cancel-quote").json()
    res = user.post(f"/api/v1/performances/{perf_id}/cancel")

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["phase"], out["ratePercent"], out["paid"], out["penaltyTotal"], out["feeRefunded"], out["refundTotal"]) == (
        "D1", 70, TOTAL, 1295000, 0, 555000)
    assert [(p["supplierId"], p["amount"]) for p in out["penaltyBySupplier"]] == [(c, 350000), (d, 945000)]
    assert {k: v for k, v in out.items() if k != "cancellationId"} == {k: v for k, v in preview.items() if k != "cancellationId"}
    assert _ledger(db, order_id)[-3:] == [(c, "PENALTY", 350000), (d, "PENALTY", 945000), (None, "REFUND", -555000)]
    assert db.get(Order, order_id).status == "CANCELLED"
    row = db.get(Cancellation, out["cancellationId"])
    assert (row.requested_by, row.phase, row.rate_percent, row.penalty_total, row.refund_total) == ("USER", "D1", 70, 1295000, 555000)


def test_cancel_rejects_stale_confirmation_without_changes(client, db):
    user, perf_id, order_id, _ = _paid(client, db)
    url = f"/api/v1/performances/{perf_id}"
    fields = ("phase", "ratePercent", "paid", "penaltyTotal", "feeRefunded", "refundTotal")
    _at(datetime(2026, 11, 27, 23, 59))
    preview = user.get(f"{url}/cancel-quote").json()
    before = _ledger(db, order_id)

    _at(datetime(2026, 11, 28, 0, 0))
    stale = user.post(f"{url}/cancel", json={key: preview[key] for key in fields})
    assert stale.status_code == 409, stale.text
    assert "취소 금액이 변경되었습니다" in stale.json()["message"]
    assert _ledger(db, order_id) == before
    assert db.get(Order, order_id).status == "PAID"
    assert db.scalar(select(Cancellation).where(Cancellation.performance_id == perf_id)) is None

    updated = user.get(f"{url}/cancel-quote").json()
    accepted = user.post(f"{url}/cancel", json={key: updated[key] for key in fields})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["penaltyTotal"] == 1850000
    assert accepted.json()["refundTotal"] == 0


@pytest.mark.parametrize(("when", "phase", "refund"), [
    (datetime(2026, 11, 20, 21, 59), "GRACE_12H", TOTAL),  # 결제 후 11시간 59분 — 이용료까지
    (datetime(2026, 11, 21, 10, 0), "D7_D2", 925000),  # 결제 후 24시간, D-7 → 50%
    (datetime(2026, 11, 28, 9, 0), "D0", 0),  # 당일 100%
])
def test_ac_f5_08_phase_by_time(client, db, when, phase, refund):
    user, perf_id, _, _ = _paid(client, db)
    _at(when)
    out = user.get(f"/api/v1/performances/{perf_id}/cancel-quote").json()
    assert (out["phase"], out["refundTotal"]) == (phase, refund)


def test_ac_f5_09_before_payment_cancel_is_free_and_counts_rejection(client, db):
    user, perf_id, _ = _ready(client, db)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    before = db.scalar(select(func.count()).select_from(RejectionEvent))

    out = user.post(f"/api/v1/performances/{perf_id}/cancel").json()

    assert (out["phase"], out["paid"], out["penaltyTotal"], out["refundTotal"], out["penaltyBySupplier"]) == (
        "BEFORE_PAYMENT", 0, 0, 0, [])
    db.expire_all()
    assert db.get(Order, order_id).status == "CANCELLED"
    assert _ledger(db, order_id) == []
    assert db.scalar(select(func.count()).select_from(RejectionEvent)) == before + 1  # 견적서를 받은 공연 → 반려 (D-57)
    again = user.post(f"/api/v1/performances/{perf_id}/cancel")
    assert (again.status_code, again.json()["code"]) == (409, "INVALID_STATE")


def test_ac_f5_10_supplier_fault_full_refund_and_warning(client, db):
    _, perf_id, order_id, (c, d) = _paid(client, db)
    supplier_c = db.get(Supplier, c)
    warnings = db.get(User, supplier_c.user_id).warning_count

    res = _as(db, supplier_c.user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "공간 누수"})

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["phase"], out["penaltyTotal"], out["feeRefunded"], out["refundTotal"]) == ("SUPPLIER_FAULT", 0, 92500, TOTAL)
    db.expire_all()
    assert db.get(User, supplier_c.user_id).warning_count == warnings + 1
    assert db.get(Order, order_id).status == "CANCELLED"
    assert _ledger(db, order_id)[-1] == (None, "REFUND", -TOTAL)
    row = db.get(Cancellation, out["cancellationId"])
    assert (row.requested_by, row.fault_supplier_id) == ("SUPPLIER", c)


def test_ac_f5_10_supplier_cancel_rules(client, db):
    user, perf_id, _ = _ready(client, db)
    user.post(f"/api/v1/performances/{perf_id}/order")
    order = db.scalar(select(Order).where(Order.performance_id == perf_id))
    supplier = db.get(Supplier, order.lines[0].supplier_id)
    url = f"/api/v1/performances/{perf_id}/cancel-by-supplier"

    assert _as(db, supplier.user).post(url, json={"reason": " "}).status_code == 400
    outsider = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    assert _as(db, outsider.user).post(url, json={"reason": "사정"}).status_code == 404
    # 결제 전 업체 취소는 D-57 규칙(다시 모집 + 마감 48시간 연장) — test_ac_f5_22_supplier_cancel_before_payment_* 참고


def _confirmed_at(db, perf_id, when):
    for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id, Stage.status == "CONFIRMED")):
        s.confirmed_at = when
    db.commit()


def test_ac_f5_22_supplier_cancel_before_payment_reopens_stage_and_extends_deadline(client, db):
    """D-57: 결제 전에 장비 업체 D가 취소 → 장비 단계만 다시 모집, 청구서 취소, D 경고 1회, 결제 마감 +48시간."""
    user, perf_id, (c, d) = _ready(client, db)
    _confirmed_at(db, perf_id, datetime(2026, 11, 1, 15, 0))  # 공연 11/28 → 27일 전 처음 컨펌 = 일반(168시간)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    before = payment_deadline(db, perf_id)
    supplier_d = db.get(Supplier, d)
    warnings = db.get(User, supplier_d.user_id).warning_count

    res = _as(db, supplier_d.user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "장비 고장"})

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["phase"], out["paid"], out["penaltyTotal"], out["refundTotal"]) == ("SUPPLIER_FAULT", 0, 0, 0)
    db.expire_all()
    stages = {s.stage_type: s for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}
    assert (stages["EQUIPMENT"].status, stages["EQUIPMENT"].confirmed_quote_version_id) == ("OPEN", None)
    assert stages["VENUE"].status == "CONFIRMED"  # 그 단계만
    assert db.get(Performance, perf_id).status == "ASSIGNING"
    assert db.get(Order, order_id).status == "CANCELLED"
    assert db.get(User, supplier_d.user_id).warning_count == warnings + 1
    row = db.get(Cancellation, out["cancellationId"])
    assert (row.requested_by, row.order_id, row.fault_supplier_id) == ("SUPPLIER", None, d)
    assert before == datetime(2026, 11, 8, 15, 0)
    assert payment_deadline(db, perf_id) == datetime(2026, 11, 10, 15, 0)  # +48시간


@pytest.mark.parametrize(("first", "cancels", "deadline"), [
    (datetime(2026, 11, 1, 15, 0), 0, datetime(2026, 11, 8, 15, 0)),  # 일반 168시간
    (datetime(2026, 11, 1, 15, 0), 1, datetime(2026, 11, 10, 15, 0)),
    (datetime(2026, 11, 1, 15, 0), 2, datetime(2026, 11, 12, 15, 0)),
    (datetime(2026, 11, 15, 15, 0), 0, datetime(2026, 11, 17, 15, 0)),  # 임박 48시간 (13일 전)
    (datetime(2026, 11, 15, 15, 0), 1, datetime(2026, 11, 19, 15, 0)),
    (datetime(2026, 11, 15, 15, 0), 3, datetime(2026, 11, 23, 0, 0)),  # 공연 5일 전 0시를 넘지 않음
])
def test_ac_f5_22_deadline_extension_capped(first, cancels, deadline):
    assert calc_deadline(first, SHOW, supplier_cancels=cancels) == deadline


def test_ac_f5_22_supplier_cancel_blocked_while_another_stage_is_open(client, db):
    """한 번에 한 단계만 모집 — 다른 단계가 이미 열려 있으면 다시 열지 않고, 아무것도 바뀌지 않는다."""
    user, perf_id, (c, _) = _ready(client, db, engineer="OPEN")
    supplier_c = db.get(Supplier, c)
    warnings = db.get(User, supplier_c.user_id).warning_count

    res = _as(db, supplier_c.user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "사정"})

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")
    db.expire_all()
    assert db.scalar(select(Stage.status).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE")) == "CONFIRMED"
    assert db.get(User, supplier_c.user_id).warning_count == warnings
    assert db.scalars(select(Cancellation).where(Cancellation.performance_id == perf_id)).all() == []


def test_ac_f5_08_permissions_and_after_show(client, db):
    user, perf_id, _, _ = _paid(client, db)
    other = _as(db, make_user(db))
    assert other.get(f"/api/v1/performances/{perf_id}/cancel-quote").status_code == 404
    assert other.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 404
    _at(datetime(2026, 11, 29, 10, 0))
    res = user.post(f"/api/v1/performances/{perf_id}/cancel")
    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")
    _at(NOW)
