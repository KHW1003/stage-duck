"""취소·위약금·업체 사정 취소 API (T4-07 #52, FR-PAY-03, AC-F5-08·09·10, D-57).

공연 2026-11-28, 업체 C 500,000 + D 1,350,000 = 1,850,000, 이용료 92,500, 결제 1,942,500 (2026-11-20 10:00 결제).
"""
import os
import threading
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.main import app
from app.models.notification import Notification
from app.models.payment import Cancellation, LedgerEntry, Order
from app.models.quote import Quote, QuoteVersion
from app.models.rejection import RejectionEvent
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.payment.deadline import calc_deadline, run_due
from app.payment.router import get_now
from app.payment.service import payment_deadline
from tests.conftest import make_supplier, make_user
from tests.f2.test_quotes import _as
from tests.f5.test_order import NOW, _confirm, _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

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
    note = db.scalar(select(Notification).where(Notification.user_id == db.get(Performance, perf_id).user_id, Notification.type == "CANCELLED_BY_SUPPLIER"))
    assert "환불할 금액은 없습니다" in note.body and "48시간" in note.body  # 결제 전 — "전액 환불"이라고 하지 않는다
    assert "전액 환불" not in note.body


def test_ac_f5_10_paid_supplier_cancel_notification_says_full_refund(client, db):
    user, perf_id, _, (c, _) = _paid(client, db)
    _as(db, db.get(Supplier, c).user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "공간 누수"})
    note = db.scalar(select(Notification).where(Notification.user_id == db.get(Performance, perf_id).user_id, Notification.type == "CANCELLED_BY_SUPPLIER"))
    assert note.body.startswith("전액 환불 예정")


def test_ac_f5_10_supplier_warnings_for_cancel_dialog(client, db):
    """확인 창이 "이번 취소로 정지돼요"를 미리 알리도록 지금 경고 수와 정지 기준(3회)을 준다. 업체만."""
    supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    db.get(User, supplier.user_id).warning_count = 2
    db.commit()

    res = _as(db, supplier.user).get("/api/v1/supplier/warnings")

    assert res.status_code == 200, res.text
    assert res.json() == {"warningCount": 2, "suspendAt": 3}
    host = make_user(db)
    assert _as(db, host).get("/api/v1/supplier/warnings").status_code == 404  # 다른 역할은 404 (CLAUDE.md 10)


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


def test_ac_f5_22_supplier_cancel_pauses_later_open_stage(client, db):
    """한 번에 한 단계만 모집 — 뒤 단계가 열려 있으면 그 단계를 대기로 되돌리고 앞 단계부터 다시 연다."""
    user, perf_id, (c, _) = _ready(client, db, engineer="OPEN")
    supplier_c = db.get(Supplier, c)
    warnings = db.get(User, supplier_c.user_id).warning_count

    res = _as(db, supplier_c.user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "사정"})

    assert res.status_code == 200, res.text
    assert _stage_status(db, perf_id) == {"VENUE": ("OPEN", False), "EQUIPMENT": ("CONFIRMED", True), "ENGINEER": ("WAITING", False)}
    assert db.get(User, supplier_c.user_id).warning_count == warnings + 1


def test_ac_f5_08_permissions_and_after_show(client, db):
    user, perf_id, _, _ = _paid(client, db)
    other = _as(db, make_user(db))
    assert other.get(f"/api/v1/performances/{perf_id}/cancel-quote").status_code == 404
    assert other.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 404
    _at(datetime(2026, 11, 29, 10, 0))
    res = user.post(f"/api/v1/performances/{perf_id}/cancel")
    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")
    _at(NOW)


def _supplier_cancel(db, perf_id, supplier_id):
    res = _as(db, db.get(Supplier, supplier_id).user).post(
        f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "사정"})
    db.expire_all()
    return res


def _stage_status(db, perf_id):
    db.expire_all()
    return {s.stage_type: (s.status, s.confirmed_quote_version_id is not None)
            for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}


