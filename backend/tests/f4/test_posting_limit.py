"""반려 카운트·게시 제한 (T2-05 #39, FR-POL-02 · AC-F4-05·06·07, api-contract.md GET /me/posting-limit).

반려 = 견적서를 받은 공고를 내림. 그 공연에서 채팅을 시작한 업체가 있으면 채팅 반려(AFTER_CHAT), 없으면 미응답 반려(NO_CHAT).
채팅 반려 5회 / 미응답 반려 10회부터 새 공고는 마지막 반려 + 24시간 뒤에만 게시된다. 마지막 반려 후 180일이 지나면 0.
"""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.main import app
from app.models.chat import ChatRoom
from app.models.quote import Quote, QuoteVersion
from app.models.rejection import RejectionEvent
from app.models.request import Performance, Stage
from app.request import calc, rejection
from app.request.router import get_now, get_today
from tests.conftest import login_as, make_supplier, make_user

NOW = datetime(2026, 11, 12, 10, 0)
BODY = {
    "title": "가을밤 밴드 공연", "form": "BAND", "showDate": "2026-11-28",
    "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
    "audience": 80, "sido": "광주광역시", "sigungu": "동구",
    "needs": {"venue": {"needed": True}, "equipment": {"needed": True}, "engineer": {"needed": True, "tasks": ["FOH"]}},
}


@pytest.fixture
def clock():
    state = {"now": NOW}
    app.dependency_overrides[get_today] = lambda: date(2026, 11, 12)
    app.dependency_overrides[get_now] = lambda: state["now"]
    yield state
    app.dependency_overrides.pop(get_today, None)
    app.dependency_overrides.pop(get_now, None)


def _published(client, user) -> int:
    perf_id = login_as(client, user).post("/api/v1/performances", json=BODY).json()["id"]
    res = client.post(f"/api/v1/performances/{perf_id}/publish")
    assert res.status_code == 200, res.text
    return perf_id


def _quote(db, perf_id, *, chat: bool) -> None:
    """공연장 단계에 견적서 1장. chat=True 면 그 업체와 채팅을 시작한 상태."""
    db.rollback()
    stage = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))
    supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    quote = Quote(stage_id=stage.id, supplier_id=supplier.id, label="기본형", current_version=1, status="SENT")
    db.add(quote)
    db.flush()
    db.add(QuoteVersion(
        quote_id=quote.id, version=1, based_on_perf_version=1, staff=[], items=[],
        amount_items=500000, amount_transport=0, amount_install=0, amount_labor=0, amount_etc=0, total_amount=500000,
    ))
    if chat:
        perf = db.get(Performance, perf_id)
        db.add(ChatRoom(stage_id=stage.id, supplier_id=supplier.id, user_id=perf.user_id, started_at=NOW))
    db.commit()


def _reject(client, db, user, *, chat: bool) -> int:
    perf_id = _published(client, user)
    _quote(db, perf_id, chat=chat)
    res = login_as(client, user).post(f"/api/v1/performances/{perf_id}/withdraw")
    assert res.status_code == 200, res.text
    return perf_id


def _events(db, user_id) -> list[str]:
    db.rollback()
    return [e.kind for e in db.scalars(select(RejectionEvent).where(RejectionEvent.user_id == user_id).order_by(RejectionEvent.id))]


# ---- 반려 기록 ----------------------------------------------------------------------------


def test_withdraw_with_quotes_records_kind_by_chat(client, db, clock):
    user = make_user(db)
    _reject(client, db, user, chat=True)
    _reject(client, db, user, chat=False)

    assert _events(db, user.id) == ["AFTER_CHAT", "NO_CHAT"]


def test_withdraw_without_quotes_is_not_rejection(client, db, clock):
    user = make_user(db)
    perf_id = _published(client, user)
    assert client.post(f"/api/v1/performances/{perf_id}/withdraw").status_code == 200

    assert _events(db, user.id) == []


# ---- AC-F4-05 ------------------------------------------------------------------------------


def test_ac_f4_05_five_chat_rejections_wait_24h_after_last(client, db, clock):
    user = make_user(db)
    for i in range(5):
        clock["now"] = NOW + timedelta(hours=i)
        _reject(client, db, user, chat=True)
    last = NOW + timedelta(hours=4)

    clock["now"] = last + timedelta(hours=23, minutes=59)
    perf_id = login_as(client, user).post("/api/v1/performances", json=BODY).json()["id"]
    blocked = client.post(f"/api/v1/performances/{perf_id}/publish")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "POSTING_RATE_LIMITED"
    assert "11월 13일 14:00" in blocked.json()["message"]

    clock["now"] = last + timedelta(hours=24)
    assert client.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200


def test_four_chat_rejections_are_not_limited(client, db, clock):
    user = make_user(db)
    for _ in range(4):
        _reject(client, db, user, chat=True)
    assert _published(client, user) > 0


def test_no_chat_rejections_limit_from_ten(client, db, clock):
    user = make_user(db)
    for _ in range(9):
        _reject(client, db, user, chat=False)
    limit = login_as(client, user).get("/api/v1/me/posting-limit").json()
    assert limit["limited"] is False and limit["noChat"] == 9

    _reject(client, db, user, chat=False)
    limit = client.get("/api/v1/me/posting-limit").json()
    assert limit["limited"] is True and limit["noChat"] == 10
    assert limit["availableAt"].startswith("2026-11-13T10:00")


# ---- AC-F4-06 ------------------------------------------------------------------------------


def test_ac_f4_06_count_is_zero_180_days_after_last(client, db, clock):
    user = make_user(db)
    for _ in range(5):
        _reject(client, db, user, chat=True)

    clock["now"] = NOW + timedelta(days=180)
    limit = login_as(client, user).get("/api/v1/me/posting-limit").json()
    assert (limit["afterChat"], limit["noChat"], limit["limited"]) == (0, 0, False)


def test_count_restarts_after_180_day_gap():
    old = [("AFTER_CHAT", NOW - timedelta(days=400))] * 4
    recent = [("AFTER_CHAT", NOW - timedelta(days=10))]
    result = calc.posting_limit(old + recent, NOW)
    assert (result.after_chat, result.limited) == (1, False)


def test_posting_limit_is_users_only(client, db, clock):
    supplier = make_supplier(db, review_status="APPROVED")
    assert login_as(client, supplier.user).get("/api/v1/me/posting-limit").status_code == 404  # 다른 역할은 404 (CLAUDE.md 10)


# ---- AC-F4-07 ------------------------------------------------------------------------------


def test_ac_f4_07_rejection_and_usage_counts(client, db, clock):
    user = make_user(db)
    _reject(client, db, user, chat=True)
    _reject(client, db, user, chat=False)
    done = _published(client, user)
    db.rollback()
    db.get(Performance, done).status = "COMPLETED"
    db.commit()

    counts = rejection.user_counts(db, {user.id}, now=NOW)
    assert counts[user.id] == {"rejection_count": 2, "usage_count": 1}


def test_record_rejection_for_cancel_before_payment(client, db, clock):
    """D-57: 채팅을 시작한 공연을 결제 전에 취소하면 채팅 반려 (4번 묶음 취소에서 부른다)."""
    user = make_user(db)
    perf_id = _published(client, user)
    _quote(db, perf_id, chat=True)

    rejection.record_rejection(db, perf_id, now=NOW)
    db.commit()

    assert _events(db, user.id) == ["AFTER_CHAT"]
