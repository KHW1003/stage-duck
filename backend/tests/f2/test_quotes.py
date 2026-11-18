"""견적서 API — 보내기·고치기·보기 (T3-01 #41, AC-F2-14~20, api-contract.md 3.3)."""
from datetime import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.models.quote import Quote, QuoteVersion
from app.models.request import Stage
from app.quote import service as quote_service
from app.request.router import get_today
from app.supplier import service as supplier_service
from app.supplier.service import VenueSnapshot
from tests.conftest import login_as, make_supplier, make_user
from tests.f2.test_posting import TODAY, _published, _set_stages

# api-contract.md 3.3 예시 값 (AC-F2-15: 125만 원, 설치 90분)
AMOUNTS = {"items": 600000, "transport": 150000, "install": 200000, "labor": 300000, "etc": 0}
TOTAL = 1250000


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def _body(**kw) -> dict:
    body = {
        "label": "기본형",
        "venueId": None,
        "items": [{"name": "보컬 마이크", "category": "SOUND", "qty": 2, "unitPrice": 30000, "amount": 60000}],
        "staff": [{"role": "ENGINEER", "count": 1, "start": "15:00", "end": "22:00"}],
        "setupStart": "15:00", "setupMinutes": 90, "teardownMinutes": 60,
        "includes": {"equipment": True, "engineer": True, "install": True, "transport": True},
        "amounts": dict(AMOUNTS),
        "totalAmount": TOTAL,
        "extraCostNote": "주차비 별도", "validUntil": "2026-11-19", "techNote": "전원 위치 확인 필요",
    }
    body.update(kw)
    return body


def _venue_body(**kw) -> dict:
    return _body(venueId=7, checkinTime="14:00", setupAvailableTime="15:00", **kw)


def _as(db, user) -> TestClient:
    """사용자마다 따로 쿠키를 갖도록 클라이언트를 새로 만든다."""
    return login_as(TestClient(app), user)


def _stage_id(db, perf_id: int, stage_type: str) -> int:
    return db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == stage_type))


def _equipment_open(client, db):
    """공연장이 확정되고 장비 단계가 열린 공고. (사용자 client, 공연 id, 장비 단계 id)"""
    user, perf_id = _published(client, db)
    _set_stages(db, perf_id, VENUE="CONFIRMED")
    _set_stages(db, perf_id, EQUIPMENT="OPEN")
    return user, perf_id, _stage_id(db, perf_id, "EQUIPMENT")


def _supplier_d(db, **kw):
    return make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "INSTALL"), **kw)


@pytest.fixture
def venue_snapshot(monkeypatch):
    """get_venue_snapshot 은 1번 #27 구현 전이라 바꿔 끼운다."""
    snap = VenueSnapshot(
        venue_id=7, name="공간 C", sido="광주광역시", sigungu="동구", venue_type="CULTURE_SPACE",
        max_capacity=120, checkin_time=time(14, 0), checkout_time=time(23, 0), has_resident_engineer=False,
        conditions={"BAND_ALLOWED": True, "HAS_PARKING": None},
    )
    monkeypatch.setattr(supplier_service, "get_venue_snapshot", lambda db, venue_id: snap)
    return snap


# ---- AC-F2-15 견적서 보내기 ----------------------------------------------------------------


def test_ac_f2_15_equipment_quote_sent(client, db):
    _, perf_id, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)

    res = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 201, res.text
    data = res.json()
    assert data["version"] == 1
    assert data["chatRoomId"] is None
    assert data["checks"] == []
    quote = db.get(Quote, data["quoteId"])
    assert (quote.stage_id, quote.status, quote.current_version, quote.label) == (stage_id, "SENT", 1, "기본형")
    v1 = quote.versions[0]
    assert (v1.total_amount, v1.discount_amount, v1.setup_minutes) == (TOTAL, 0, 90)
    assert v1.based_on_perf_version == 1
    assert v1.includes_engineer is True and v1.venue_id is None


