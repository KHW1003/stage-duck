"""공고 노출 조건·내림·버전 갱신 (T2-03 #37, AC-F2-11~13, api-contract.md 3.2 PUT /performances/{id}, withdraw)."""
from datetime import date, time

import pytest
from sqlalchemy import select

from app.main import app
from app.models.history import StatusHistory
from app.models.request import Performance, PerformanceVersion, Stage
from app.request import service
from app.request.router import get_today
from tests.conftest import login_as, make_supplier, make_user

TODAY = date(2026, 11, 12)


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def _body(**kw) -> dict:
    body = {
        "title": "가을밤 밴드 공연", "form": "BAND", "lineup": [],
        "showDate": "2026-11-28", "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
        "audience": 80, "sido": "광주광역시", "sigungu": "동구", "contactPhone": None,
        "needs": {
            "venue": {"needed": True, "types": ["CULTURE_SPACE"], "capacity": 80},
            "equipment": {"needed": True, "proposalWanted": True, "items": [{"name": "보컬 마이크", "qty": 4}]},
            "engineer": {"needed": True, "tasks": ["FOH"]},
        },
    }
    body.update(kw)
    return body


def _published(client, db, *, publish=True):
    """사용자 하나가 요청서를 쓰고 게시한다. (로그인한 client, 공연 id)"""
    user = login_as(client, make_user(db))
    perf_id = user.post("/api/v1/performances", json=_body()).json()["id"]
    if publish:
        assert user.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200
    return user, perf_id


def _set_stages(db, perf_id, **statuses):
    for stage in db.scalars(select(Stage).where(Stage.performance_id == perf_id)):
        if stage.stage_type in statuses:
            stage.status = statuses[stage.stage_type]
    db.commit()


def _stages(db, perf_id) -> dict[str, str]:
    db.expire_all()
    return {s.stage_type: s.status for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}


def _visible(db, supplier) -> list[tuple[int, str]]:
    return [(p.performance_id, p.stage_type) for p in service.open_postings_for(db, supplier)]


# ---- 노출 조건 (AC-F2-11·12) --------------------------------------------------------------


def test_ac_f2_11_venue_stage_posting_hidden_from_equipment_and_engineer(client, db):
    _, perf_id = _published(client, db)
    venue = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    equipment = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "INSTALL"))
    engineer = make_supplier(db, review_status="APPROVED", categories=("ENGINEER",))
    venue_stage = db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))

    assert _visible(db, venue) == [(perf_id, "VENUE")]
    assert _visible(db, equipment) == []
    assert _visible(db, engineer) == []
    assert service.posting_visible(db, venue_stage, venue) is True
    assert service.posting_visible(db, venue_stage, equipment) is False


@pytest.mark.parametrize("review_status", ["PENDING", "REJECTED", "SUSPENDED"])
def test_ac_f2_12_unapproved_supplier_sees_no_posting(client, db, review_status):
    _, perf_id = _published(client, db)
    supplier = make_supplier(db, review_status=review_status, categories=("VENUE",))
    venue_stage = db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))

    assert _visible(db, supplier) == []
    assert service.posting_visible(db, venue_stage, supplier) is False


def test_equipment_stage_visible_to_equipment_and_install_suppliers(client, db):
    _, perf_id = _published(client, db)
    _set_stages(db, perf_id, VENUE="CONFIRMED", EQUIPMENT="NEGOTIATING")

    for categories in (("EQUIPMENT",), ("INSTALL",)):
        supplier = make_supplier(db, review_status="APPROVED", categories=categories)
        assert _visible(db, supplier) == [(perf_id, "EQUIPMENT")]
    assert _visible(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",))) == []


def test_draft_and_withdrawn_performances_are_not_posted(client, db):
    _published(client, db, publish=False)  # DRAFT 는 단계가 없다
    user, perf_id = _published(client, db)
    assert user.post(f"/api/v1/performances/{perf_id}/withdraw").status_code == 200

    assert _visible(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",))) == []


def test_postings_sorted_by_show_date_and_filtered_by_sido(client, db):
    user = login_as(client, make_user(db))
    late = user.post("/api/v1/performances", json=_body(showDate="2026-12-20")).json()["id"]
    soon = user.post("/api/v1/performances", json=_body(showDate="2026-11-27")).json()["id"]
    seoul = user.post("/api/v1/performances", json=_body(sido="서울특별시", sigungu="마포구")).json()["id"]
    for pid in (late, soon, seoul):
        user.post(f"/api/v1/performances/{pid}/publish")
    venue = make_supplier(db, review_status="APPROVED", categories=("VENUE",))

    assert [p.performance_id for p in service.open_postings_for(db, venue, sido="광주광역시")] == [soon, late]


# ---- 버전 갱신 (AC-F2-13) -----------------------------------------------------------------


def test_ac_f2_13_rehearsal_change_makes_v2_and_rechecks_confirmed_stages(client, db):
    user, perf_id = _published(client, db)
    _set_stages(db, perf_id, VENUE="CONFIRMED", EQUIPMENT="CONFIRMED", ENGINEER="OPEN")

    res = user.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00"))

    assert res.status_code == 200, res.text
    assert res.json()["currentVersion"] == 2
    versions = {v.version: v for v in db.scalars(select(PerformanceVersion).where(PerformanceVersion.performance_id == perf_id))}
    assert versions[1].snapshot["rehearsalStart"] == "17:00:00"  # v1 은 그대로
    assert versions[2].snapshot["rehearsalStart"] == "16:00:00"
    assert versions[2].changed_fields == ["rehearsalStart"]
    assert db.get(Performance, perf_id).rehearsal_start == time(16, 0)
    assert _stages(db, perf_id) == {"VENUE": "RECHECK", "EQUIPMENT": "RECHECK", "ENGINEER": "OPEN"}
    rechecked = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "stage", StatusHistory.to_status == "RECHECK")).all()
    assert len(rechecked) == 2


