"""테스트 결제·장부 (T4-06 #51, FR-PAY-02, AC-F5-05·06·07). 청구서 1,942,500원 (C 500,000 + D 1,350,000 + 이용료 92,500)."""
import os
import threading
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import scheduler
from app.core.db import SessionLocal
from app.main import app
from app.models.notification import Notification
from app.models.payment import LedgerEntry, Order, Payment
from app.models.request import Performance
from app.models.supplier import Supplier
from app.payment import service
from app.payment.router import get_now
from tests.conftest import make_user
from tests.f2.test_quotes import _as
from tests.f5.test_order import _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

TOTAL = 1942500


def _order(client, db):
    user, perf_id, (c, d) = _ready(client, db)
    order = user.post(f"/api/v1/performances/{perf_id}/order").json()
    return user, perf_id, order["id"], (c, d)


def _pay(user, order_id, key="key-1", amount=TOTAL, result="SUCCESS"):
    return user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": amount, "mockResult": result},
                     headers={"Idempotency-Key": key})


def _ledger(db, order_id):
    db.expire_all()
    return [(e.supplier_id, e.entry_type, e.amount) for e in
            db.scalars(select(LedgerEntry).where(LedgerEntry.order_id == order_id).order_by(LedgerEntry.id))]


@pytest.mark.parametrize("amount", [TOTAL - 1, TOTAL + 1, 0, 1850000])
def test_ac_f5_05_tampered_amount_is_rejected(client, db, amount):
    user, _, order_id, _ = _order(client, db)

    res = _pay(user, order_id, amount=amount)

    assert (res.status_code, res.json()["code"]) == (400, "AMOUNT_MISMATCH")
    db.expire_all()
    assert db.get(Order, order_id).status == "ISSUED"
    assert db.scalars(select(Payment)).all() == []


def test_ac_f5_06_idempotency_key_required(client, db):
    user, _, order_id, _ = _order(client, db)
    res = user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": TOTAL})
    assert res.status_code == 400
    assert res.json()["fieldErrors"][0]["field"] == "Idempotency-Key"


def test_ac_f5_06_success_holds_money_per_supplier(client, db):
    user, perf_id, order_id, (c, d) = _order(client, db)

    res = _pay(user, order_id)

    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["amount"], res.json()["orderStatus"]) == ("SUCCEEDED", TOTAL, "PAID")
    assert _ledger(db, order_id) == [(c, "HOLD", 500000), (d, "HOLD", 1350000), (None, "PLATFORM_FEE", 92500)]
    o = user.get(f"/api/v1/performances/{perf_id}/order").json()
    assert o["status"] == "PAID" and o["paidAt"].startswith("2026-11-20T10:00")
    assert [ln["ledgerState"] for ln in o["lines"]] == ["HOLD", "HOLD"]  # AC-F5-07 보관 중


def test_ac_f5_06_same_key_twice_is_one_payment(client, db):
    user, _, order_id, _ = _order(client, db)
    first = _pay(user, order_id).json()

    again = _pay(user, order_id)

    assert again.status_code == 200
    assert again.json() == first
    assert len(db.scalars(select(Payment)).all()) == 1
    assert len(_ledger(db, order_id)) == 3


def test_ac_f5_06_second_click_with_new_key_does_not_pay_twice(client, db):
    user, _, order_id, _ = _order(client, db)
    _pay(user, order_id, key="click-1")

    res = _pay(user, order_id, key="click-2")

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")
    db.expire_all()
    assert [p.status for p in db.scalars(select(Payment))] == ["SUCCEEDED"]


def test_ac_f5_06_duplicate_success_callback_applies_once(client, db):
    user, _, order_id, _ = _order(client, db)
    _pay(user, order_id)
    tx = db.scalar(select(Payment.provider_tx_id))

    for _ in range(2):
        assert user.post("/api/v1/payments/mock/callback", json={"providerTxId": tx, "result": "SUCCESS"}).status_code == 204

    assert len(_ledger(db, order_id)) == 3
    assert user.post("/api/v1/payments/mock/callback", json={"providerTxId": "mock-none", "result": "SUCCESS"}).status_code == 404


def test_ac_f5_06_failed_payment_can_be_retried(client, db):
    user, _, order_id, _ = _order(client, db)

    failed = _pay(user, order_id, key="try-1", result="FAIL").json()
    ok = _pay(user, order_id, key="try-2").json()

    assert (failed["status"], failed["orderStatus"]) == ("FAILED", "ISSUED")
    assert (ok["status"], ok["orderStatus"]) == ("SUCCEEDED", "PAID")
    assert len(_ledger(db, order_id)) == 3


