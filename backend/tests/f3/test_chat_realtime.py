"""채팅 실시간(WebSocket)·사진·파일 메시지 (T3-02 #42, AC-F3-07·08, api-contract.md 7장, uploads.md CHAT).

이벤트가 '안 온다'는 것은 기다려서 볼 수 없으므로, 확인할 동작 뒤에 그 연결로 표시(ping)를 하나 보내고
다음에 받은 것이 그 표시인지 본다. 연결마다 보내는 순서가 지켜지므로 그 사이에 다른 이벤트가 없으면 안 온 것이다.
"""
import io

import pytest
from PIL import Image
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.chat import realtime
from app.core.config import get_settings
from app.models.chat import ChatMessage, ChatRoom
from app.models.file import StoredFile
from app.models.quote import QuoteVersion
from tests.conftest import make_user
from tests.f2.test_quotes import _as, _body
from tests.f3.test_chat import API, _fixed_today, _room  # noqa: F401  (_fixed_today: 자동 픽스처)

WS = "/ws"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture(autouse=True)
def _upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))


def _png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (20, 10), "red").save(out, "PNG")
    return out.getvalue()


def _upload(c, purpose="CHAT", *, pdf=False) -> int:
    data, name, ctype = (PDF, "a.pdf", "application/pdf") if pdf else (_png(), "a.png", "image/png")
    res = c.post(f"{API}/files", files={"file": (name, data, ctype)}, data={"purpose": purpose})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _ping(ws, user_id: int) -> None:
    """이 연결에 지금까지 온 이벤트가 없음을 확인한다 (모듈 설명 참고)."""
    realtime.send_to_user(user_id, "test.ping", {})
    assert ws.receive_json() == {"type": "test.ping", "data": {}}


def _event(ws, type_: str) -> dict:
    got = ws.receive_json()
    assert got["type"] == type_, got
    return got["data"]


# ---- 연결 (4401) -----------------------------------------------------------------------------


@pytest.mark.parametrize("cookie", [None, "forged-token"])
def test_ws_without_valid_cookie_closes_4401(client, cookie):
    if cookie:
        client.cookies.set("access_token", cookie)
    with client.websocket_connect(WS) as ws:
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


def test_ws_suspended_account_closes_4401(db):
    c = _as(db, make_user(db, status="SUSPENDED"))
    with c.websocket_connect(WS) as ws:
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


def test_ws_closed_connection_is_removed(db):
    user = make_user(db)
    c = _as(db, user)
    with c.websocket_connect(WS) as ws:
        _ping(ws, user.id)
        assert realtime.connection_count(user.id) == 1
    assert realtime.connection_count(user.id) == 0
    realtime.send_to_user(user.id, "test.ping", {})  # 끊긴 뒤에 보내도 오류가 나지 않는다


# ---- AC-F3-08 메시지·읽음 ---------------------------------------------------------------------


def test_ac_f3_08_supplier_message_reaches_user_and_sender(client, db):
    user, d, room_id, _, supplier = _room(client, db)
    with user.websocket_connect(WS) as u_ws, d.websocket_connect(WS) as d_ws:
        res = d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "드럼 마이크도 추가돼요?"})
        assert res.status_code == 201, res.text
        sent = res.json()
        for ws in (u_ws, d_ws):  # 보낸 업체의 다른 탭도 같은 연결 규칙으로 받는다 (api-contract.md 7장)
            data = _event(ws, "message.created")
            assert data == {
                "roomId": room_id,
                "message": {
                    "id": sent["id"], "type": "TEXT", "body": "드럼 마이크도 추가돼요?", "attachmentUrl": None,
                    "refId": None, "senderId": supplier.user_id, "contactWarning": False,
                    "createdAt": sent["createdAt"], "replyTo": None, "editedAt": None, "deleted": False,
                },
            }


def test_ac_f3_08_user_read_reaches_supplier(client, db):
    user, d, room_id, _, _ = _room(client, db)
    msg_id = d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "안녕하세요"}).json()["id"]
    user_id = db.get(ChatRoom, room_id).user_id
    with d.websocket_connect(WS) as d_ws:
        assert user.post(f"{API}/chat-rooms/{room_id}/read", json={"lastMessageId": msg_id}).status_code == 204
        assert _event(d_ws, "message.read") == {"roomId": room_id, "userId": user_id, "lastMessageId": msg_id}


def test_ac_f3_08_failed_message_sends_no_event(client, db):
    """저장하지 못한 메시지(400)는 이벤트도 없다 — 커밋한 뒤에만 보낸다."""
    user, d, room_id, _, _ = _room(client, db)
    user_id = db.get(ChatRoom, room_id).user_id
    with user.websocket_connect(WS) as u_ws:
        assert d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "  "}).status_code == 400
        _ping(u_ws, user_id)


# ---- AC-F3-07 방 밖의 사람 --------------------------------------------------------------------


def test_ac_f3_07_outsider_connection_gets_nothing(client, db):
    user, d, room_id, _, _ = _room(client, db)
    other_user = make_user(db)
    other_supplier_user = make_user(db, role="SUPPLIER")
    o1, o2 = _as(db, other_user), _as(db, other_supplier_user)
    with o1.websocket_connect(WS) as ws1, o2.websocket_connect(WS) as ws2:
        msg_id = d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "안녕하세요"}).json()["id"]
        assert user.post(f"{API}/chat-rooms/{room_id}/read", json={"lastMessageId": msg_id}).status_code == 204
        _ping(ws1, other_user.id)
        _ping(ws2, other_supplier_user.id)


