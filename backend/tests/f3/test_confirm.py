"""최종 견적(견적 내역 확인 카드)·확정 — AC-F3-09·10·11·12·13·14 (T3-03 #43, api-contract.md 4.3)."""
import os
import threading
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.confirm.router import get_now
from app.core.db import SessionLocal
from app.main import app
from app.models.chat import ChatMessage, ConfirmRequest
from app.models.notification import Notification
from app.models.quote import Quote
from app.models.rejection import RejectionEvent
from app.models.request import Stage
from app.request.router import get_today
from tests.f2.test_posting import TODAY
from tests.f2.test_quotes import _as, _body, _supplier_d
from tests.f3.test_chat import _room

API = "/api/v1"
NOW = datetime(2026, 11, 19, 10, 0)
KEY = {"Idempotency-Key": "confirm-1"}


@pytest.fixture(autouse=True)
def _clock():
    state = {"now": NOW}
    app.dependency_overrides[get_now] = lambda: state["now"]
    app.dependency_overrides[get_today] = lambda: TODAY
    yield state
    app.dependency_overrides.pop(get_now, None)
    app.dependency_overrides.pop(get_today, None)


def _quote_id(db, supplier) -> int:
    return db.scalar(select(Quote.id).where(Quote.supplier_id == supplier.id))


def _card(d, quote_id) -> dict:
    res = d.post(f"{API}/quotes/{quote_id}/confirm-requests")
    assert res.status_code == 201, res.text
    return res.json()


def _second_supplier(client, db, user, perf_id):
    """같은 장비 단계에 업체 E 도 견적서를 보내고 사용자가 채팅을 시작한다. (E client, E 업체, 견적서 id)"""
    stage_id = db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == "EQUIPMENT"))
    e = _supplier_d(db)
    ec = _as(db, e.user)
    res = ec.post(f"{API}/stages/{stage_id}/quotes", json=_body())
    assert user.post(f"{API}/chat-rooms/{res.json()['chatRoomId']}/start").status_code == 200
    return ec, e, res.json()["quoteId"]


# ---------- 보내기 ----------


def test_supplier_sends_card_once_per_room_and_user_sees_it(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    card = _card(d, _quote_id(db, supplier))

    assert (card["status"], card["version"], card["roomId"], card["viewedAt"]) == ("PENDING", 1, room_id, None)
    assert datetime.fromisoformat(card["expiresAt"]) == NOW + timedelta(hours=48)
    assert user.get(f"{API}/confirm-requests/{card['id']}").json()["status"] == "PENDING"
    msg = db.scalar(select(ChatMessage).where(ChatMessage.room_id == room_id, ChatMessage.type == "CONFIRM_REQUEST"))
    assert msg.ref_id == card["id"]
    assert db.scalar(select(Notification.type).where(Notification.type == "CONFIRM_REQUESTED")) == "CONFIRM_REQUESTED"

    dup = d.post(f"{API}/quotes/{_quote_id(db, supplier)}/confirm-requests")
    assert dup.status_code == 409 and dup.json()["code"] == "INVALID_STATE"


def test_card_needs_started_chat_and_own_quote(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db, start=False)
    res = d.post(f"{API}/quotes/{_quote_id(db, supplier)}/confirm-requests")
    assert res.status_code == 403 and res.json()["code"] == "CHAT_NOT_STARTED"
    other = _as(db, _supplier_d(db).user)
    assert other.post(f"{API}/quotes/{_quote_id(db, supplier)}/confirm-requests").status_code == 404
    assert user.post(f"{API}/quotes/{_quote_id(db, supplier)}/confirm-requests").status_code == 404  # 사용자는 못 보냄


# ---------- AC-F3-09 견적서를 고치면 이전 카드 확정 불가 ----------


def test_ac_f3_09_edited_quote_invalidates_card(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    quote_id = _quote_id(db, supplier)
    card = _card(d, quote_id)
    user.post(f"{API}/confirm-requests/{card['id']}/view")
    body = {k: v for k, v in _body().items() if k != "label"}
    assert d.put(f"{API}/quotes/{quote_id}", json={**body, "version": 1}).status_code == 200

    got = user.get(f"{API}/confirm-requests/{card['id']}").json()
    assert (got["status"], got["version"], got["currentVersion"]) == ("INVALIDATED", 1, 2)
    res = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY)
    assert res.status_code == 422 and res.json()["code"] == "CONFIRM_REQUEST_STALE"
    assert _card(d, quote_id)["version"] == 2  # 고친 버전으로 새 카드를 보낼 수 있다


# ---------- AC-F3-10 내역서를 열지 않으면 확정 불가 ----------


def test_ac_f3_10_must_view_before_accept(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    card = _card(d, _quote_id(db, supplier))

    res = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY)
    assert res.status_code == 422 and res.json()["code"] == "DETAIL_NOT_VIEWED"
    assert user.post(f"{API}/confirm-requests/{card['id']}/view").json()["viewedAt"] is not None
    res = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY)
    assert res.status_code == 200, res.text
    assert res.json()["stageStatus"] == "CONFIRMED"


