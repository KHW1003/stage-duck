"""채팅 REST — 방 목록·고정·시작·메시지·읽음 (T3-02 #42, AC-F3-06·07·08·15·27, api-contract.md 채팅).

WebSocket(실시간)·사진·파일은 다음 PR이다. 여기서는 REST만 본다.
"""
from datetime import datetime

import pytest
from sqlalchemy import select

from app.chat import service as chat_service
from app.main import app
from app.models.chat import ChatMessage, ChatRoom
from app.models.quote import QuoteVersion
from app.request.router import get_today
from tests.conftest import make_user
from tests.f2.test_posting import TODAY, _published
from tests.f2.test_quotes import _as, _body, _equipment_open, _supplier_d

API = "/api/v1"


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def _room(client, db, *, start=True):
    """장비 단계에 업체 D가 견적서를 보낸 방. (사용자 client, 업체 client, roomId, 공연 id)"""
    user, perf_id, stage_id = _equipment_open(client, db)
    supplier = _supplier_d(db)
    d = _as(db, supplier.user)
    res = d.post(f"{API}/stages/{stage_id}/quotes", json=_body())
    assert res.status_code == 201, res.text
    room_id = res.json()["chatRoomId"]
    if start:
        assert user.post(f"{API}/chat-rooms/{room_id}/start").status_code == 200
    return user, d, room_id, perf_id, supplier


def _send(c, room_id, body="안녕하세요"):
    return c.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": body})


def _rooms(c) -> list[int]:
    res = c.get(f"{API}/chat-rooms")
    assert res.status_code == 200, res.text
    return [r["roomId"] for r in res.json()]


# ---- 견적서 → 채팅방 ------------------------------------------------------------------------


def test_quote_creates_room_once_per_stage_and_supplier(client, db):
    user, d, room_id, _, supplier = _room(client, db, start=False)
    stage_id = db.get(ChatRoom, room_id).stage_id

    res = d.post(f"{API}/stages/{stage_id}/quotes", json=_body(label="고급형"))

    assert res.status_code == 201, res.text
    assert res.json()["chatRoomId"] == room_id
    rooms = db.scalars(select(ChatRoom).where(ChatRoom.stage_id == stage_id)).all()
    assert len(rooms) == 1 and rooms[0].supplier_id == supplier.id and rooms[0].started_at is None
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.room_id == room_id).order_by(ChatMessage.id)).all()
    assert [(m.type, m.sender_user_id) for m in msgs] == [("QUOTE", None), ("QUOTE", None)]


def test_quote_room_unique_conflict_reuses_existing_room(client, db, monkeypatch):
    """동시에 처음 방을 만든 경우를 흉내 낸다: 첫 조회가 방을 못 봐서 만들기를 시도 → UNIQUE 위반 → 있는 방을 쓴다."""
    _, d, room_id, _, _ = _room(client, db, start=False)
    stage_id = db.get(ChatRoom, room_id).stage_id
    real_find = chat_service._find_room
    calls = []

    def first_miss(db_, stage_id_, supplier_id_):
        calls.append(1)
        return None if len(calls) == 1 else real_find(db_, stage_id_, supplier_id_)

    monkeypatch.setattr(chat_service, "_find_room", first_miss)
    res = d.post(f"{API}/stages/{stage_id}/quotes", json=_body(label="고급형"))

    assert res.status_code == 201, res.text
    assert res.json()["chatRoomId"] == room_id
    assert len(calls) == 2  # 못 찾음 → 만들기 실패 → 다시 찾음
    db.expire_all()
    assert len(db.scalars(select(ChatRoom).where(ChatRoom.stage_id == stage_id)).all()) == 1
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.room_id == room_id)).all()
    assert [m.type for m in msgs] == ["QUOTE", "QUOTE"]