@pytest.mark.parametrize("who", [0, 1])
def test_ac_f5_10_paid_supplier_cancel_reopens_only_that_stage_and_repays(client, db, who):
    """어느 업체가 취소해도 그 단계만 다시 모집 → 새 업체 확정 → 새 금액으로 결제. 취소한 업체 금액은 청구되지 않는다."""
    user, perf_id, old_order, suppliers = _paid(client, db)
    mine, other = [("VENUE", "EQUIPMENT"), ("EQUIPMENT", "VENUE")][who]

    assert _supplier_cancel(db, perf_id, suppliers[who]).status_code == 200

    assert _stage_status(db, perf_id) == {mine: ("OPEN", False), other: ("CONFIRMED", True), "ENGINEER": ("SKIPPED", False)}
    assert db.get(Performance, perf_id).status == "ASSIGNING"
    assert payment_deadline(db, perf_id) == datetime(2026, 11, 22, 10, 0)  # 취소 11/20 10:00 + 48시간 (임박)
    order_url = f"/api/v1/performances/{perf_id}/order"
    assert user.post(order_url).status_code == 409
    assert _supplier_cancel(db, perf_id, suppliers[who]).status_code == 404  # 더는 확정 업체가 아니다

    replacement = _confirm(db, perf_id, mine, 700000)
    db.get(Performance, perf_id).status = "AWAITING_PAYMENT"
    db.commit()
    order = user.post(order_url).json()
    assert order["itemsTotal"] == 700000 + [500000, 1350000][1 - who]
    assert {ln["supplierId"] for ln in order["lines"]} == {replacement, suppliers[1 - who]}
    paid = user.post(f"/api/v1/orders/{order['id']}/payments", json={"amount": order["totalAmount"]},
                     headers={"Idempotency-Key": "k2"})
    assert paid.json()["status"] == "SUCCEEDED"
    db.expire_all()
    assert db.get(Performance, perf_id).status == "CONFIRMED"
    assert db.get(Order, old_order).status == "CANCELLED"

    assert _supplier_cancel(db, perf_id, replacement).status_code == 200  # 다시 결제한 뒤 또 취소돼도 같다
    assert _stage_status(db, perf_id)[mine] == ("OPEN", False)


@pytest.mark.parametrize("paid", [True, False])
def test_ac_f5_10_supplier_with_two_stages_reopens_in_order(client, db, paid):
    """한 업체가 공연장·장비를 모두 맡았으면 공연장만 모집, 장비는 차례를 기다린다."""
    user, perf_id, (c, _) = _ready(client, db)
    equip = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "EQUIPMENT"))
    db.get(Quote, db.get(QuoteVersion, equip.confirmed_quote_version_id).quote_id).supplier_id = c
    db.commit()
    if paid:
        order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
        user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": TOTAL}, headers={"Idempotency-Key": "k"})

    assert _supplier_cancel(db, perf_id, c).status_code == 200

    assert _stage_status(db, perf_id) == {"VENUE": ("OPEN", False), "EQUIPMENT": ("WAITING", False), "ENGINEER": ("SKIPPED", False)}
    _confirm(db, perf_id, "VENUE", 500000)
    venue = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))
    res = user.post(f"/api/v1/stages/{venue.id}/advance", json={"action": "OPEN_NEXT"}, headers={"Idempotency-Key": "n"})
    assert res.status_code == 200, res.text
    assert _stage_status(db, perf_id)["EQUIPMENT"] == ("OPEN", False)


