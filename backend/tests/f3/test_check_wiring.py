"""자동 검사 연결 (AC-F3-20~23): 2번 performance_input → 4번 run_checks → 3번 견적서 응답 checks[].

요청서 값(관객 80명, 리허설 17:00)과, 장비 견적서에서는 이미 확정된 공연장 견적서(입실 14:00)가 검사에 들어간다.
"""
from datetime import time

import pytest
from sqlalchemy import select

from app.main import app
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.request import service as request_service
from app.request.router import get_today
from app.supplier import service as supplier_service
from app.supplier.service import VenueSnapshot
from tests.conftest import make_supplier
from tests.f2.test_posting import TODAY, _published, _set_stages
from tests.f2.test_quotes import _as, _body, _stage_id, _venue_body


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


@pytest.fixture
def snap(monkeypatch):
    s = VenueSnapshot(
        venue_id=7, name="공간 C", sido="광주광역시", sigungu="동구", venue_type="CULTURE_SPACE",
        max_capacity=120, checkin_time=time(14, 0), checkout_time=time(23, 0), has_resident_engineer=False,
        conditions={"BAND_ALLOWED": True, "HAS_PARKING": None},
    )
    monkeypatch.setattr(supplier_service, "get_venue_snapshot", lambda db, venue_id: s)
    return s


def _checks(res) -> dict[str, str]:
    assert res.status_code == 201, res.text
    return {c["id"]: c["result"] for c in res.json()["checks"]}


def test_performance_input_from_request(client, db):
    _, perf_id = _published(client, db)
    db.rollback()
    perf = db.get(Performance, perf_id)
    perf.needs = {**perf.needs, "venue": {**perf.needs["venue"], "mustHave": ["BAND_ALLOWED"], "budget": 600000}}
    db.commit()

    p = request_service.performance_input(db, perf_id)

    assert (p.version, p.audience, p.rehearsal_start, p.show_start, p.show_end) == (1, 80, time(17), time(19), time(21))
    assert p.must_have == frozenset({"BAND_ALLOWED"})
    assert p.budgets == {"VENUE": 600000}


def test_ac_f3_20_venue_quote_checks_capacity_and_setup_window(client, db, snap):
    _, perf_id = _published(client, db)
    stage_id = _stage_id(db, perf_id, "VENUE")
    c = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)

    checks = _checks(c.post(f"/api/v1/stages/{stage_id}/quotes", json=_venue_body()))

    assert checks["CHK-01"] == "PASS"  # 수용 120명 ≥ 관객 80명
    assert checks["CHK-02"] == "PASS"  # 설치 가능 15:00 ~ 리허설 17:00 = 120분


def _confirm_venue(db, perf_id, snap_dict):
    """공연장 단계를 확정된 상태로 (공간 스냅샷이 든 견적서 버전)."""
    stage = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))
    quote = Quote(stage_id=stage.id, supplier_id=make_supplier(db, review_status="APPROVED", categories=("VENUE",)).id,
                  label="기본형", current_version=1, status="CONFIRMED")
    db.add(quote)
    db.flush()
    qv = QuoteVersion(
        quote_id=quote.id, version=1, based_on_perf_version=1, staff=[], items=[], venue_id=7, venue_snapshot=snap_dict,
        checkin_time=time(14), setup_available_time=time(15),
        amount_items=500000, amount_transport=0, amount_install=0, amount_labor=0, amount_etc=0, total_amount=500000,
    )
    db.add(qv)
    db.flush()
    stage.status = "CONFIRMED"
    stage.confirmed_quote_version_id = qv.id
    db.commit()


@pytest.mark.parametrize(("setup_start", "expected"), [("15:00", "PASS"), ("13:00", "CONFLICT")])
def test_ac_f3_21_equipment_quote_checked_against_confirmed_venue(client, db, setup_start, expected):
    """앞 단계에서 확정된 공연장 입실 14:00 보다 일찍 설치를 시작하면 CHK-04 충돌."""
    _, perf_id = _published(client, db)
    db.rollback()
    _confirm_venue(db, perf_id, {
        "venueId": 7, "name": "공간 C", "sido": "광주광역시", "sigungu": "동구", "venueType": "CULTURE_SPACE",
        "maxCapacity": 120, "checkinTime": "14:00", "checkoutTime": "23:00", "hasResidentEngineer": False,
        "conditions": {"BAND_ALLOWED": True}, "equipment": [],
    })
    _set_stages(db, perf_id, EQUIPMENT="OPEN")
    stage_id = _stage_id(db, perf_id, "EQUIPMENT")
    d = _as(db, make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "INSTALL")).user)

    checks = _checks(d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body(setupStart=setup_start, setupMinutes=60)))

    assert checks["CHK-04"] == expected