def test_quote_update_leaves_quote_message_with_new_version(client, db):
    _, d, room_id, _, _ = _room(client, db, start=False)
    first = db.scalar(select(ChatMessage).where(ChatMessage.room_id == room_id))
    assert d.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"][0]["refId"] == first.ref_id
    qv = db.get(QuoteVersion, first.ref_id)
    body = _body(version=1)
    body.pop("label")
    res = d.put(f"{API}/quotes/{qv.quote_id}", json=body)

    assert res.status_code == 200, res.text
    assert res.json()["chatRoomId"] == room_id
    db.expire_all()
    v2 = db.scalar(select(QuoteVersion).where(QuoteVersion.quote_id == qv.quote_id, QuoteVersion.version == 2))
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.room_id == room_id).order_by(ChatMessage.id)).all()
    assert [(m.type, m.ref_id) for m in msgs] == [("QUOTE", qv.id), ("QUOTE", v2.id)]


# ---- AC-F3-06 채팅 시작 전에는 업체가 보낼 수 없다 -----------------------------------------------


def test_ac_f3_06_supplier_cannot_send_before_start(client, db):
    user, d, room_id, _, _ = _room(client, db, start=False)

    res = _send(d, room_id)
    assert res.status_code == 403
    assert res.json()["code"] == "CHAT_NOT_STARTED"

    started = user.post(f"{API}/chat-rooms/{room_id}/start")
    assert started.status_code == 200, started.text
    assert started.json()["roomId"] == room_id and started.json()["startedAt"]

    res = _send(d, room_id)
    assert res.status_code == 201, res.text
    assert res.json()["type"] == "TEXT" and res.json()["body"] == "안녕하세요"


def test_ac_f3_06_start_only_by_performance_user_and_idempotent(client, db):
    user, d, room_id, _, _ = _room(client, db, start=False)
    other = _as(db, make_user(db))

    assert d.post(f"{API}/chat-rooms/{room_id}/start").status_code == 404
    assert other.post(f"{API}/chat-rooms/{room_id}/start").status_code == 404
    first = user.post(f"{API}/chat-rooms/{room_id}/start").json()["startedAt"]
    assert user.post(f"{API}/chat-rooms/{room_id}/start").json()["startedAt"] == first


def test_ac_f3_06_user_can_send_before_start(client, db):
    user, _, room_id, _, _ = _room(client, db, start=False)
    assert _send(user, room_id).status_code == 201


def test_ac_f3_06_invalid_file_or_blank_body_rejected(client, db):
    user, _, room_id, _, _ = _room(client, db)
    res = user.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "IMAGE", "fileId": 1})
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_FAILED"
    res = _send(user, room_id, body="   ")
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_FAILED"


def test_chat_started_contract(client, db):
    _, _, room_id, perf_id, supplier = _room(client, db, start=False)
    assert chat_service.chat_started(db, perf_id, supplier.id) is False
    db.get(ChatRoom, room_id).started_at = datetime(2026, 11, 18, 10, 0)
    db.commit()
    assert chat_service.chat_started(db, perf_id, supplier.id) is True
    assert chat_service.chat_started(db, perf_id, supplier.id + 999) is False


# ---- AC-F3-07 남의 채팅방은 열 수 없다 ---------------------------------------------------------


def test_ac_f3_07_other_people_get_404(client, db):
    user, d, room_id, _, _ = _room(client, db)
    msg_id = _send(user, room_id).json()["id"]
    other_user = _as(db, make_user(db))
    other_supplier = _as(db, _supplier_d(db).user)

    for c in (other_user, other_supplier):
        assert room_id not in _rooms(c)
        assert c.get(f"{API}/chat-rooms/{room_id}/messages").status_code == 404
        assert _send(c, room_id).status_code == 404
        assert c.post(f"{API}/chat-rooms/{room_id}/read", json={"lastMessageId": msg_id}).status_code == 404
        assert c.put(f"{API}/chat-rooms/{room_id}/pin").status_code == 404
        assert c.delete(f"{API}/chat-rooms/{room_id}/pin").status_code == 404
    assert user.get(f"{API}/chat-rooms/999999/messages").status_code == 404


