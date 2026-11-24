"""채팅 API (api-contract.md 채팅): 목록·고정·시작·메시지(글·사진·파일)·읽음, 그리고 실시간 GET /ws (7장)."""
import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, WebSocket, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.auth.deps import current_user, require_role
from app.auth.tokens import ACCESS_COOKIE
from app.chat import realtime, service
from app.chat.schemas import MessageIn, MessageOut, MessagesOut, PinOut, ReadIn, RoomOut, StartOut
from app.core.db import get_db
from app.core.errors import AppError
from app.models.user import User

router = APIRouter(prefix="/chat-rooms", tags=["chat"])
ws_router = APIRouter(tags=["chat"])  # /api/v1 밖의 /ws (화면 개발 서버가 /ws 를 그대로 넘긴다)

member = require_role("USER", "SUPPLIER")


def get_now() -> datetime:
    """지금 시각 (KST 서버 시각). 테스트에서 dependency_overrides 로 고정할 수 있다."""
    return datetime.now()


@router.get("", response_model=list[RoomOut])
def list_rooms(user: User = Depends(member), db: Session = Depends(get_db)) -> list[RoomOut]:
    """AC-F3-26·27: 내 채팅방 목록 (고정 먼저 → 최근 대화순)."""
    return [RoomOut.model_validate(r) for r in service.list_rooms(db, user)]


@router.put("/{room_id}/pin", response_model=PinOut)
def pin_room(
    room_id: int, user: User = Depends(member), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> PinOut:
    """AC-F3-27: 상단 고정 (나에게만)."""
    read = service.pin_room(db, user, room_id, now=now)
    return PinOut(room_id=room_id, pinned_at=read.pinned_at)


@router.delete("/{room_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
def unpin_room(room_id: int, user: User = Depends(member), db: Session = Depends(get_db)) -> Response:
    """AC-F3-27: 고정 풀기."""
    service.unpin_room(db, user, room_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{room_id}/start", response_model=StartOut)
def start_chat(
    room_id: int,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> StartOut:
    """AC-F3-06: [채팅 시작] (컨택)."""
    room = service.start_chat(db, user, room_id, now=now)
    return StartOut(room_id=room.id, started_at=room.started_at)


@router.get("/{room_id}/messages", response_model=MessagesOut)
def list_messages(
    room_id: int,
    after: int | None = Query(default=None, ge=0),
    limit: int = Query(default=50, ge=1, le=50),
    user: User = Depends(member),
    db: Session = Depends(get_db),
) -> MessagesOut:
    """AC-F3-07·08: 메시지 (?after=&limit=50) + 상대가 읽은 위치."""
    return MessagesOut.model_validate(service.list_messages(db, user, room_id, after=after, limit=limit))


@router.post("/{room_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(
    room_id: int,
    body: MessageIn,
    user: User = Depends(member),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> MessageOut:
    """AC-F3-06·08·15: 메시지 보내기 (TEXT·IMAGE·FILE)."""
    return MessageOut.model_validate(service.send_message(db, user, room_id, body, now=now))


@router.post("/{room_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(room_id: int, body: ReadIn, user: User = Depends(member), db: Session = Depends(get_db)) -> Response:
    """AC-F3-08: 읽음."""
    service.mark_read(db, user, room_id, body.last_message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@ws_router.websocket("/ws")
async def events(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    """api-contract.md 7장: 내 채팅방·알림 이벤트를 받는 연결 하나. 받기 전용 (보내기는 REST).

    쿠키 인증은 REST 와 같은 기준(current_user)이다. 실패하면 연결을 받은 뒤 4401 로 닫는다
    (받기 전에 닫으면 브라우저가 닫힘 코드를 볼 수 없다). 확인이 끝나면 DB 세션은 바로 돌려준다.
    연결 목록에 먼저 올린 뒤 연결을 받는다 → 화면이 '열림'을 본 뒤에 생긴 이벤트는 빠지지 않는다.
    """
    try:
        user = await run_in_threadpool(current_user, websocket.cookies.get(ACCESS_COOKIE), db)
        user_id = user.id
    except AppError:
        await websocket.accept()
        await websocket.close(code=realtime.CLOSE_UNAUTHENTICATED)
        return
    finally:
        db.close()

    conn = realtime.connect(user_id)
    try:
        await websocket.accept()
    except BaseException:
        realtime.disconnect(user_id, conn)
        raise
    writer = asyncio.create_task(_write(websocket, conn))
    try:
        while (await websocket.receive())["type"] != "websocket.disconnect":
            pass  # 화면이 보낸 것은 쓰지 않는다
    finally:
        realtime.disconnect(user_id, conn)
        writer.cancel()


async def _write(websocket: WebSocket, conn: realtime.Connection) -> None:
    """이 연결의 보낼 줄을 차례로 보낸다. 보내다 실패하면(끊김) 멈추고, 읽는 쪽이 끊김을 받아 정리한다."""
    while True:
        await websocket.send_json(await conn.queue.get())