def test_ac_f5_07_settlement_scheduled_after_show_ends(client, db):
    user, perf_id, order_id, (c, d) = _order(client, db)
    _pay(user, order_id)
    perf = db.get(Performance, perf_id)
    end = datetime.combine(perf.show_date, perf.show_end)

    assert service.settle_completed_orders(db, now=end - timedelta(minutes=1)) == 0  # 끝나기 1분 전
    assert service.settle_completed_orders(db, now=end) == 1

    o = user.get(f"/api/v1/performances/{perf_id}/order").json()
    assert o["status"] == "SETTLEMENT_SCHEDULED"
    assert [ln["ledgerState"] for ln in o["lines"]] == ["SETTLE_SCHEDULED", "SETTLE_SCHEDULED"]
    assert _ledger(db, order_id)[-2:] == [(c, "SETTLE_SCHEDULED", 500000), (d, "SETTLE_SCHEDULED", 1350000)]
    assert service.settle_completed_orders(db, now=end) == 0  # 두 번 돌려도 한 번만


def test_ac_f5_07_scheduler_settles_once_and_notifies_each_supplier(client, db):
    """스케줄러가 실제로 부른다. 업체마다 자기 금액으로 알림 한 번, 끝난 뒤에는 같은 날이라도 취소할 수 없다."""
    user, perf_id, order_id, (c, d) = _order(client, db)
    _pay(user, order_id)
    perf = db.get(Performance, perf_id)
    end = datetime.combine(perf.show_date, perf.show_end)
    db.rollback()

    scheduler.run_once(end - timedelta(minutes=1))
    db.expire_all()
    assert db.get(Order, order_id).status == "PAID"
    db.rollback()
    scheduler.run_once(end)
    scheduler.run_once(end + timedelta(minutes=1))

    db.expire_all()
    assert db.get(Order, order_id).status == "SETTLEMENT_SCHEDULED"
    assert [e for e in _ledger(db, order_id) if e[1] == "SETTLE_SCHEDULED"] == [
        (c, "SETTLE_SCHEDULED", 500000), (d, "SETTLE_SCHEDULED", 1350000)]
    notes = {n.user_id: n.body for n in db.scalars(select(Notification).where(Notification.type == "SETTLEMENT_SCHEDULED"))}
    assert notes == {db.get(Supplier, s).user_id: f"{perf.title} · {won}원" for s, won in ((c, "500,000"), (d, "1,350,000"))}

    app.dependency_overrides[get_now] = lambda: end + timedelta(minutes=2)
    assert user.get(f"/api/v1/performances/{perf_id}/cancel-quote").status_code == 409
    assert user.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 409
    db.expire_all()
    assert db.get(Performance, perf_id).status == "CONFIRMED"


def test_ac_f5_07_cancelled_order_is_not_settled(client, db):
    user, perf_id, order_id, _ = _order(client, db)
    _pay(user, order_id)
    assert user.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 200
    perf = db.get(Performance, perf_id)
    assert service.settle_completed_orders(db, now=datetime.combine(perf.show_date, perf.show_end)) == 0
    assert db.scalars(select(Notification).where(Notification.type == "SETTLEMENT_SCHEDULED")).all() == []


def test_ac_f5_05_other_people_cannot_pay(client, db):
    _, _, order_id, _ = _order(client, db)
    other = _as(db, make_user(db))
    assert _pay(other, order_id).status_code == 404
    assert _pay(other, 999999).status_code == 404
    assert db.scalars(select(Payment)).all() == []


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="MariaDB에서만")
def test_ac_f5_06_concurrent_double_click_pays_once(client, db):
    user, _, order_id, _ = _order(client, db)
    cookies = dict(user.cookies)
    results = []

    def click(key):
        c = TestClient(app)
        c.cookies.update(cookies)
        c.headers["X-CSRF-Token"] = user.headers["X-CSRF-Token"]
        results.append(_pay(c, order_id, key=key).status_code)

    threads = [threading.Thread(target=click, args=(f"dbl-{i}",)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == [200, 409]
    with SessionLocal() as s:
        assert [p.status for p in s.scalars(select(Payment).where(Payment.order_id == order_id))] == ["SUCCEEDED"]