def test_ac_f3_07_list_has_no_contact_or_real_name(client, db):
    user, d, room_id, _, supplier = _room(client, db)
    row = user.get(f"{API}/chat-rooms").json()[0]
    assert row["partnerName"] == supplier.company_name
    text = str(user.get(f"{API}/chat-rooms").json()) + str(d.get(f"{API}/chat-rooms").json())
    for key in ("phone", "email", "birthDate", "'name'"):
        assert key not in text


# ---- AC-F3-08 읽음 (실시간은 다음 PR) -----------------------------------------------------------


def test_ac_f3_08_read_visible_to_partner(client, db):
    user, d, room_id, _, _ = _room(client, db)
    m1 = _send(d, room_id, "첫 메시지").json()["id"]
    m2 = _send(d, room_id, "두 번째").json()["id"]

    assert next(r for r in user.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)["unreadCount"] == 3
    assert d.get(f"{API}/chat-rooms/{room_id}/messages").json()["partnerLastReadMessageId"] is None

    assert user.post(f"{API}/chat-rooms/{room_id}/read", json={"lastMessageId": m2}).status_code == 204
    assert d.get(f"{API}/chat-rooms/{room_id}/messages").json()["partnerLastReadMessageId"] == m2
    assert user.get(f"{API}/chat-rooms").json()[0]["unreadCount"] == 0

    # 더 작은 번호가 와도 줄지 않는다
    assert user.post(f"{API}/chat-rooms/{room_id}/read", json={"lastMessageId": m1}).status_code == 204
    assert d.get(f"{API}/chat-rooms/{room_id}/messages").json()["partnerLastReadMessageId"] == m2


def test_ac_f3_08_read_other_room_message_rejected(client, db):
    user, d, room_id, _, _ = _room(client, db)
    res = user.post(f"{API}/chat-rooms/{room_id}/read", json={"lastMessageId": 999999})
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_FAILED"


def test_ac_f3_08_messages_after_and_limit(client, db):
    user, _, room_id, _, _ = _room(client, db)
    ids = [_send(user, room_id, f"m{i}").json()["id"] for i in range(3)]
    res = user.get(f"{API}/chat-rooms/{room_id}/messages", params={"after": ids[0], "limit": 1})
    assert [m["id"] for m in res.json()["messages"]] == [ids[1]]


# ---- AC-F3-15 연락처 경고 ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("body", "warning"),
    [
        ("제 번호 010-1234-5678 로 연락 주세요", True),
        ("입금은 110-123-456789 계좌로", True),
        ("총 1,250,000원입니다", False),
        ("설치는 90분이면 돼요", False),
    ],
)
def test_ac_f3_15_contact_warning(client, db, body, warning):
    user, d, room_id, _, _ = _room(client, db)
    res = _send(d, room_id, body)
    assert res.status_code == 201, res.text
    assert res.json()["contactWarning"] is warning
    listed = user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"][-1]
    assert listed["contactWarning"] is warning


# ---- AC-F3-27 상단 고정 -----------------------------------------------------------------------


def test_ac_f3_27_pinned_room_stays_on_top_only_for_me(client, db):
    user, perf_id, stage_id = _equipment_open(client, db)
    sup_a, sup_b = _supplier_d(db), _supplier_d(db)
    a, b = _as(db, sup_a.user), _as(db, sup_b.user)
    room_a = a.post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["chatRoomId"]
    room_b = b.post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["chatRoomId"]
    for r in (room_a, room_b):
        user.post(f"{API}/chat-rooms/{r}/start")
    assert _rooms(user) == [room_b, room_a]  # 최근 대화순

    pin = user.put(f"{API}/chat-rooms/{room_a}/pin")
    assert pin.status_code == 200 and pin.json()["roomId"] == room_a and pin.json()["pinnedAt"]
    assert user.put(f"{API}/chat-rooms/{room_a}/pin").json() == pin.json()  # 두 번 눌러도 같다

    _send(b, room_b, "새 메시지")
    listed = user.get(f"{API}/chat-rooms").json()
    assert [r["roomId"] for r in listed] == [room_a, room_b]
    assert listed[0]["pinnedAt"] == pin.json()["pinnedAt"] and listed[1]["pinnedAt"] is None
    assert a.get(f"{API}/chat-rooms").json()[0]["pinnedAt"] is None  # 상대방에게는 영향 없음

    assert user.delete(f"{API}/chat-rooms/{room_a}/pin").status_code == 204
    assert user.delete(f"{API}/chat-rooms/{room_a}/pin").status_code == 204
    assert _rooms(user) == [room_b, room_a]


