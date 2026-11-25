"""공고 목록·상세 API (T3-01 #41, api-contract.md GET /postings · GET /postings/{stageId}).

AC-F2-11·12·14, AC-F3-01·03, AC-F4-07, AC-F5-12.
"""
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.quote import Quote
from app.models.request import Stage
from tests.conftest import login_as, make_supplier, make_user
from tests.f2.test_posting import _body as _perf_body
from tests.f2.test_posting import _fixed_today, _set_stages  # noqa: F401 (오늘 날짜 고정 픽스처)
from tests.f2.test_quotes import _body as _quote_body
from tests.f2.test_quotes import _venue_body, venue_snapshot  # noqa: F401 (공간 스냅샷 픽스처)
from app.main import app

PHONE = "010-0000-0000"


def _as(user) -> TestClient:
    return login_as(TestClient(app), user)


def _publish(db, **kw) -> tuple[object, int]:
    """사용자 하나가 요청서를 게시한다. (사용자, 공연 id)"""
    owner = make_user(db)
    c = _as(owner)
    perf_id = c.post("/api/v1/performances", json=_perf_body(**kw)).json()["id"]
    assert c.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200
    return owner, perf_id


def _stage_id(db, perf_id: int, stage_type: str) -> int:
    return db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == stage_type))


def _approved(db, *categories):
    return make_supplier(db, review_status="APPROVED", categories=categories)


def _list(supplier, query: str = "") -> list[dict]:
    res = _as(supplier.user).get(f"/api/v1/postings{query}")
    assert res.status_code == 200, res.text
    return res.json()


def _venue_confirmed(db, perf_id: int) -> int:
    """공연장 C 견적서를 보내고 그 버전으로 공연장 단계를 확정한 뒤 장비 단계를 연다. 장비 단계 id."""
    venue_stage = _stage_id(db, perf_id, "VENUE")
    c = _as(_approved(db, "VENUE").user)
    res = c.post(f"/api/v1/stages/{venue_stage}/quotes", json=_venue_body(techNote="무대 뒤 220V 콘센트 4구"))
    assert res.status_code == 201, res.text
    quote = db.get(Quote, res.json()["quoteId"])
    stage = db.get(Stage, venue_stage)
    stage.status = "CONFIRMED"
    stage.confirmed_quote_version_id = quote.versions[0].id
    db.commit()
    _set_stages(db, perf_id, EQUIPMENT="OPEN")
    return _stage_id(db, perf_id, "EQUIPMENT")


# ---- 목록 노출 조건 ------------------------------------------------------------------------


def test_ac_f2_11_venue_posting_only_for_venue_supplier(db):
    _, perf_id = _publish(db)
    venue = _approved(db, "VENUE")
    equipment = _approved(db, "EQUIPMENT", "INSTALL")
    engineer = _approved(db, "ENGINEER")

    assert [(p["performanceId"], p["stageType"], p["status"]) for p in _list(venue)] == [(perf_id, "VENUE", "OPEN")]
    # 11/25: 내 단계가 아직 대기여도 요청서는 미리 보인다 (status=WAITING, 견적서는 못 보냄)
    assert [(p["stageType"], p["status"]) for p in _list(equipment)] == [("EQUIPMENT", "WAITING")]
    assert [(p["stageType"], p["status"]) for p in _list(engineer)] == [("ENGINEER", "WAITING")]


def test_ac_f2_12_pending_supplier_sees_empty_list(db):
    _, perf_id = _publish(db)
    pending = make_supplier(db, review_status="PENDING", categories=("VENUE",))

    assert _list(pending) == []
    assert _as(pending.user).get(f"/api/v1/postings/{_stage_id(db, perf_id, 'VENUE')}").status_code == 404


def test_ac_f3_01_equipment_waiting_before_venue_confirmed(db, venue_snapshot):
    """앞 단계 확정 전에는 대기(읽기만, 견적서 409), 확정 뒤 열림."""
    _, perf_id = _publish(db)
    equipment = _approved(db, "EQUIPMENT", "INSTALL")
    eq_stage = _stage_id(db, perf_id, "EQUIPMENT")
    assert [(p["stageId"], p["status"]) for p in _list(equipment)] == [(eq_stage, "WAITING")]
    c = _as(equipment.user)
    assert c.get(f"/api/v1/postings/{eq_stage}").json()["status"] == "WAITING"
    res = c.post(f"/api/v1/stages/{eq_stage}/quotes", json=_quote_body())
    assert (res.status_code, res.json()["code"]) == (409, "STAGE_NOT_OPEN")

    assert _venue_confirmed(db, perf_id) == eq_stage
    assert [(p["stageId"], p["status"]) for p in _list(equipment)] == [(eq_stage, "OPEN")]