def test_accept_needs_idempotency_key_owner_and_is_repeatable(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    card = _card(d, _quote_id(db, supplier))
    user.post(f"{API}/confirm-requests/{card['id']}/view")
    assert user.post(f"{API}/confirm-requests/{card['id']}/accept").status_code == 400  # 키 없음
    assert d.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY).status_code == 404  # 업체는 확정 못 함
    first = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY)
    again = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers={"Idempotency-Key": "confirm-2"})
    assert first.status_code == again.status_code == 200
    assert first.json()["confirmedQuoteVersionId"] == again.json()["confirmedQuoteVersionId"]
    assert db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.type == "CONFIRMED")) == 1


# ---------- AC-F3-11 같은 단계 두 카드 — 하나만 ----------


def test_ac_f3_11_second_card_in_same_stage_is_rejected(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    ec, e, e_quote = _second_supplier(client, db, user, perf_id)
    cd, ce = _card(d, _quote_id(db, supplier)), _card(ec, e_quote)
    for c in (cd, ce):
        user.post(f"{API}/confirm-requests/{c['id']}/view")

    assert user.post(f"{API}/confirm-requests/{cd['id']}/accept", headers=KEY).status_code == 200
    res = user.post(f"{API}/confirm-requests/{ce['id']}/accept", headers={"Idempotency-Key": "k2"})
    assert res.status_code in (409, 422)  # E 카드는 확정 때 이미 INVALIDATED → 422, 아니면 409
    db.expire_all()
    stage = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "EQUIPMENT"))
    assert stage.status == "CONFIRMED"


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="MariaDB에서만 (행 잠금)")
def test_ac_f3_11_concurrent_accepts_only_one_wins(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    ec, e, e_quote = _second_supplier(client, db, user, perf_id)
    cards = [_card(d, _quote_id(db, supplier)), _card(ec, e_quote)]
    for c in cards:
        user.post(f"{API}/confirm-requests/{c['id']}/view")
    cookies, csrf = dict(user.cookies), user.headers.get("X-CSRF-Token")
    results = []

    def click(card_id, key):
        c = TestClient(app)
        c.cookies.update(cookies)
        if csrf:
            c.headers["X-CSRF-Token"] = csrf
        results.append(c.post(f"{API}/confirm-requests/{card_id}/accept", headers={"Idempotency-Key": key}).status_code)

    threads = [threading.Thread(target=click, args=(c["id"], f"k-{i}")) for i, c in enumerate(cards)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results)[0] == 200 and sorted(results)[1] in (409, 422)
    with SessionLocal() as s:
        assert s.scalar(select(func.count()).select_from(Quote).where(Quote.status == "CONFIRMED")) == 1


# ---------- AC-F3-12 48시간 지나면 만료, 다시 보낼 수 있음 ----------


def test_ac_f3_12_card_expires_after_48h_and_can_be_resent(client, db, _clock):
    user, d, room_id, perf_id, supplier = _room(client, db)
    card = _card(d, _quote_id(db, supplier))
    user.post(f"{API}/confirm-requests/{card['id']}/view")

    _clock["now"] = NOW + timedelta(hours=48, seconds=1)
    assert user.get(f"{API}/confirm-requests/{card['id']}").json()["status"] == "EXPIRED"
    res = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY)
    assert res.status_code == 422 and res.json()["code"] == "CONFIRM_REQUEST_EXPIRED"
    assert _card(d, _quote_id(db, supplier))["status"] == "PENDING"
    assert db.scalar(select(func.count()).select_from(Notification).where(Notification.type == "CONFIRM_EXPIRED")) == 1


