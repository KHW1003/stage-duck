"""통합 청구서 POST·GET /performances/{id}/order (T4-05 #50, FR-PAY-01, AC-F5-03·04).

예시 값 (docs/guides/시연_예시값.md): 공연장 C 500,000 + 장비 D 1,350,000 = 1,850,000, 이용료 5% 92,500, 청구서 1,942,500원.
"""
from datetime import datetime

import pytest
from sqlalchemy import select

from app.main import app
from app.models.payment import Order
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.payment.router import get_now
from tests.conftest import make_supplier, make_user
from tests.f2.test_posting import _published
from tests.f2.test_quotes import _as
from tests.f3.test_check_wiring import _fixed_today  # noqa: F401 (픽스처)

NOW = datetime(2026, 11, 20, 10, 0)


@pytest.fixture(autouse=True)
def _fixed_now():
    app.dependency_overrides[get_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_now, None)


def _confirm(db, perf_id: int, stage_type: str, amount: int) -> int:
    """그 단계를 확정된 상태로 (확정 견적서 버전 금액 = amount). 업체 id 를 돌려준다."""
    stage = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == stage_type))
    supplier = make_supplier(db, review_status="APPROVED", categories=(stage_type,))
    quote = Quote(stage_id=stage.id, supplier_id=supplier.id, label="기본형", current_version=1, status="CONFIRMED")
    db.add(quote)
    db.flush()
    qv = QuoteVersion(
        quote_id=quote.id, version=1, based_on_perf_version=1, staff=[], items=[],
        amount_items=amount, amount_transport=0, amount_install=0, amount_labor=0, amount_etc=0, total_amount=amount,
    )
    db.add(qv)
    db.flush()
    stage.status, stage.confirmed_quote_version_id = "CONFIRMED", qv.id
    db.commit()
    return supplier.id


def _ready(client, db, *, engineer="SKIPPED"):
    """C 500,000 · D 1,350,000 확정, 엔지니어 건너뜀 → 결제 대기. (사용자 client, 공연 id, (C, D) 업체 id)"""
    user, perf_id = _published(client, db)
    db.rollback()
    c = _confirm(db, perf_id, "VENUE", 500000)
    d = _confirm(db, perf_id, "EQUIPMENT", 1350000)
    db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "ENGINEER")).status = engineer
    db.get(Performance, perf_id).status = "AWAITING_PAYMENT" if engineer in ("SKIPPED", "CONFIRMED") else "ASSIGNING"
    db.commit()
    return user, perf_id, (c, d)


def test_ac_f5_03_invoice_is_items_plus_5_percent_fee(client, db):
    user, perf_id, (c, d) = _ready(client, db)

    res = user.post(f"/api/v1/performances/{perf_id}/order")

    assert res.status_code == 201, res.text
    o = res.json()
    assert (o["itemsTotal"], o["platformFee"], o["totalAmount"], o["status"]) == (1850000, 92500, 1942500, "ISSUED")
    assert [(ln["stageType"], ln["supplierId"], ln["amount"]) for ln in o["lines"]] == [
        ("VENUE", c, 500000), ("EQUIPMENT", d, 1350000),
    ]
    assert [ln["companyName"] for ln in o["lines"]] == [f"가상업체{db.get(Supplier, s).user_id}" for s in (c, d)]
    assert o["issuedAt"].startswith("2026-11-20T10:00")
    assert user.get(f"/api/v1/performances/{perf_id}/order").json() == o


def test_ac_f5_03_second_post_returns_same_order(client, db):
    user, perf_id, _ = _ready(client, db)
    first = user.post(f"/api/v1/performances/{perf_id}/order").json()

    again = user.post(f"/api/v1/performances/{perf_id}/order")

    assert again.status_code == 200
    assert again.json()["id"] == first["id"]
    assert len(db.scalars(select(Order).where(Order.performance_id == perf_id)).all()) == 1


@pytest.mark.parametrize("engineer", ["OPEN", "NEGOTIATING", "RECHECK", "WAITING"])
def test_ac_f5_04_no_invoice_while_a_stage_is_not_confirmed(client, db, engineer):
    user, perf_id, _ = _ready(client, db, engineer=engineer)

    res = user.post(f"/api/v1/performances/{perf_id}/order")

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")
    assert user.get(f"/api/v1/performances/{perf_id}/order").status_code == 404
    assert db.scalars(select(Order).where(Order.performance_id == perf_id)).all() == []


@pytest.mark.parametrize(("lines", "fee", "total"), [
    ([500000, 1350000], 92500, 1942500),
    ([171990], 8599, 180589),  # 8,599.5 → 원 미만 버림
    ([1], 0, 1),
    ([19], 0, 19),
    ([20], 1, 21),
])
def test_ac_f5_03_fee_rounds_down(lines, fee, total):
    from app.payment.calc import invoice_amounts
    from app.payment.service import PLATFORM_FEE_RATE

    a = invoice_amounts(lines, PLATFORM_FEE_RATE)
    assert (a.platform_fee, a.total_amount) == (fee, total)


def test_ac_f5_03_other_people_get_404(client, db):
    _, perf_id, _ = _ready(client, db)
    other = _as(db, make_user(db))
    assert other.post(f"/api/v1/performances/{perf_id}/order").status_code == 404
    assert other.get(f"/api/v1/performances/{perf_id}/order").status_code == 404
    supplier = _as(db, make_supplier(db, review_status="APPROVED").user)
    assert supplier.get(f"/api/v1/performances/{perf_id}/order").status_code == 404
    assert db.scalars(select(Order).where(Order.performance_id == perf_id)).all() == []