def test_needs_change_is_listed_by_part(client, db):
    user, perf_id = _published(client, db)
    needs = _body()["needs"]
    needs["equipment"]["items"] = [{"name": "보컬 마이크", "qty": 6}]

    user.put(f"/api/v1/performances/{perf_id}", json=_body(audience=90, needs=needs))

    v2 = db.scalar(select(PerformanceVersion).where(PerformanceVersion.performance_id == perf_id, PerformanceVersion.version == 2))
    assert v2.changed_fields == ["audience", "needs.equipment"]


def test_draft_edit_also_makes_new_version(client, db):
    user, perf_id = _published(client, db, publish=False)

    res = user.put(f"/api/v1/performances/{perf_id}", json=_body(title="겨울밤 밴드 공연"))

    assert (res.status_code, res.json()["currentVersion"], res.json()["status"]) == (200, 2, "DRAFT")


def test_needed_cannot_change_after_publish(client, db):
    user, perf_id = _published(client, db)
    needs = _body()["needs"]
    needs["equipment"] = {"needed": False}

    res = user.put(f"/api/v1/performances/{perf_id}", json=_body(needs=needs))

    assert res.status_code == 400
    assert "needs.equipment.needed" in [e["field"] for e in res.json()["fieldErrors"]]
    assert db.get(Performance, perf_id).current_version == 1


def test_show_date_rule_checked_only_when_date_changes(client, db):
    user, perf_id = _published(client, db)
    app.dependency_overrides[get_today] = lambda: date(2026, 11, 20)  # 공연(11/28)까지 8일

    assert user.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00")).status_code == 200
    res = user.put(f"/api/v1/performances/{perf_id}", json=_body(showDate="2026-11-29"))
    assert res.status_code == 400
    assert "showDate" in [e["field"] for e in res.json()["fieldErrors"]]


def test_edit_other_users_performance_not_found(client, db):
    _, perf_id = _published(client, db)
    other = login_as(client, make_user(db))

    res = other.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00"))

    assert (res.status_code, res.json()["code"]) == (404, "NOT_FOUND")
    assert db.get(Performance, perf_id).current_version == 1


def test_supplier_cannot_edit_or_withdraw(client, db):
    _, perf_id = _published(client, db)
    supplier = login_as(client, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)

    assert supplier.put(f"/api/v1/performances/{perf_id}", json=_body()).status_code == 404
    assert supplier.post(f"/api/v1/performances/{perf_id}/withdraw").status_code == 404


def test_withdrawn_performance_cannot_be_edited(client, db):
    user, perf_id = _published(client, db)
    user.post(f"/api/v1/performances/{perf_id}/withdraw")

    res = user.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00"))

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


# ---- 공고 내림 ----------------------------------------------------------------------------


def test_withdraw_published_performance(client, db):
    user, perf_id = _published(client, db)

    res = user.post(f"/api/v1/performances/{perf_id}/withdraw")

    assert (res.status_code, res.json()["status"]) == (200, "WITHDRAWN")
    history = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "performance", StatusHistory.entity_id == perf_id)).all()
    assert [(h.from_status, h.to_status) for h in history][-1] == ("PUBLISHED", "WITHDRAWN")


@pytest.mark.parametrize("publish", [True, False])
def test_withdraw_twice_or_draft_is_invalid_state(client, db, publish):
    user, perf_id = _published(client, db, publish=publish)
    if publish:
        user.post(f"/api/v1/performances/{perf_id}/withdraw")

    res = user.post(f"/api/v1/performances/{perf_id}/withdraw")

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


def test_withdraw_other_users_performance_not_found(client, db):
    _, perf_id = _published(client, db)
    other = login_as(client, make_user(db))

    assert other.post(f"/api/v1/performances/{perf_id}/withdraw").status_code == 404
    assert db.get(Performance, perf_id).status == "PUBLISHED"


def test_edit_without_contact_phone_keeps_saved_number(client, db):
    user = login_as(client, make_user(db))
    perf_id = user.post("/api/v1/performances", json=_body(contactPhone="01000000000")).json()["id"]
    body = _body(rehearsalStart="16:00")
    body.pop("contactPhone")

    assert user.put(f"/api/v1/performances/{perf_id}", json=body).status_code == 200

    db.expire_all()
    assert db.get(Performance, perf_id).contact_phone == "01000000000"
    v2 = db.scalar(select(PerformanceVersion).where(PerformanceVersion.performance_id == perf_id, PerformanceVersion.version == 2))
    assert v2.changed_fields == ["rehearsalStart"]
    assert user.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00", contactPhone=None)).status_code == 200
    db.expire_all()
    assert db.get(Performance, perf_id).contact_phone is None  # 보내서 지우면 지워진다