def test_ac_f2_15_stage_not_open_rejected(client, db):
    """공연장 단계가 열린 동안 장비 업체는 견적서를 보낼 수 없다 (constitution 3)."""
    _, perf_id = _published(client, db)
    d = _as(db, _supplier_d(db).user)

    res = d.post(f"/api/v1/stages/{_stage_id(db, perf_id, 'EQUIPMENT')}/quotes", json=_body())

    assert res.status_code == 409
    assert res.json()["code"] == "STAGE_NOT_OPEN"


def test_ac_f2_15_other_category_rejected(client, db):
    _, _, stage_id = _equipment_open(client, db)
    engineer = _as(db, make_supplier(db, review_status="APPROVED", categories=("ENGINEER",)).user)

    res = engineer.post(f"/api/v1/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 409
    assert res.json()["code"] == "STAGE_NOT_OPEN"


def test_ac_f2_15_not_approved_supplier_403(client, db):
    _, _, stage_id = _equipment_open(client, db)
    pending = _as(db, make_supplier(db, review_status="PENDING", categories=("EQUIPMENT",)).user)

    res = pending.post(f"/api/v1/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 403
    assert res.json()["code"] == "SUPPLIER_NOT_APPROVED"


def test_ac_f2_15_suspended_supplier_403(client, db):
    """업체 정지(suppliers.review_status). 계정 정지(users.status)는 로그인 단계에서 401 (#24)."""
    _, _, stage_id = _equipment_open(client, db)
    supplier = make_supplier(db, review_status="SUSPENDED", categories=("EQUIPMENT",))

    res = _as(db, supplier.user).post(f"/api/v1/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 403
    assert res.json()["code"] == "ACCOUNT_SUSPENDED"


def test_ac_f2_15_user_role_cannot_send(client, db):
    user, _, stage_id = _equipment_open(client, db)

    res = user.post(f"/api/v1/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 404


# ---- AC-F2-16 여러 견적서 -------------------------------------------------------------------


def test_ac_f2_16_basic_and_premium_are_separate(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)

    basic = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body(label="기본형")).json()
    premium_amounts = dict(AMOUNTS, items=900000)
    premium = d.post(
        f"/api/v1/stages/{stage_id}/quotes",
        json=_body(label="고급형", amounts=premium_amounts, totalAmount=1550000),
    ).json()

    assert basic["quoteId"] != premium["quoteId"]
    rows = db.scalars(select(Quote).where(Quote.stage_id == stage_id).order_by(Quote.id)).all()
    assert [(q.label, q.versions[0].total_amount) for q in rows] == [("기본형", TOTAL), ("고급형", 1550000)]


# ---- AC-F2-17 합계 검사 (api-contract.md 3.3 순서) ------------------------------------------


@pytest.mark.parametrize(
    ("amounts", "discount", "total", "code", "field"),
    [
        # 항목 합 > INT UNSIGNED 최댓값
        (dict(AMOUNTS, items=4_294_967_295), 0, 4_294_967_295, "TOTAL_TOO_LARGE", "totalAmount"),
        # 할인 = 항목 합 + 1 (합계도 틀렸지만 할인 검사가 먼저)
        (AMOUNTS, TOTAL + 1, 0, "VALIDATION_FAILED", "discountAmount"),
        # 합계 ±1
        (AMOUNTS, 0, TOTAL + 1, "TOTAL_MISMATCH", "totalAmount"),
        (AMOUNTS, 0, TOTAL - 1, "TOTAL_MISMATCH", "totalAmount"),
        (AMOUNTS, 50000, TOTAL, "TOTAL_MISMATCH", "totalAmount"),
        # 최소 금액 경계: 9,999원
        ({"items": 9999, "transport": 0, "install": 0, "labor": 0, "etc": 0}, 0, 9999, "VALIDATION_FAILED", "totalAmount"),
        # 할인 = 항목 합 → 합계 0원
        (AMOUNTS, TOTAL, 0, "VALIDATION_FAILED", "totalAmount"),
    ],
    ids=["too_large", "discount_over", "total_plus1", "total_minus1", "discount_ignored", "min_9999", "discount_all"],
)
def test_ac_f2_17_total_rejected(client, db, amounts, discount, total, code, field):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)

    res = d.post(
        f"/api/v1/stages/{stage_id}/quotes",
        json=_body(amounts=amounts, discountAmount=discount, totalAmount=total),
    )

    assert res.status_code == 400
    assert res.json()["code"] == code
    assert [e["field"] for e in res.json()["fieldErrors"]] == [field]
    assert db.scalar(select(Quote.id).where(Quote.stage_id == stage_id)) is None


@pytest.mark.parametrize(
    ("amounts", "discount", "total"),
    [
        ({"items": 10000, "transport": 0, "install": 0, "labor": 0, "etc": 0}, 0, 10000),  # 최소 금액 경계
        (AMOUNTS, 50000, TOTAL - 50000),  # 업체할인
        (AMOUNTS, TOTAL - 10000, 10000),  # 할인 뒤 최소 금액
    ],
    ids=["min_10000", "discount", "discount_to_min"],
)
def test_ac_f2_17_total_accepted(client, db, amounts, discount, total):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)

    res = d.post(
        f"/api/v1/stages/{stage_id}/quotes",
        json=_body(amounts=amounts, discountAmount=discount, totalAmount=total),
    )

    assert res.status_code == 201, res.text
    v1 = db.get(Quote, res.json()["quoteId"]).versions[0]
    assert (v1.discount_amount, v1.total_amount) == (discount, total)


# ---- AC-F2-18 공간 견적서는 공연장 단계에만 -------------------------------------------------


def test_ac_f2_18_venue_quote_on_equipment_stage_rejected(client, db, venue_snapshot):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE", "EQUIPMENT")).user)

    res = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_venue_body())

    assert res.status_code == 409
    assert res.json()["code"] == "STAGE_NOT_OPEN"
    assert db.scalar(select(Quote.id).where(Quote.stage_id == stage_id)) is None


