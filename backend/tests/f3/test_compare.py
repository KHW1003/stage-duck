"""단계별 견적 비교 GET /stages/{stageId}/quotes (T4-03 #48, AC-F3-20~24).

요청서: 관객 80명, 리허설 17:00 (tests/f2/test_posting.py). 공간 C 수용 120명.
A 풀스펙(설치 가능 15:00), B 설치 가능 17:00 → 설치 시간 0분 경고, C 설치 가능 15:00 → 120분 통과.
"""
import pytest

from app.check.calc import overall
from tests.conftest import login_as, make_supplier, make_user
from tests.f2.test_quotes import _as, _body, _stage_id
from tests.f3.test_check_wiring import _fixed_today, snap  # noqa: F401 (픽스처)
from tests.f2.test_posting import _published

NO_EXTRA = {"equipment": False, "engineer": False, "install": False, "transport": False}


def _send(db, stage_id, label, **kw):
    c = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)
    body = _body(**{"venueId": 7, "checkinTime": "14:00", "setupAvailableTime": "15:00", "label": label, **kw})
    res = c.post(f"/api/v1/stages/{stage_id}/quotes", json=body)
    assert res.status_code == 201, res.text


@pytest.fixture
def venue_stage(client, db, snap):  # noqa: F811
    user, perf_id = _published(client, db)
    stage_id = _stage_id(db, perf_id, "VENUE")
    _send(db, stage_id, "A")
    _send(db, stage_id, "B", setupAvailableTime="17:00", includes=NO_EXTRA)
    _send(db, stage_id, "C", includes=NO_EXTRA)
    return user, stage_id


def test_ac_f3_20_compare_full_spec_warning_pass(venue_stage):
    user, stage_id = venue_stage

    res = user.get(f"/api/v1/stages/{stage_id}/quotes")

    assert res.status_code == 200, res.text
    rows = {q["label"]: q for q in res.json()}
    assert [(k, rows[k]["isFullSpec"], rows[k]["overall"]) for k in "ABC"] == [
        ("A", True, "PASS"), ("B", False, "WARNING"), ("C", False, "PASS"),
    ]
    b_setup = next(c for c in rows["B"]["checks"] if c["id"] == "CHK-02")
    assert b_setup["result"] == "WARNING" and "0분" in b_setup["message"]
    assert {q["offered"] for q in rows.values()} == {False}


def test_ac_f3_20_other_user_gets_404(venue_stage, client, db):
    _, stage_id = venue_stage
    other = login_as(client, make_user(db))
    assert other.get(f"/api/v1/stages/{stage_id}/quotes").status_code == 404
    assert other.get("/api/v1/stages/999999/quotes").status_code == 404


def test_ac_f3_20_supplier_cannot_compare(venue_stage, db):
    _, stage_id = venue_stage
    supplier = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)
    assert supplier.get(f"/api/v1/stages/{stage_id}/quotes").status_code in (403, 404)


@pytest.mark.parametrize(("results", "expected"), [
    ([], "PASS"), (["PASS", "PASS"], "PASS"), (["PASS", "NEEDS_INFO"], "NEEDS_INFO"),
    (["NEEDS_INFO", "WARNING"], "WARNING"), (["WARNING", "CONFLICT", "PASS"], "CONFLICT"),
])
def test_ac_f3_20_overall(results, expected):
    assert overall(results) == expected
