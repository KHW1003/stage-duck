"""견적 요청(직접 오퍼)·관심 업체 — AC-F3-16·17·18·19 (FR-OFFER-01~03, 이슈 #32, api-contract.md 4.4)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.main import app
from app.models.offer import Offer
from app.models.quote import Quote
from app.offer.router import get_now
from app.request import service as request_service
from app.request.router import get_today
from tests.conftest import make_supplier, make_user
from tests.f2.test_posting import TODAY, _published, _set_stages
from tests.f2.test_quotes import _as, _body, _equipment_open, _stage_id, _supplier_d

API = "/api/v1"
NOW = datetime(2026, 11, 19, 10, 0)


@pytest.fixture(autouse=True)
def _fixed_time():
    app.dependency_overrides[get_today] = lambda: TODAY
    app.dependency_overrides[get_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_today, None)
    app.dependency_overrides.pop(get_now, None)


def _venue_open(client, db):
    """공연장 단계가 열린 공고. (사용자 client, 공연 id, 공연장 단계 id, 장비 단계 id)"""
    user, perf_id = _published(client, db)
    return user, perf_id, _stage_id(db, perf_id, "VENUE"), _stage_id(db, perf_id, "EQUIPMENT")


# ---------- AC-F3-16 열리지 않은 단계 업체에겐 요청 불가, 관심 저장만 ----------


def test_ac_f3_16_closed_stage_offer_is_rejected_but_favorite_saves(client, db):
    user, perf_id, venue_stage, equipment_stage = _venue_open(client, db)
    equipment = _supplier_d(db)

    res = user.post(f"{API}/stages/{equipment_stage}/offers", json={"supplierId": equipment.id})
    assert res.status_code == 409 and res.json()["code"] == "STAGE_NOT_OPEN"
    assert db.scalar(select(Offer.id)) is None

    assert user.post(f"{API}/favorites", json={"supplierId": equipment.id}).status_code == 204
    assert user.post(f"{API}/favorites", json={"supplierId": equipment.id}).status_code == 204  # 두 번 눌러도 하나
    favs = user.get(f"{API}/favorites").json()
    assert [(f["supplierId"], f["stageTypes"]) for f in favs] == [(equipment.id, ["EQUIPMENT"])]
    assert user.delete(f"{API}/favorites/{equipment.id}").status_code == 204
    assert user.get(f"{API}/favorites").json() == []


def test_ac_f3_16_open_stage_offer_to_matching_supplier(client, db):
    user, _, venue_stage, _ = _venue_open(client, db)
    venue_supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE",))

    res = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": venue_supplier.id, "message": "리허설 17시 가능할까요?"})

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "PENDING" and body["companyName"] == venue_supplier.company_name
    assert datetime.fromisoformat(body["expiresAt"]) == NOW + timedelta(hours=48)
    listed = user.get(f"{API}/stages/{venue_stage}/offers").json()
    assert listed["activeCount"] == 1 and listed["limit"] == 10


def test_offer_validation_category_pending_contact_duplicate(client, db):
    user, _, venue_stage, _ = _venue_open(client, db)
    wrong = _supplier_d(db)  # 장비 업체 → 공연장 단계
    pending = make_supplier(db, review_status="PENDING", categories=("VENUE",))
    ok = make_supplier(db, review_status="APPROVED", categories=("VENUE",))

    for sid in (wrong.id, pending.id, 999999):
        res = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": sid})
        assert res.status_code == 400 and res.json()["fieldErrors"][0]["field"] == "supplierId", res.text
    res = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": ok.id, "message": "010-1234-5678 로 연락 주세요"})
    assert res.status_code == 400 and res.json()["fieldErrors"][0]["field"] == "message"
    assert user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": ok.id}).status_code == 201
    dup = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": ok.id})
    assert dup.status_code == 409 and dup.json()["code"] == "INVALID_STATE"


def test_offer_other_users_stage_is_404_and_supplier_cannot_send(client, db):
    _, _, venue_stage, _ = _venue_open(client, db)
    target = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    other = _as(db, make_user(db))
    assert other.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": target.id}).status_code == 404
    assert other.get(f"{API}/stages/{venue_stage}/offers").status_code == 404
    supplier = _as(db, target.user)
    # 다른 역할은 존재 여부를 숨기려고 404 (require_role, CLAUDE.md 10)
    assert supplier.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": target.id}).status_code == 404


# ---------- AC-F3-17 11번째 요청 거부 ----------


def test_ac_f3_17_eleventh_offer_is_rejected(client, db):
    user, _, venue_stage, _ = _venue_open(client, db)
    suppliers = [make_supplier(db, review_status="APPROVED", categories=("VENUE",)) for _ in range(11)]
    for s in suppliers[:10]:
        assert user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": s.id}).status_code == 201

    res = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": suppliers[10].id})

    assert res.status_code == 409 and res.json()["code"] == "OFFER_LIMIT"
    assert len(db.scalars(select(Offer)).all()) == 10


def test_declined_and_expired_offers_free_a_slot(client, db):
    user, _, venue_stage, _ = _venue_open(client, db)
    suppliers = [make_supplier(db, review_status="APPROVED", categories=("VENUE",)) for _ in range(12)]
    ids = [user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": s.id}).json()["offerId"] for s in suppliers[:10]]

    # 업체 하나가 거절 → 한 자리 빔
    first = _as(db, suppliers[0].user)
    assert first.post(f"{API}/offers/{ids[0]}/decline", json={"reason": "SCHEDULE"}).status_code == 204
    assert first.post(f"{API}/offers/{ids[0]}/decline", json={"reason": "SCHEDULE"}).status_code == 409  # 이미 답함
    assert user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": suppliers[10].id}).status_code == 201

    # 48시간이 지나면 답 없는 요청은 끝남 → 자리 빔
    app.dependency_overrides[get_now] = lambda: NOW + timedelta(hours=48, minutes=1)
    listed = user.get(f"{API}/stages/{venue_stage}/offers").json()
    assert listed["activeCount"] == 0
    assert {i["status"] for i in listed["items"]} == {"DECLINED", "EXPIRED"}
    assert user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": suppliers[11].id}).status_code == 201


def test_supplier_sees_received_offers_without_contacts_and_others_404(client, db):
    user, perf_id, venue_stage, _ = _venue_open(client, db)
    target = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    offer_id = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": target.id, "message": "가능할까요?"}).json()["offerId"]

    got = _as(db, target.user).get(f"{API}/supplier/offers").json()
    assert [(o["offerId"], o["performanceId"], o["stageType"], o["stageOpen"], o["message"]) for o in got] == [
        (offer_id, perf_id, "VENUE", True, "가능할까요?")
    ]
    assert not {"email", "phone", "name"} & set(got[0])  # 연락처·실명 없음 (CLAUDE.md 20)
    stranger = _as(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)
    assert stranger.get(f"{API}/supplier/offers").json() == []
    assert stranger.post(f"{API}/offers/{offer_id}/decline", json={"reason": "ETC"}).status_code == 404
    pending = _as(db, make_supplier(db, review_status="PENDING", categories=("VENUE",)).user)
    assert pending.get(f"{API}/supplier/offers").status_code == 403


# ---------- AC-F3-18 요청 받은 업체의 견적서에 "내가 요청한 업체" ----------


def test_ac_f3_18_quote_from_offered_supplier_is_marked(client, db):
    user, perf_id, stage_id = _equipment_open(client, db)
    offered, plain = _supplier_d(db), _supplier_d(db)
    offer_id = user.post(f"{API}/stages/{stage_id}/offers", json={"supplierId": offered.id}).json()["offerId"]

    q1 = _as(db, offered.user).post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]
    q2 = _as(db, plain.user).post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]

    assert db.get(Quote, q1).offer_id == offer_id and db.get(Quote, q2).offer_id is None
    db.expire_all()
    assert db.get(Offer, offer_id).status == "QUOTED"
    compare = user.get(f"{API}/stages/{stage_id}/quotes").json()
    marks = {q["quoteId"]: q["offered"] for q in compare}
    assert marks == {q1: True, q2: False}


# ---------- AC-F3-19 관심 업체 → 단계가 열리면 안내 (화면이 열린 단계와 부문을 맞춘다) ----------


def test_ac_f3_19_favorite_matches_newly_opened_stage(client, db):
    user, perf_id, venue_stage, equipment_stage = _venue_open(client, db)
    equipment = _supplier_d(db)
    user.post(f"{API}/favorites", json={"supplierId": equipment.id})
    assert user.post(f"{API}/stages/{equipment_stage}/offers", json={"supplierId": equipment.id}).status_code == 409

    _set_stages(db, perf_id, VENUE="CONFIRMED", EQUIPMENT="OPEN")  # 장비 단계가 열림
    opened = request_service.get_open_stage(db, perf_id)
    favs = user.get(f"{API}/favorites").json()

    assert opened.stage_type == "EQUIPMENT" and opened.stage_type in favs[0]["stageTypes"]
    assert user.post(f"{API}/stages/{equipment_stage}/offers", json={"supplierId": equipment.id}).status_code == 201


def test_offer_makes_user_profile_related(client, db):
    user, _, venue_stage, _ = _venue_open(client, db)
    target = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    assert not request_service.is_related(db, user.get(f"{API}/me").json()["id"], target.id)
    user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": target.id})
    assert request_service.is_related(db, user.get(f"{API}/me").json()["id"], target.id)