def test_ac_f3_27_unpinned_order_by_last_message(client, db):
    user, perf_id, stage_id = _equipment_open(client, db)
    a, b = _as(db, _supplier_d(db).user), _as(db, _supplier_d(db).user)
    room_a = a.post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["chatRoomId"]
    room_b = b.post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["chatRoomId"]
    _send(user, room_a, "A에 새 글")
    rows = user.get(f"{API}/chat-rooms").json()
    assert [r["roomId"] for r in rows] == [room_a, room_b]
    assert rows[0]["lastMessage"]["body"] == "A에 새 글"


def test_reply_quotes_original_message_in_same_room(client, db):
    """11/24 답장: replyToId 로 같은 방 메시지에 답하면 응답·목록에 원문(번호·보낸 사람·앞부분)이 붙는다."""
    user, d, room_id, _, supplier = _room(client, db)
    original = _send(d, room_id, "드럼 마이크도 포함이에요. " + "가" * 100).json()
    res = user.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "좋아요!", "replyToId": original["id"]})
    assert res.status_code == 201, res.text
    ref = res.json()["replyTo"]
    assert (ref["id"], ref["type"], ref["senderUserId"]) == (original["id"], "TEXT", supplier.user_id)
    assert ref["body"].startswith("드럼 마이크도 포함이에요.") and ref["body"].endswith("…") and len(ref["body"]) == 81
    listed = user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"]
    assert listed[-1]["replyTo"]["id"] == original["id"]
    assert next(m for m in listed if m["id"] == original["id"])["replyTo"] is None


def test_reply_to_other_room_or_missing_message_is_400(client, db):
    _, other_d, other_room, _, _ = _room(client, db)  # 먼저 만든 다른 방 (client 는 마지막 로그인으로 바뀐다)
    foreign = _send(other_d, other_room, "다른 방").json()["id"]
    user, _, room_id, _, _ = _room(client, db)
    for target in (foreign, 999_999):
        res = user.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "답장", "replyToId": target})
        assert res.status_code == 400, target
        assert res.json()["fieldErrors"][0]["field"] == "replyToId"


def test_before_loads_older_messages_page(client, db):
    """11/24 위로 올려 예전 대화: ?before=id 면 그 앞의 최근 limit 개 (오래된 순)."""
    user, d, room_id, _, _ = _room(client, db)
    ids = [_send(d, room_id, f"메시지 {i}").json()["id"] for i in range(6)]
    latest = user.get(f"{API}/chat-rooms/{room_id}/messages?limit=3").json()["messages"]
    assert [m["id"] for m in latest] == ids[-3:]
    older = user.get(f"{API}/chat-rooms/{room_id}/messages?limit=3&before={ids[3]}").json()["messages"]
    assert [m["id"] for m in older] == ids[:3]


def test_edit_my_text_message_rechecks_contact_and_marks_edited(client, db):
    user, d, room_id, _, _ = _room(client, db)
    mid = _send(user, room_id, "내일 뵐게요").json()["id"]
    res = user.patch(f"{API}/chat-rooms/{room_id}/messages/{mid}", json={"body": "제 번호 010-1234-5678 로 연락 주세요"})
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["body"].startswith("제 번호") and out["editedAt"] and out["contactWarning"] is True
    listed = user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"]
    assert next(m for m in listed if m["id"] == mid)["editedAt"]