def test_postings_sido_filter_and_show_date_order(db):
    _, late = _publish(db, showDate="2026-12-10")
    _, soon = _publish(db, showDate="2026-11-28")
    _, seoul = _publish(db, showDate="2026-12-01", sido="서울특별시", sigungu="마포구")
    venue = _approved(db, "VENUE")

    assert [p["performanceId"] for p in _list(venue)] == [soon, seoul, late]
    assert [p["performanceId"] for p in _list(venue, "?sido=광주광역시")] == [soon, late]


def test_posting_detail_not_visible_is_404(db):
    _, perf_id = _publish(db)
    equipment = _approved(db, "EQUIPMENT", "INSTALL")
    c = _as(equipment.user)

    assert c.get(f"/api/v1/postings/{_stage_id(db, perf_id, 'VENUE')}").status_code == 404  # 다른 부문
    assert c.get(f"/api/v1/postings/{_stage_id(db, perf_id, 'EQUIPMENT')}").status_code == 200  # 대기 단계는 읽기만 (11/25)
    assert c.get("/api/v1/postings/999999").status_code == 404  # 없는 단계


def test_postings_user_role_rejected(db):
    """업체만 쓰는 API (권한 S). 사용자 역할은 require_role 에서 막힌다."""
    _, perf_id = _publish(db)
    c = _as(make_user(db))
    assert c.get("/api/v1/postings").status_code == 404
    assert c.get(f"/api/v1/postings/{_stage_id(db, perf_id, 'VENUE')}").status_code == 404


# ---- 상세 ---------------------------------------------------------------------------------


def test_ac_f3_03_detail_shows_confirmed_venue_info(db, venue_snapshot):
    _, perf_id = _publish(db)
    eq_stage = _venue_confirmed(db, perf_id)
    equipment = _approved(db, "EQUIPMENT", "INSTALL")

    res = _as(equipment.user).get(f"/api/v1/postings/{eq_stage}")

    assert res.status_code == 200, res.text
    data = res.json()
    assert (data["stageId"], data["stageType"], data["audience"]) == (eq_stage, "EQUIPMENT", 80)
    [prev] = data["previousStages"]
    assert prev["stageType"] == "VENUE"
    assert prev["checkinTime"] == "14:00"  # 입실 시각
    assert prev["venueSnapshot"]["name"] == "공간 C"
    assert [i["name"] for i in prev["items"]] == ["보컬 마이크"]  # 기본 장비
    assert prev["techNote"] == "무대 뒤 220V 콘센트 4구"  # 전원 (전용 칸 없음)


def test_ac_f2_14_no_other_supplier_quote_in_list_or_detail(db, venue_snapshot):
    _, perf_id = _publish(db)
    eq_stage = _venue_confirmed(db, perf_id)
    other = _approved(db, "EQUIPMENT", "INSTALL")
    assert _as(other.user).post(f"/api/v1/stages/{eq_stage}/quotes", json=_quote_body(label="경쟁사안")).status_code == 201
    me = _approved(db, "EQUIPMENT", "INSTALL")
    c = _as(me.user)

    texts = [c.get("/api/v1/postings").text, c.get(f"/api/v1/postings/{eq_stage}").text]

    for text in texts:
        assert "경쟁사안" not in text
        assert other.company_name not in text
        assert "1250000" not in text  # 다른 업체 견적서 합계
        assert "quoteId" not in text and "quoteCount" not in text


# ---- 사용자 정보 --------------------------------------------------------------------------


def test_ac_f4_07_list_has_nickname_and_counts(db):
    owner, _ = _publish(db)
    [row] = _list(_approved(db, "VENUE"))

    assert row["nickname"] == owner.nickname
    assert row["rejectionCount"] == 0
    assert row["usageCount"] == 0


def test_ac_f5_12_no_contact_or_real_name(db):
    owner, perf_id = _publish(db, contactPhone=PHONE)
    venue = _approved(db, "VENUE")
    c = _as(venue.user)

    res_list = c.get("/api/v1/postings")
    res_detail = c.get(f"/api/v1/postings/{_stage_id(db, perf_id, 'VENUE')}")

    for res, row in ((res_list, res_list.json()[0]), (res_detail, res_detail.json())):
        assert PHONE not in res.text and "01000000000" not in res.text
        assert owner.name not in res.text
        assert owner.email not in res.text
        assert not {"contactPhone", "phone", "email", "name", "birthDate"} & row.keys()
