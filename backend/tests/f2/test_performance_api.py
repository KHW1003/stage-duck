"""공연 요청서 작성·게시 API (T2-02 #36, api-contract.md 3.2 POST /performances, POST /performances/{id}/publish)."""
from datetime import date

import pytest
from sqlalchemy import select

from app.auth.tokens import CSRF_COOKIE
from app.main import app
from app.models.request import Performance, PerformanceVersion, Stage
from app.request.router import get_today
from tests.conftest import TEST_CSRF_TOKEN, login_as, make_user

TODAY = date(2026, 11, 12)  # AC-F2-06 의 "오늘"


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def _body(**kw) -> dict:
    """AC-F2-07 대표 요청: 토요일 19~21시, 80명, 리허설 17시, 광주."""
    body = {
        "title": "가을밤 밴드 공연", "form": "BAND",
        "lineup": [{"part": "보컬", "count": 1}, {"part": "기타", "count": 2}],
        "showDate": "2026-11-28", "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
        "audience": 80, "sido": "광주광역시", "sigungu": "동구", "contactPhone": None,
        "needs": {
            "venue": {"needed": True, "types": ["CULTURE_SPACE"], "capacity": 80, "mustHave": ["BAND_ALLOWED"]},
            "equipment": {"needed": True, "proposalWanted": True, "items": [{"name": "보컬 마이크", "qty": 4}],
                          "services": ["TRANSPORT", "INSTALL"], "owned": []},
            "engineer": {"needed": True, "tasks": ["FOH", "INSTALL_ASSIST"], "conditions": ["BAND_EXPERIENCE"]},
        },
    }
    body.update(kw)
    return body


def _needs(**parts) -> dict:
    needs = _body()["needs"]
    for key, value in parts.items():
        needs[key] = {**needs[key], **value}
    return needs


def _post(client, db, body: dict):
    return login_as(client, make_user(db)).post("/api/v1/performances", json=body)


def _rejected_on(res, field: str) -> None:
    assert res.status_code == 400, res.text
    assert res.json()["code"] == "VALIDATION_FAILED"
    assert field in [e["field"] for e in res.json()["fieldErrors"]]


@pytest.mark.parametrize("audience", [0, 501])
def test_ac_f2_04_audience_0_and_501_rejected(client, db, audience):
    _rejected_on(_post(client, db, _body(audience=audience)), "audience")
    assert db.scalars(select(Performance)).all() == []


@pytest.mark.parametrize("audience", [1, 500])
def test_ac_f2_04_audience_boundary_saved(client, db, audience):
    assert _post(client, db, _body(audience=audience)).status_code == 201


@pytest.mark.parametrize(
    "times, field",
    [
        ({"rehearsalStart": "19:30"}, "rehearsalStart"),  # 리허설이 공연 시작보다 늦다
        ({"rehearsalStart": "19:00"}, "rehearsalStart"),  # 리허설 = 공연 시작
        ({"showEnd": "18:00"}, "showEnd"),  # 공연 종료가 시작보다 이르다
    ],
)
def test_ac_f2_05_rehearsal_after_show_start_rejected(client, db, times, field):
    _rejected_on(_post(client, db, _body(**times)), field)


def test_ac_f2_06_show_within_14_days_rejected(client, db):
    _rejected_on(_post(client, db, _body(showDate="2026-11-25")), "showDate")


def test_ac_f2_06_show_after_14_days_saved(client, db):
    assert _post(client, db, _body(showDate="2026-11-26")).status_code == 201


def test_ac_f2_07_representative_request_saved(client, db):
    res = _post(client, db, _body())

    assert res.status_code == 201, res.text
    out = res.json()
    assert (out["status"], out["currentVersion"]) == ("DRAFT", 1)
    perf = db.get(Performance, out["id"])
    assert (perf.show_date, perf.audience, perf.sido) == (date(2026, 11, 28), 80, "광주광역시")
    assert perf.needs["engineer"]["tasks"] == ["FOH", "INSTALL_ASSIST"]
    version = db.scalars(select(PerformanceVersion).where(PerformanceVersion.performance_id == perf.id)).one()
    assert version.version == 1
    assert version.snapshot["lineup"] == [{"part": "보컬", "count": 1}, {"part": "기타", "count": 2}]


def test_ac_f2_10_engineer_needed_without_tasks_rejected(client, db):
    res = _post(client, db, _body(needs=_needs(engineer={"tasks": []})))
    _rejected_on(res, "needs.engineer.tasks")
    assert "작업" in next(e["reason"] for e in res.json()["fieldErrors"] if e["field"] == "needs.engineer.tasks")


def test_ac_f2_10_engineer_not_needed_without_tasks_saved(client, db):
    assert _post(client, db, _body(needs=_needs(engineer={"needed": False, "tasks": []}))).status_code == 201


def test_ac_f2_08_equipment_owned_creates_no_equipment_stage(client, db):
    user = login_as(client, make_user(db))
    body = _body(needs=_needs(equipment={"needed": False, "items": [], "owned": [{"name": "드럼 세트", "detail": ""}]}))
    perf_id = user.post("/api/v1/performances", json=body).json()["id"]

    res = user.post(f"/api/v1/performances/{perf_id}/publish")

    assert res.status_code == 200, res.text
    assert res.json()["status"] == "PUBLISHED"
    stages = db.scalars(select(Stage).where(Stage.performance_id == perf_id).order_by(Stage.seq)).all()
    assert [(s.stage_type, s.status) for s in stages] == [("VENUE", "OPEN"), ("ENGINEER", "WAITING")]
    assert stages[0].opened_at is not None


def test_publish_twice_is_invalid_state(client, db):
    user = login_as(client, make_user(db))
    perf_id = user.post("/api/v1/performances", json=_body()).json()["id"]
    assert user.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200

    res = user.post(f"/api/v1/performances/{perf_id}/publish")

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


def test_publish_other_users_performance_not_found(client, db):
    perf_id = _post(client, db, _body()).json()["id"]
    other = login_as(client, make_user(db))

    res = other.post(f"/api/v1/performances/{perf_id}/publish")

    assert (res.status_code, res.json()["code"]) == (404, "NOT_FOUND")
    assert db.get(Performance, perf_id).status == "DRAFT"


def test_supplier_cannot_create_performance(client, db):
    res = login_as(client, make_user(db, role="SUPPLIER")).post("/api/v1/performances", json=_body())
    assert res.status_code == 404


def test_create_requires_login(client):
    client.cookies.set(CSRF_COOKIE, TEST_CSRF_TOKEN)  # CSRF 는 통과시키고 로그인만 빼고 본다
    res = client.post("/api/v1/performances", json=_body(), headers={"X-CSRF-Token": TEST_CSRF_TOKEN})
    assert res.status_code == 401