def test_only_sender_can_edit_or_delete(client, db):
    user, d, room_id, _, _ = _room(client, db)
    mine = _send(user, room_id, "사용자가 보냄").json()["id"]
    assert d.patch(f"{API}/chat-rooms/{room_id}/messages/{mine}", json={"body": "바꿔치기"}).status_code == 404
    assert d.delete(f"{API}/chat-rooms/{room_id}/messages/{mine}").status_code == 404
    system = user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"][0]  # 견적서 도착 (시스템)
    assert system["senderUserId"] is None
    assert user.delete(f"{API}/chat-rooms/{room_id}/messages/{system['id']}").status_code == 404


def test_delete_keeps_row_and_hides_content_and_reply_quote(client, db):
    user, d, room_id, _, _ = _room(client, db)
    original = _send(d, room_id, "이 견적으로 괜찮을까요?").json()["id"]
    reply = user.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "네!", "replyToId": original}).json()["id"]
    res = d.delete(f"{API}/chat-rooms/{room_id}/messages/{original}")
    assert res.status_code == 200
    assert (res.json()["deleted"], res.json()["body"]) == (True, None)
    listed = user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"]
    gone = next(m for m in listed if m["id"] == original)
    assert (gone["deleted"], gone["body"], gone["attachmentUrl"]) == (True, None, None)
    quote = next(m for m in listed if m["id"] == reply)["replyTo"]
    assert (quote["id"], quote["deleted"], quote["body"]) == (original, True, None)
    # 지운 메시지는 다시 고치거나 지울 수 없다
    assert d.patch(f"{API}/chat-rooms/{room_id}/messages/{original}", json={"body": "되살리기"}).status_code == 404
    assert d.delete(f"{API}/chat-rooms/{room_id}/messages/{original}").status_code == 404


def test_room_list_has_latest_quote_version_for_quote_button(client, db):
    """11/25 [견적서 보기]: 채팅 목록 한 줄에 그 방의 가장 최근 견적서 버전 — 견적서 카드가 예전 대화로 밀려나도 열 수 있게."""
    user, d, room_id, _, _ = _room(client, db)
    quote_card = next(m for m in user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"] if m["type"] == "QUOTE")
    row = next(r for r in user.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)
    assert row["latestQuoteVersionId"] == quote_card["refId"]
    supplier_row = next(r for r in d.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)
    assert supplier_row["latestQuoteVersionId"] == quote_card["refId"]


def test_room_list_has_partner_photo(client, db):
    """11/25: 채팅 목록 한 줄에 상대 사진 — 사용자는 업체 대표 이미지, 업체는 사용자 프로필 사진."""
    from app.models import StoredFile, Supplier, User
    from app.models.chat import ChatRoom
    import uuid

    user, d, room_id, _, supplier = _room(client, db)
    room = db.get(ChatRoom, room_id)

    def photo(owner_id, purpose):
        f = StoredFile(owner_user_id=owner_id, purpose=purpose, visibility="PUBLIC", status="ATTACHED",
                       storage_key=f"public/x/{uuid.uuid4().hex}.webp", thumb_key=f"public/x/{uuid.uuid4().hex}_t.webp",
                       original_name="p.jpg", mime_type="image/webp", size_bytes=1)
        db.add(f)
        db.flush()
        return f.id

    db.get(Supplier, room.supplier_id).image_file_id = photo(supplier.user_id, "SUPPLIER_IMAGE")
    db.get(User, room.user_id).profile_file_id = photo(room.user_id, "PROFILE")
    db.commit()
    mine = next(r for r in user.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)
    theirs = next(r for r in d.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)
    assert mine["partnerImageUrl"] and theirs["partnerImageUrl"] and mine["partnerImageUrl"] != theirs["partnerImageUrl"]