@pytest.mark.parametrize(("when", "perf_status", "stage_status"), [
    (datetime(2026, 11, 22, 23, 59), "ASSIGNING", "OPEN"),
    (datetime(2026, 11, 23, 0, 0), "CANCELLED", "CONFIRMED"),  # 공연 5일 전 0시부터는 다시 모집할 시간이 없다
])
def test_ac_f5_10_paid_supplier_cancel_at_five_days_before_show(client, db, when, perf_status, stage_status):
    user, perf_id, order_id, (c, d) = _paid(client, db)
    _at(when)
    assert _supplier_cancel(db, perf_id, c).json()["refundTotal"] == TOTAL
    assert db.get(Performance, perf_id).status == perf_status
    assert _stage_status(db, perf_id)["VENUE"][0] == stage_status
    assert db.get(Order, order_id).status == "CANCELLED"
    assert user.post(f"/api/v1/performances/{perf_id}/order").status_code == 409
    notes = {n.user_id: n for n in db.scalars(select(Notification).where(Notification.type == "CANCELLED_BY_SUPPLIER"))}
    note = notes.pop(db.get(Performance, perf_id).user_id)
    assert set(notes) == ({db.get(Supplier, d).user_id} if perf_status == "CANCELLED" else set())  # 남은 업체
    assert ("다시 모집하실 수 있습니다" in note.body) == (perf_status == "ASSIGNING")


@pytest.mark.parametrize("how", ["deadline", "cancel", "withdraw"])
def test_ac_f5_10_no_rejection_for_user_after_paid_supplier_cancel(client, db, how):
    """처음 확정이 오래됐어도 마감은 취소 시각부터. 그 뒤 그만둬도 사용자 반려는 늘지 않는다."""
    user, perf_id, _, (c, _) = _paid(client, db)
    _confirmed_at(db, perf_id, datetime(2026, 11, 1, 15, 0))
    _supplier_cancel(db, perf_id, c)
    assert run_due(db, datetime(2026, 11, 20, 10, 1)) == (0, 0)
    if how == "deadline":
        assert run_due(db, datetime(2026, 11, 21, 22, 0)) == (1, 0)
        assert run_due(db, datetime(2026, 11, 21, 22, 1)) == (0, 0)
        assert run_due(db, datetime(2026, 11, 22, 10, 0)) == (0, 1)
    else:
        assert user.post(f"/api/v1/performances/{perf_id}/{how}").status_code == 200
    db.expire_all()
    assert db.get(Performance, perf_id).status == ("WITHDRAWN" if how == "withdraw" else "CANCELLED")
    assert db.scalar(select(func.count()).select_from(RejectionEvent)) == 0


@pytest.mark.parametrize("order", [(0, 1), (1, 0)])
@pytest.mark.parametrize("status", ["OPEN", "NEGOTIATING"])
def test_ac_f5_10_both_suppliers_cancel_one_after_another(client, db, order, status):
    """모집 중에 다른 업체까지 취소해도 앞 단계(공연장)만 열리고 장비는 차례를 기다린다. 끝까지 다시 결제된다."""
    user, perf_id, _, suppliers = _paid(client, db)
    assert _supplier_cancel(db, perf_id, suppliers[order[0]]).status_code == 200
    for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id, Stage.status == "OPEN")):
        s.status = status
    db.commit()

    assert _supplier_cancel(db, perf_id, suppliers[order[1]]).status_code == 200

    venue_status = status if order == (0, 1) else "OPEN"
    assert _stage_status(db, perf_id) == {"VENUE": (venue_status, False), "EQUIPMENT": ("WAITING", False), "ENGINEER": ("SKIPPED", False)}
    _confirm(db, perf_id, "VENUE", 500000)
    venue = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))
    assert user.post(f"/api/v1/stages/{venue.id}/advance", json={"action": "OPEN_NEXT"},
                     headers={"Idempotency-Key": "n"}).status_code == 200
    _confirm(db, perf_id, "EQUIPMENT", 1350000)
    db.get(Performance, perf_id).status = "AWAITING_PAYMENT"
    db.commit()
    again = user.post(f"/api/v1/performances/{perf_id}/order").json()
    assert not {ln["supplierId"] for ln in again["lines"]} & set(suppliers)
    assert user.post(f"/api/v1/orders/{again['id']}/payments", json={"amount": TOTAL},
                     headers={"Idempotency-Key": "k2"}).json()["status"] == "SUCCEEDED"


