"""단계별 견적 비교 GET /stages/{stageId}/quotes (T4-03 #48, AC-F3-20~24).

요청서: 관객 80명, 리허설 17:00 (tests/f2/test_posting.py). 공간 C 수용 120명.
A 풀스펙(설치 가능 15:00), B 설치 가능 17:00 → 설치 시간 0분 경고, C 설치 가능 15:00 → 120분 통과.
"""
from datetime import datetime

import pytest

from app.check.calc import overall
from app.confirm.router import get_now
from app.main import app
from app.models.request import Stage
from tests.conftest import login_as, make_supplier, make_user
from tests.f2.test_quotes import _as, _body, _stage_id, _supplier_d
from tests.f3.test_check_wiring import _confirm_venue, _fixed_today, snap  # noqa: F401 (픽스처)
from tests.f2.test_posting import _body as _request_body, _published, _set_stages

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
    assert (rows["C"]["venueName"], rows["C"]["maxCapacity"], rows["C"]["setupAvailableTime"]) == ("공간 C", 120, "15:00")
    assert (rows["C"]["venueId"], rows["C"]["venueType"]) == (7, "CULTURE_SPACE")


def test_ac_f3_20_compare_has_company_and_chat_room(venue_stage):
    """비교 카드 맨 위 업체 상호, [채팅] 이 열 방 번호 (견적서를 보내면 방이 생긴다)."""
    user, stage_id = venue_stage

    rows = user.get(f"/api/v1/stages/{stage_id}/quotes").json()

    assert all(q["companyName"] for q in rows)
    assert all(isinstance(q["roomId"], int) for q in rows)
    assert len({q["roomId"] for q in rows}) == 3  # 업체가 다르면 방도 다르다


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


def _equipment_with_venue(client, db):
    """공연장이 확정된 장비 단계. (사용자 client, 공연 id, 장비 단계 id)"""
    user, perf_id = _published(client, db)
    db.rollback()
    _confirm_venue(db, perf_id, {
        "venueId": 7, "name": "공간", "sido": "광주광역시", "sigungu": "동구", "venueType": "CULTURE_SPACE",
        "maxCapacity": 120, "checkinTime": "14:00", "checkoutTime": "23:00", "hasResidentEngineer": False,
        "conditions": {}, "equipment": [],
    })
    _set_stages(db, perf_id, EQUIPMENT="OPEN")
    return user, perf_id, _stage_id(db, perf_id, "EQUIPMENT")


def _chk05(user, stage_id):
    res = user.get(f"/api/v1/stages/{stage_id}/quotes")
    assert res.status_code == 200, res.text
    return next(c for c in res.json()[0]["checks"] if c["id"] == "CHK-05")


def test_ac_f3_22_conflict_quote_cannot_be_confirmed(client, db, monkeypatch):
    """공연장 B(설치 가능 17:00) + D 설치 90분 → 18:30, 리허설 17:00 보다 90분 늦음 → 확정은 409 CHECK_CONFLICT."""
    monkeypatch.setitem(app.dependency_overrides, get_now, lambda: datetime(2026, 11, 14, 10, 0))
    user, perf_id, stage_id = _equipment_with_venue(client, db)
    d = _as(db, _supplier_d(db).user)
    quote = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body(setupStart="17:00")).json()
    chk = _chk05(user, stage_id)
    assert chk["result"] == "CONFLICT" and "90분 늦" in chk["message"]
    user.post(f"/api/v1/chat-rooms/{quote['chatRoomId']}/start")
    card = d.post(f"/api/v1/quotes/{quote['quoteId']}/confirm-requests")
    assert card.status_code == 201, card.text
    user.post(f"/api/v1/confirm-requests/{card.json()['id']}/view")

    res = user.post(f"/api/v1/confirm-requests/{card.json()['id']}/accept", headers={"Idempotency-Key": "f3-22"})

    assert (res.status_code, res.json()["code"]) == (409, "CHECK_CONFLICT")
    db.expire_all()
    assert db.get(Stage, stage_id).confirmed_quote_version_id is None


def test_ac_f3_24_rehearsal_change_conflicts_then_fixed_quote_passes_in_compare(client, db):
    """D 16:30 완료 통과 → 리허설 16:00 으로 바꾸면 충돌 → D 가 15:45 완료로 고치면 다시 통과 (비교 API)."""
    user, perf_id, stage_id = _equipment_with_venue(client, db)
    d = _as(db, _supplier_d(db).user)
    quote = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()
    assert _chk05(user, stage_id)["result"] == "PASS"

    res = user.put(f"/api/v1/performances/{perf_id}", json=_request_body(rehearsalStart="16:00"))
    assert res.status_code == 200, res.text
    assert _chk05(user, stage_id)["result"] == "CONFLICT"

    fixed = {k: v for k, v in _body(setupMinutes=45).items() if k != "label"}
    res = d.put(f"/api/v1/quotes/{quote['quoteId']}", json={**fixed, "version": 1})
    assert res.status_code == 200, res.text
    assert _chk05(user, stage_id)["result"] == "PASS"