@pytest.mark.parametrize("missing", ["venueId", "checkinTime", "setupAvailableTime"])
def test_ac_f2_18_venue_stage_requires_venue_fields(client, db, venue_snapshot, missing):
    _, perf_id = _published(client, db)
    a = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)
    body = _venue_body()
    body[missing] = None

    res = a.post(f"/api/v1/stages/{_stage_id(db, perf_id, 'VENUE')}/quotes", json=body)

    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION_FAILED"
    assert [e["field"] for e in res.json()["fieldErrors"]] == [missing]


def test_ac_f2_18_venue_quote_saves_snapshot(client, db, venue_snapshot):
    _, perf_id = _published(client, db)
    a = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)

    res = a.post(f"/api/v1/stages/{_stage_id(db, perf_id, 'VENUE')}/quotes", json=_venue_body())

    assert res.status_code == 201, res.text
    v1 = db.get(Quote, res.json()["quoteId"]).versions[0]
    assert (v1.venue_id, v1.checkin_time, v1.setup_available_time) == (7, time(14, 0), time(15, 0))
    assert v1.venue_snapshot["name"] == "공간 C"
    assert v1.venue_snapshot["checkinTime"] == "14:00"
    assert v1.venue_snapshot["conditions"] == {"BAND_ALLOWED": True, "HAS_PARKING": None}


# ---- AC-F2-19 풀스펙 ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("equipment", "engineer", "full_spec"),
    [(True, True, True), (True, False, False), (False, True, False), (False, False, False)],
)
def test_ac_f2_19_full_spec_when_equipment_and_engineer(client, db, venue_snapshot, equipment, engineer, full_spec):
    _, perf_id = _published(client, db)
    a = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)
    includes = {"equipment": equipment, "engineer": engineer, "install": False, "transport": False}

    res = a.post(f"/api/v1/stages/{_stage_id(db, perf_id, 'VENUE')}/quotes", json=_venue_body(includes=includes))

    assert res.status_code == 201, res.text
    quote_id = res.json()["quoteId"]
    assert db.get(Quote, quote_id).is_full_spec is full_spec
    assert a.get(f"/api/v1/quotes/{quote_id}").json()["isFullSpec"] is full_spec


# ---- AC-F2-20 수정 → 새 버전 -----------------------------------------------------------------


def _amounts_1350000() -> dict:
    return dict(AMOUNTS, items=700000)