def test_ac_f5_10_cancelled_stage_waits_behind_waiting_stage(client, db):
    """앞 단계가 아직 대기면 뒤 단계를 먼저 열지 않는다 (공연장 → 장비 → 엔지니어)."""
    _, perf_id, (c, d) = _ready(client, db)
    e = _confirm(db, perf_id, "ENGINEER", 300000)
    equip = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "EQUIPMENT"))
    equip.status, equip.confirmed_quote_version_id = "WAITING", None
    db.get(Performance, perf_id).status = "ASSIGNING"
    db.commit()
    assert _supplier_cancel(db, perf_id, e).status_code == 200
    assert _stage_status(db, perf_id)["ENGINEER"] == ("WAITING", False)


def _race(db, calls):
    results = []
    gate = threading.Barrier(len(calls))

    def run(call):
        gate.wait()
        results.append(call().status_code)

    threads = [threading.Thread(target=run, args=(c,)) for c in calls]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    db.rollback()
    db.expire_all()
    return sorted(results)


def _copy(client):
    c = TestClient(app, raise_server_exceptions=False)
    c.cookies.update(dict(client.cookies))
    c.headers.update(client.headers)
    return c


mariadb_only = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="MariaDB에서만")


@mariadb_only
def test_ac_f5_10_concurrent_same_supplier_cancels_once(client, db):
    _, perf_id, _, (c, _) = _paid(client, db)
    sup = _as(db, db.get(Supplier, c).user)
    url = f"/api/v1/performances/{perf_id}/cancel-by-supplier"
    got = _race(db, [lambda x=x: x.post(url, json={"reason": "사정"}) for x in (_copy(sup), _copy(sup))])
    assert got in ([200, 404], [200, 409])
    assert db.get(User, db.get(Supplier, c).user_id).warning_count == 1
    assert db.scalar(select(func.count()).select_from(Cancellation)) == 1


@mariadb_only
def test_ac_f5_10_concurrent_two_suppliers_cancel(client, db):
    _, perf_id, _, suppliers = _paid(client, db)
    url = f"/api/v1/performances/{perf_id}/cancel-by-supplier"
    clients = [_copy(_as(db, db.get(Supplier, s).user)) for s in suppliers]
    assert _race(db, [lambda x=x: x.post(url, json={"reason": "사정"}) for x in clients]) == [200, 200]
    assert _stage_status(db, perf_id) == {"VENUE": ("OPEN", False), "EQUIPMENT": ("WAITING", False), "ENGINEER": ("SKIPPED", False)}
    assert db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.entry_type == "REFUND")) == 1


@mariadb_only
def test_ac_f5_10_concurrent_pay_and_supplier_cancel(client, db):
    """결제와 업체 취소가 겹쳐도 둘 중 하나의 순서로 끝난다 — 취소한 업체가 든 유효 청구서가 남지 않는다."""
    user, perf_id, (c, _) = _ready(client, db)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    sup = _copy(_as(db, db.get(Supplier, c).user))
    payer = _copy(user)
    got = _race(db, [
        lambda: payer.post(f"/api/v1/orders/{order_id}/payments", json={"amount": TOTAL}, headers={"Idempotency-Key": "r"}),
        lambda: sup.post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "사정"}),
    ])
    assert got in ([200, 200], [200, 409])
    assert db.get(Performance, perf_id).status == "ASSIGNING"
    assert db.get(Order, order_id).status == "CANCELLED"
    refunds = db.scalar(select(func.count()).select_from(LedgerEntry).where(LedgerEntry.entry_type == "REFUND"))
    assert refunds == (1 if got == [200, 200] else 0)


@mariadb_only
def test_ac_f5_10_concurrent_invoice_and_supplier_cancel(client, db):
    user, perf_id, (c, _) = _ready(client, db)
    sup = _copy(_as(db, db.get(Supplier, c).user))
    payer = _copy(user)
    got = _race(db, [
        lambda: payer.post(f"/api/v1/performances/{perf_id}/order"),
        lambda: sup.post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "사정"}),
    ])
    assert got in ([200, 201], [200, 409])
    assert db.scalar(select(func.count()).select_from(Order).where(Order.status != "CANCELLED")) == 0
