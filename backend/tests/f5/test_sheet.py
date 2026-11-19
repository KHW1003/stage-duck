"""최종 담당표 GET /performances/{id}/sheet (T4-08 #53, FR-PAY-04, AC-F5-11·12).

공연장 C 500,000 · 장비 D 1,350,000 확정, 엔지니어 건너뜀 (tests/f5/test_order.py _ready). 리허설 17:00 · 공연 19:00~21:00.
"""
from datetime import time

from sqlalchemy import select

from app.models.payment import Order
from app.models.quote import QuoteVersion
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.models.user import User
from tests.conftest import make_supplier, make_user
from tests.f2.test_quotes import _as
from tests.f5.test_order import _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

TOTAL = 1942500


def _paid(client, db):
    user, perf_id, (c, d) = _ready(client, db)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    res = user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": TOTAL}, headers={"Idempotency-Key": "k"})
    assert res.json()["status"] == "SUCCEEDED"
    return user, perf_id, (c, d)


def _supplier_client(db, supplier_id):
    return _as(db, db.get(Supplier, supplier_id).user)


def test_ac_f5_11_user_and_confirmed_suppliers_see_same_sheet_with_contacts(client, db):
    user, perf_id, (c, d) = _paid(client, db)

    sheets = [cl.get(f"/api/v1/performances/{perf_id}/sheet") for cl in (user, _supplier_client(db, c), _supplier_client(db, d))]

    assert [s.status_code for s in sheets] == [200, 200, 200]
    assert sheets[0].json() == sheets[1].json() == sheets[2].json()
    s = sheets[0].json()
    assert s["paid"] is True
    assert [(ln["stageType"], ln["status"], ln["amount"]) for ln in s["lines"]] == [
        ("VENUE", "CONFIRMED", 500000), ("EQUIPMENT", "CONFIRMED", 1350000), ("ENGINEER", "SKIPPED", None),
    ]
    perf = db.get(Performance, perf_id)
    owner = db.get(User, perf.user_id)
    sc, sd = db.get(Supplier, c), db.get(Supplier, d)
    assert [(x["role"], x["phone"], x["email"]) for x in s["contacts"]] == [
        ("USER", perf.contact_phone or owner.phone, owner.email),
        ("공간", sc.main_phone, sc.user.email),
        ("장비", sd.main_phone, sd.user.email),
    ]


def test_ac_f5_11_other_suppliers_and_users_get_404(client, db):
    _, perf_id, _ = _paid(client, db)
    outsiders = [
        make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user,  # 견적만 보낸 경쟁 업체 A·B·E
        make_user(db),
        make_user(db, role="ADMIN"),
    ]
    for u in outsiders:
        assert _as(db, u).get(f"/api/v1/performances/{perf_id}/sheet").status_code == 404
    assert _as(db, make_user(db)).get("/api/v1/performances/999999/sheet").status_code == 404


def test_ac_f5_12_no_contacts_before_payment(client, db):
    user, perf_id, (c, _) = _ready(client, db)
    user.post(f"/api/v1/performances/{perf_id}/order")
    assert db.scalar(select(Order.status).where(Order.performance_id == perf_id)) == "ISSUED"

    for cl in (user, _supplier_client(db, c)):
        s = cl.get(f"/api/v1/performances/{perf_id}/sheet").json()
        assert (s["paid"], s["contacts"]) == (False, [])
        assert "phone" not in str(s) and "@" not in str(s)


def test_ac_f5_11_schedule_from_confirmed_quote_versions(client, db):
    user, perf_id, _ = _paid(client, db)
    stages = {s.stage_type: s for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}
    venue = db.get(QuoteVersion, stages["VENUE"].confirmed_quote_version_id)
    venue.checkin_time, venue.venue_snapshot = time(15, 0), {"name": "공간 C", "checkoutTime": "22:00"}
    equip = db.get(QuoteVersion, stages["EQUIPMENT"].confirmed_quote_version_id)
    equip.setup_start, equip.setup_minutes, equip.teardown_minutes = time(15, 0), 45, 60
    db.commit()

    s = user.get(f"/api/v1/performances/{perf_id}/sheet").json()

    assert [(i["time"], i["title"]) for i in s["schedule"]] == [
        ("15:00", "공간 C 입실"), ("15:00", "장비 설치 시작"), ("15:45", "장비 설치 완료"),
        ("17:00", "리허설 · 사운드체크"), ("19:00", "공연 시작"), ("21:00", "공연 끝 · 철수 시작"),
        ("22:00", "퇴실 마감"), ("22:00", "철수 완료"),
    ]