def test_ac_f2_20_update_creates_v2_and_keeps_v1(client, db):
    user, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]

    body = _body(amounts=_amounts_1350000(), totalAmount=1350000, version=1)
    body.pop("label")
    res = d.put(f"/api/v1/quotes/{quote_id}", json=body)

    assert res.status_code == 200, res.text
    assert (res.json()["quoteId"], res.json()["version"]) == (quote_id, 2)
    db.expire_all()
    versions = db.scalars(select(QuoteVersion).where(QuoteVersion.quote_id == quote_id).order_by(QuoteVersion.version)).all()
    assert [(v.version, v.total_amount) for v in versions] == [(1, 1250000), (2, 1350000)]
    assert db.get(Quote, quote_id).current_version == 2

    for viewer in (d, user):  # 보낸 업체, 그 공연의 사용자
        data = viewer.get(f"/api/v1/quotes/{quote_id}").json()
        assert data["currentVersion"] == 2
        assert data["current"]["totalAmount"] == 1350000
        assert [(v["version"], v["totalAmount"]) for v in data["versions"]] == [(1, 1250000), (2, 1350000)]
        assert data["label"] == "기본형"


def test_ac_f2_20_stale_version_conflict(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]
    assert d.put(f"/api/v1/quotes/{quote_id}", json=_body(amounts=_amounts_1350000(), totalAmount=1350000, version=1)).status_code == 200

    res = d.put(f"/api/v1/quotes/{quote_id}", json=_body(version=1))

    assert res.status_code == 409
    assert res.json()["code"] == "VERSION_CONFLICT"
    assert db.get(Quote, quote_id).current_version == 2


def test_ac_f2_20_label_not_changed_by_update(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]

    d.put(f"/api/v1/quotes/{quote_id}", json=_body(label="고급형", version=1))

    db.expire_all()
    assert db.get(Quote, quote_id).label == "기본형"


def test_ac_f2_20_update_total_checked(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]

    res = d.put(f"/api/v1/quotes/{quote_id}", json=_body(amounts=_amounts_1350000(), totalAmount=1250000, version=1))

    assert res.status_code == 400
    assert res.json()["code"] == "TOTAL_MISMATCH"
    assert db.get(Quote, quote_id).current_version == 1


def test_ac_f2_20_other_supplier_cannot_update(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]
    other = _as(db, _supplier_d(db).user)

    res = other.put(f"/api/v1/quotes/{quote_id}", json=_body(version=1))

    assert res.status_code == 404
    assert db.get(Quote, quote_id).current_version == 1


# ---- AC-F2-14 다른 업체 견적서는 안 보인다 ----------------------------------------------------


def test_ac_f2_14_other_supplier_gets_404(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]
    other = _as(db, _supplier_d(db).user)

    assert d.get(f"/api/v1/quotes/{quote_id}").status_code == 200
    res = other.get(f"/api/v1/quotes/{quote_id}")
    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"


def test_ac_f2_14_other_user_gets_404(client, db):
    _, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]
    stranger = _as(db, make_user(db))

    assert stranger.get(f"/api/v1/quotes/{quote_id}").status_code == 404
    assert stranger.get("/api/v1/quotes/999999").status_code == 404


def test_ac_f2_14_response_has_no_contact_fields(client, db):
    """CLAUDE.md 20: 결제 전 응답에 연락처·실명을 넣지 않는다."""
    user, _, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    quote_id = d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]

    text = user.get(f"/api/v1/quotes/{quote_id}").text
    for key in ('"phone"', '"email"', '"name":"대표"', '"birthDate"', "mainPhone"):
        assert key not in text


# ---- quote_counts (2번 #40 내 공연 현황) -----------------------------------------------------


def test_quote_counts_groups_by_stage_and_skips_withdrawn(client, db):
    _, perf_id, stage_id = _equipment_open(client, db)
    d = _as(db, _supplier_d(db).user)
    ids = [d.post(f"/api/v1/stages/{stage_id}/quotes", json=_body(label=f"안{i}")).json()["quoteId"] for i in range(3)]
    db.get(Quote, ids[0]).status = "WITHDRAWN"
    db.commit()
    venue_stage = _stage_id(db, perf_id, "VENUE")

    assert quote_service.quote_counts(db, [stage_id, venue_stage]) == {stage_id: 2, venue_stage: 0}


def test_quote_counts_empty_input(db):
    assert quote_service.quote_counts(db, []) == {}
