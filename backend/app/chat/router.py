"""채팅 API (api-contract.md 채팅): 목록·고정·시작·메시지·읽음. WebSocket·사진·파일은 다음 PR."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.chat import service
from app.chat.schemas import MessageIn, MessageOut, MessagesOut, PinOut, ReadIn, RoomOut, StartOut
from app.core.db import get_db
from app.models.user import User

router = APIRouter(prefix="/chat-rooms", tags=["chat"])

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
    room_id: int, body: MessageIn, user: User = Depends(member), db: Session = Depends(get_db)
) -> MessageOut:
    """AC-F3-06·08·15: 메시지 보내기 (TEXT)."""
    return MessageOut.model_validate(service.send_message(db, user, room_id, body))


@router.post("/{room_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(room_id: int, body: ReadIn, user: User = Depends(member), db: Session = Depends(get_db)) -> Response:
    """AC-F3-08: 읽음."""
    service.mark_read(db, user, room_id, body.last_message_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