# ---------- AC-F3-13 다른 업체는 마감·알림, 반려 카운트 없음 ----------


def test_ac_f3_13_other_quotes_closed_notified_and_no_rejection(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    ec, e, e_quote = _second_supplier(client, db, user, perf_id)
    card = _card(d, _quote_id(db, supplier))
    user.post(f"{API}/confirm-requests/{card['id']}/view")
    assert user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY).status_code == 200

    db.expire_all()
    assert db.get(Quote, e_quote).status == "CLOSED"
    assert db.get(Quote, _quote_id(db, supplier)).status == "CONFIRMED"
    types_e = list(db.scalars(select(Notification.type).where(Notification.user_id == e.user_id)))
    assert "NOT_SELECTED" in types_e
    assert "CONFIRMED" in list(db.scalars(select(Notification.type).where(Notification.user_id == supplier.user_id)))
    notice = db.scalar(select(ChatMessage.body).where(ChatMessage.type == "NOTICE"))
    assert notice.startswith("사용자가 다른 업체와 진행하기로 했어요")
    assert db.scalar(select(func.count()).select_from(RejectionEvent)) == 0


# ---------- AC-F3-14 마지막 필요 단계면 [통합 결제하기] ----------


def test_ac_f3_14_last_stage_offers_checkout(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "ENGINEER")):
        s.status = "SKIPPED"
    db.commit()
    card = _card(d, _quote_id(db, supplier))
    user.post(f"{API}/confirm-requests/{card['id']}/view")

    body = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY).json()

    assert body["checkoutAvailable"] is True and body["next"]["stageType"] is None
    assert body["performanceId"] == perf_id


def test_not_last_stage_suggests_next(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    card = _card(d, _quote_id(db, supplier))
    user.post(f"{API}/confirm-requests/{card['id']}/view")
    body = user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY).json()
    assert body["checkoutAvailable"] is False and body["next"]["stageType"] == "ENGINEER"


def test_renegotiate_closes_card_and_others_cannot_see(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db)
    card = _card(d, _quote_id(db, supplier))
    stranger = _as(db, _supplier_d(db).user)
    assert stranger.get(f"{API}/confirm-requests/{card['id']}").status_code == 404
    assert user.post(f"{API}/confirm-requests/{card['id']}/renegotiate").json()["status"] == "RENEGOTIATE"
    assert user.post(f"{API}/confirm-requests/{card['id']}/renegotiate").status_code == 409
    assert db.scalar(select(func.count()).select_from(ConfirmRequest).where(ConfirmRequest.status == "PENDING")) == 0
    assert _card(d, _quote_id(db, supplier))["status"] == "PENDING"  # 다시 보낼 수 있다


def test_first_confirm_sets_payment_deadline_and_notifies_user(client, db):
    """D-57: 처음 컨펌하면 결제 마감이 정해지고 사용자에게 PAYMENT_DEADLINE_SET (마지막 단계면 PAYMENT_READY 도)."""
    user, d, room_id, perf_id, supplier = _room(client, db)
    for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "ENGINEER")):
        s.status = "SKIPPED"
    db.commit()
    card = _card(d, _quote_id(db, supplier))
    user.post(f"{API}/confirm-requests/{card['id']}/view")
    assert user.post(f"{API}/confirm-requests/{card['id']}/accept", headers=KEY).status_code == 200

    owner = user.get(f"{API}/me").json()["id"]
    types = list(db.scalars(select(Notification.type).where(Notification.user_id == owner)))
    assert "PAYMENT_DEADLINE_SET" in types and "PAYMENT_READY" in types
    assert user.get(f"{API}/performances/{perf_id}").json()["paymentDeadline"] is not None