# ---- 견적서 고치기 → QUOTE 메시지 ---------------------------------------------------------------


def test_ac_f2_20_quote_update_sends_quote_message_and_quote_updated(client, db):
    user, d, room_id, _, _ = _room(client, db)
    first_version_id = db.scalar(select(ChatMessage.ref_id).where(ChatMessage.room_id == room_id, ChatMessage.type == "QUOTE"))
    quote_id = db.get(QuoteVersion, first_version_id).quote_id
    with user.websocket_connect(WS) as u_ws:
        res = d.put(f"{API}/quotes/{quote_id}", json={**_body(), "version": 1})
        assert res.status_code == 200, res.text
        data = _event(u_ws, "message.created")
        assert data["roomId"] == room_id
        assert data["message"]["type"] == "QUOTE" and data["message"]["senderId"] is None
        new_version_id = db.scalar(select(QuoteVersion.id).where(QuoteVersion.quote_id == quote_id, QuoteVersion.version == 2))
        assert data["message"]["refId"] == new_version_id
        assert _event(u_ws, "quote.updated") == {"roomId": room_id, "quoteId": quote_id, "version": 2, "changed": []}


# ---- AC-F3-08 사진·파일 메시지 ---------------------------------------------------------------


@pytest.mark.parametrize(("type_", "pdf"), [("IMAGE", False), ("FILE", True)])
def test_ac_f3_08_image_file_message(client, db, type_, pdf):
    user, d, room_id, _, _ = _room(client, db)
    file_id = _upload(d, pdf=pdf)
    with user.websocket_connect(WS) as u_ws:
        res = d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": type_, "fileId": file_id})
        assert res.status_code == 201, res.text
        assert res.json()["attachmentUrl"] == f"/api/v1/files/{file_id}"
        message = _event(u_ws, "message.created")["message"]
        assert (message["type"], message["attachmentUrl"], message["body"]) == (type_, f"/api/v1/files/{file_id}", None)
    db.expire_all()
    assert db.get(StoredFile, file_id).status == "ATTACHED"
    listed = user.get(f"{API}/chat-rooms/{room_id}/messages").json()["messages"]
    assert listed[-1]["attachmentUrl"] == f"/api/v1/files/{file_id}"


def test_ac_f3_08_bad_file_ids_are_400(client, db):
    user, d, room_id, _, _ = _room(client, db)
    others = _upload(user)  # 사용자가 올린 파일 → 업체가 보내면 남의 파일
    profile = _upload(d, "PROFILE")
    used = _upload(d)
    assert d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "IMAGE", "fileId": used}).status_code == 201
    pdf = _upload(d, pdf=True)
    png = _upload(d)
    cases = [
        {"type": "IMAGE", "fileId": others},  # 남의 파일
        {"type": "IMAGE", "fileId": profile},  # 다른 용도
        {"type": "IMAGE", "fileId": 999999},  # 없는 파일
        {"type": "IMAGE", "fileId": used},  # 이미 붙은 파일
        {"type": "IMAGE"},  # 파일 없음
        {"type": "IMAGE", "fileId": pdf},  # 사진 칸에 PDF
        {"type": "FILE", "fileId": png},  # 파일 칸에 사진
        {"type": "TEXT", "body": "안녕", "fileId": png},  # 글 메시지에 파일
    ]
    for body in cases:
        res = d.post(f"{API}/chat-rooms/{room_id}/messages", json=body)
        assert res.status_code == 400, (body, res.text)
        assert res.json()["code"] == "VALIDATION_FAILED"


def test_ac_f3_06_image_before_start_is_403(client, db):
    user, d, room_id, _, _ = _room(client, db, start=False)
    file_id = _upload(d)
    res = d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "IMAGE", "fileId": file_id})
    assert res.status_code == 403 and res.json()["code"] == "CHAT_NOT_STARTED"


def test_ac_f3_07_chat_file_download_only_room_members(client, db):
    user, d, room_id, _, _ = _room(client, db)
    file_id = _upload(d)
    assert d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "IMAGE", "fileId": file_id}).status_code == 201
    assert user.get(f"{API}/files/{file_id}").status_code == 200  # 받은 사람
    assert d.get(f"{API}/files/{file_id}").status_code == 200  # 올린 사람
    assert _as(db, make_user(db, role="ADMIN")).get(f"{API}/files/{file_id}").status_code == 200  # 관리자 (uploads.md 2장)
    for outsider in (make_user(db), make_user(db, role="SUPPLIER")):
        assert _as(db, outsider).get(f"{API}/files/{file_id}").status_code == 404


def test_ac_f3_07_unsent_chat_file_not_readable_by_partner(client, db):
    """아직 메시지로 보내지 않은 TEMP 파일은 상대도 열 수 없다."""
    user, d, room_id, _, _ = _room(client, db)
    file_id = _upload(d)
    assert user.get(f"{API}/files/{file_id}").status_code == 404
