"""내 공연 현황 (T2-06 #40, AC-F5-02, api-contract.md 3.2 GET /performances?mine=true · /{id} · /{id}/versions)."""
from datetime import date

import pytest
from sqlalchemy import select

from app.main import app
from app.models.request import Stage
from app.request import calc
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
        "title": "가을밤 밴드 공연", "form": "BAND", "showDate": "2026-11-28",
        "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
        "audience": 80, "sido": "광주광역시", "sigungu": "동구", "contactPhone": "01000000000",
        "lineup": [{"part": "보컬", "count": 1}],
        "needs": {
            "venue": {"needed": True}, "equipment": {"needed": True},
            "engineer": {"needed": True, "tasks": ["FOH"]},
        },
    }
    body.update(kw)
    return body


def _create(user, publish=True, **kw) -> int:
    perf_id = user.post("/api/v1/performances", json=_body(**kw)).json()["id"]
    if publish:
        assert user.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200
    return perf_id


def _set_stages(db, perf_id, **statuses):
    for stage in db.scalars(select(Stage).where(Stage.performance_id == perf_id)):
        if stage.stage_type in statuses:
            stage.status = statuses[stage.stage_type]
    db.commit()


def _mine(user) -> dict:
    res = user.get("/api/v1/performances?mine=true")
    assert res.status_code == 200, res.text
    return res.json()


def test_ac_f5_02_my_performance_shows_stages_and_next_action(client, db):
    user = login_as(client, make_user(db))
    perf_id = _create(user)
    _set_stages(db, perf_id, VENUE="CONFIRMED", EQUIPMENT="NEGOTIATING")

    item = next(p for p in _mine(user)["active"] if p["id"] == perf_id)

    assert [(s["stageType"], s["status"]) for s in item["stages"]] == [
        ("VENUE", "CONFIRMED"), ("EQUIPMENT", "NEGOTIATING"), ("ENGINEER", "WAITING"),
    ]
    assert item["nextAction"] == "NEGOTIATE"
    assert item["nextStageId"] == next(s["id"] for s in item["stages"] if s["stageType"] == "EQUIPMENT")
    assert (item["title"], item["showDate"], item["sido"], item["sigungu"], item["audience"]) == (
        "가을밤 밴드 공연", "2026-11-28", "광주광역시", "동구", 80,
    )
    assert "contactPhone" not in item  # 연락처는 결제 후 담당표·/me 에서만 (CLAUDE.md 20)


def test_my_performances_grouped_active_draft_past(client, db):
    user = login_as(client, make_user(db))
    active = _create(user)
    draft = _create(user, publish=False, title="봄 정기공연")
    withdrawn = _create(user, title="내린 공연")
    user.post(f"/api/v1/performances/{withdrawn}/withdraw")
    app.dependency_overrides[get_today] = lambda: date(2026, 11, 29)  # 공연 다음 날
    over = _create(user, showDate="2026-12-20")  # 오늘 + 21일 → 진행 중

    data = _mine(user)

    assert {p["id"] for p in data["active"]} == {over}
    assert {p["id"] for p in data["draft"]} == {draft}
    assert {p["id"] for p in data["past"]} == {active, withdrawn}  # 공연일이 지났거나 내린 공고


def test_active_sorted_by_show_date(client, db):
    user = login_as(client, make_user(db))
    late = _create(user, showDate="2026-12-19")
    soon = _create(user, showDate="2026-11-28")

    assert [p["id"] for p in _mine(user)["active"]] == [soon, late]


def test_my_performances_only_mine(client, db):
    other = login_as(client, make_user(db))
    _create(other)
    me = login_as(client, make_user(db))

    assert _mine(me) == {"active": [], "draft": [], "past": []}


def test_supplier_cannot_list_performances(client, db):
    supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    assert login_as(client, supplier.user).get("/api/v1/performances?mine=true").status_code == 404


# ---- 상세·버전 -----------------------------------------------------------------------------


def test_performance_detail_current_version_and_stages(client, db):
    user = login_as(client, make_user(db))
    perf_id = _create(user)
    _set_stages(db, perf_id, VENUE="CONFIRMED")
    user.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00"))

    res = user.get(f"/api/v1/performances/{perf_id}")

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["currentVersion"], out["rehearsalStart"], out["status"]) == (2, "16:00:00", "PUBLISHED")
    assert out["lineup"] == [{"part": "보컬", "count": 1}]
    assert out["needs"]["engineer"]["tasks"] == ["FOH"]
    assert out["hasContactPhone"] is True and "contactPhone" not in out
    assert out["nextAction"] == "RECHECK"
    assert [s["status"] for s in out["stages"]] == ["RECHECK", "WAITING", "WAITING"]


def test_performance_versions_history(client, db):
    user = login_as(client, make_user(db))
    perf_id = _create(user)
    user.put(f"/api/v1/performances/{perf_id}", json=_body(rehearsalStart="16:00"))

    res = user.get(f"/api/v1/performances/{perf_id}/versions")

    assert res.status_code == 200
    assert [(v["version"], v["changedFields"]) for v in res.json()] == [(2, ["rehearsalStart"]), (1, [])]


@pytest.mark.parametrize("path", ["", "/versions"])
def test_other_users_performance_detail_not_found(client, db, path):
    perf_id = _create(login_as(client, make_user(db)))
    other = login_as(client, make_user(db))

    res = other.get(f"/api/v1/performances/{perf_id}{path}")

    assert (res.status_code, res.json()["code"]) == (404, "NOT_FOUND")


# ---- 다음 할 일 (순수 함수) ----------------------------------------------------------------


@pytest.mark.parametrize(
    "perf_status, stages, expected",
    [
        ("DRAFT", [], ("PUBLISH", None)),
        ("PUBLISHED", ["OPEN", "WAITING", "WAITING"], ("WAIT_QUOTES", 0)),
        ("ASSIGNING", ["CONFIRMED", "NEGOTIATING", "WAITING"], ("NEGOTIATE", 1)),
        ("ASSIGNING", ["CONFIRMED", "WAITING", "WAITING"], ("OPEN_NEXT", 0)),
        ("ASSIGNING", ["CONFIRMED", "SKIPPED", "WAITING"], ("OPEN_NEXT", 1)),
        ("ASSIGNING", ["RECHECK", "OPEN", "WAITING"], ("RECHECK", 0)),
        ("AWAITING_PAYMENT", ["CONFIRMED", "CONFIRMED", "SKIPPED"], ("PAY", None)),
        ("AWAITING_PAYMENT", ["CONFIRMED", "RECHECK", "SKIPPED"], ("RECHECK", 1)),
        ("CONFIRMED", ["CONFIRMED", "CONFIRMED", "CONFIRMED"], ("DONE", None)),
        ("WITHDRAWN", ["OPEN", "WAITING", "WAITING"], ("NONE", None)),
    ],
)
def test_next_action(perf_status, stages, expected):
    assert calc.next_action(perf_status, stages) == expected
