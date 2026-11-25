"""공연(계약) 취소를 채팅방에 실시간 안내 카드(NOTICE)로 남긴다 (FR-CHAT-02 안내 카드, AC-F5-08·09·10).

- 사용자 취소·결제 마감 자동 취소 → 그 공연에서 채팅을 시작한 모든 방
- 업체 사정 취소 → 그 업체 방만 (그 단계만 다시 모집). 공연이 통째로 취소되면 모든 방
- 채팅을 시작하지 않은 방(started_at 없음)에는 남기지 않는다
"""

from datetime import datetime, timedelta

from sqlalchemy import select

from app.models.chat import ChatMessage, ChatRoom
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.payment.deadline import run_due
from app.payment.service import payment_deadline
from tests.conftest import make_supplier
from tests.f2.test_quotes import _as
from tests.f5.test_cancel import _at, _paid
from tests.f5.test_payment_deadline import _awaiting
from tests.f5.test_order import NOW, _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

USER_CANCEL = "사용자가 공연을 취소했어요."
SUPPLIER_CANCEL = "업체 사정으로 확정이 취소됐어요. 이 단계는 다시 모집해요."
SUPPLIER_CANCEL_ALL = "업체 사정으로 공연이 취소됐어요."
EXPIRED = "결제 마감이 지나 공연이 자동으로 취소됐어요."


def _rooms(db, perf_id: int, supplier_ids) -> tuple[dict[int, int], int]:
    """확정 업체마다 채팅을 시작한 방 + 채팅을 시작하지 않은 다른 업체 방 하나. ({업체 id: 방 id}, 시작 안 한 방 id)"""
    user_id = db.get(Performance, perf_id).user_id
    started = {}
    for sid in supplier_ids:
        stage_id = db.scalar(
            select(Stage.id)
            .join(QuoteVersion, QuoteVersion.id == Stage.confirmed_quote_version_id)
            .join(Quote, Quote.id == QuoteVersion.quote_id)
            .where(Stage.performance_id == perf_id, Quote.supplier_id == sid)
        )
        room = ChatRoom(stage_id=stage_id, supplier_id=sid, user_id=user_id, started_at=NOW)
        db.add(room)
        db.flush()
        started[sid] = room.id
    other = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    venue = db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))
    quiet = ChatRoom(stage_id=venue, supplier_id=other.id, user_id=user_id)
    db.add(quiet)
    db.commit()
    return started, quiet.id


def _notices(db, room_id: int) -> list[str]:
    db.expire_all()
    return list(db.scalars(
        select(ChatMessage.body).where(ChatMessage.room_id == room_id, ChatMessage.type == "NOTICE").order_by(ChatMessage.id)
    ))


def _capture(monkeypatch) -> list[tuple[int, str, dict]]:
    from app.chat import realtime

    sent: list[tuple[int, str, dict]] = []
    monkeypatch.setattr(realtime, "send_to_user", lambda uid, t, data: sent.append((uid, t, data)))
    return sent


def test_ac_f5_09_user_cancel_posts_notice_to_every_started_room_in_real_time(client, db, monkeypatch):
    user, perf_id, (c, d) = _ready(client, db)
    rooms, quiet = _rooms(db, perf_id, (c, d))
    sent = _capture(monkeypatch)

    assert user.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 200

    assert _notices(db, rooms[c]) == [USER_CANCEL]
    assert _notices(db, rooms[d]) == [USER_CANCEL]
    assert _notices(db, quiet) == []  # 채팅을 시작하지 않은 방에는 남기지 않는다
    created = [(uid, data["roomId"], data["message"]["body"]) for uid, t, data in sent if t == "message.created"]
    owner = db.get(Performance, perf_id).user_id
    for sid in (c, d):
        supplier_user = db.get(Supplier, sid).user_id
        assert (owner, rooms[sid], USER_CANCEL) in created
        assert (supplier_user, rooms[sid], USER_CANCEL) in created


def test_ac_f5_08_paid_user_cancel_also_posts_notice(client, db):
    user, perf_id, _, (c, d) = _paid(client, db)
    rooms, _ = _rooms(db, perf_id, (c, d))
    _at(datetime(2026, 11, 27, 10, 0))  # D-1

    assert user.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 200

    assert _notices(db, rooms[c]) == [USER_CANCEL] and _notices(db, rooms[d]) == [USER_CANCEL]


def test_ac_f5_10_supplier_cancel_posts_notice_only_in_that_supplier_room(client, db):
    _, perf_id, _, (c, d) = _paid(client, db)
    rooms, _ = _rooms(db, perf_id, (c, d))

    res = _as(db, db.get(Supplier, c).user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "공간 누수"})

    assert res.status_code == 200, res.text
    assert _notices(db, rooms[c]) == [SUPPLIER_CANCEL]
    assert _notices(db, rooms[d]) == []  # 다른 확정 업체는 그대로 진행


def test_ac_f5_22_supplier_cancel_before_payment_posts_notice(client, db):
    _, perf_id, (c, d) = _ready(client, db)
    rooms, _ = _rooms(db, perf_id, (c, d))

    res = _as(db, db.get(Supplier, d).user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "장비 고장"})

    assert res.status_code == 200, res.text
    assert _notices(db, rooms[d]) == [SUPPLIER_CANCEL]
    assert _notices(db, rooms[c]) == []


def test_ac_f5_10_supplier_cancel_that_cancels_whole_show_posts_notice_everywhere(client, db):
    _, perf_id, _, (c, d) = _paid(client, db)
    rooms, _ = _rooms(db, perf_id, (c, d))
    _at(datetime(2026, 11, 26, 9, 0))  # 공연 5일 전 0시가 지나 다시 모집할 시간이 없다 → 공연 취소

    res = _as(db, db.get(Supplier, c).user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "공간 누수"})

    assert res.status_code == 200, res.text
    assert db.get(Performance, perf_id).status == "CANCELLED"
    assert _notices(db, rooms[c]) == [SUPPLIER_CANCEL_ALL]
    assert _notices(db, rooms[d]) == [SUPPLIER_CANCEL_ALL]


def test_d57_payment_deadline_auto_cancel_posts_notice(client, db):
    _, perf_id, (c, d), _ = _awaiting(client, db)
    rooms, quiet = _rooms(db, perf_id, (c, d))
    due = payment_deadline(db, perf_id)

    assert run_due(db, due + timedelta(minutes=1))[1] == 1  # 마감 1분 뒤 자동 취소 1건

    db.expire_all()
    assert db.get(Performance, perf_id).status == "CANCELLED"
    assert _notices(db, rooms[c]) == [EXPIRED] and _notices(db, rooms[d]) == [EXPIRED]
    assert _notices(db, quiet) == []


def test_failed_cancel_posts_nothing(client, db):
    user, perf_id, (c, d) = _ready(client, db)
    rooms, _ = _rooms(db, perf_id, (c, d))
    assert user.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 200

    again = user.post(f"/api/v1/performances/{perf_id}/cancel")  # 이미 취소 → 409, 안내를 또 남기지 않는다

    assert again.status_code == 409
    assert _notices(db, rooms[c]) == [USER_CANCEL]
