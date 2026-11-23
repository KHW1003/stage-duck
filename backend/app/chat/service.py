"""채팅방·메시지·읽음·상단 고정·실시간 이벤트 (T3-02 #42, api-contract.md 채팅·7장). 견적 내역 확인 카드는 #43.

다른 묶음의 테이블은 고치지 않는다. 단계(stages, 2번)는 방이 어느 공연·단계인지 알기 위해,
사용자(users, 1번)는 닉네임을 보여 주기 위해 **읽기 전용으로** 참조만 한다.
"""
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.chat import realtime
from app.chat.calc import ATTACHMENT_MIME, has_contact_pattern
from app.chat.schemas import MessageIn, MessageOut
from app.core.errors import AppError, not_found
from app.files import service as files_service
from app.models.chat import ChatMessage, ChatRead, ChatRoom
from app.models.request import Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.supplier import service as supplier_service

DEFAULT_PARTNER_NAME = "사용자"  # 닉네임이 없는 사용자


def _bad(field: str, message: str) -> AppError:
    return AppError(400, "VALIDATION_FAILED", message, [{"field": field, "message": message}])


def _my_supplier_id(db: Session, user: User) -> int | None:
    if user.role != "SUPPLIER":
        return None
    return supplier_service.get_application(db, user).id


def _is_member(db: Session, user: User, room: ChatRoom) -> bool:
    if user.role == "USER":
        return room.user_id == user.id
    if user.role == "SUPPLIER":
        return room.supplier_id == _my_supplier_id(db, user)
    return False


def _room_for(db: Session, user: User, room_id: int) -> ChatRoom:
    """AC-F3-07: 그 방의 사용자·업체만. 나머지는 404."""
    room = db.get(ChatRoom, room_id)
    if room is None or not _is_member(db, user, room):
        raise not_found()
    return room


def _participant_ids(db: Session, room: ChatRoom) -> list[int]:
    """그 방의 사용자와 업체 계정 — 실시간 이벤트를 받는 사람 (AC-F3-07: 이 둘 말고는 받지 않는다)."""
    supplier_user_id = db.scalar(select(Supplier.user_id).where(Supplier.id == room.supplier_id))
    return [room.user_id, supplier_user_id]


def _publish_message(db: Session, room: ChatRoom, message: ChatMessage) -> None:
    """api-contract.md 7장 message.created. 보낸 사람의 다른 탭도 같은 이벤트를 받는다. 커밋한 뒤에 나간다.

    계약서 payload 는 senderId 라서 REST 응답(senderUserId)과 이름만 바꾼다.
    """
    db.flush()
    payload = MessageOut.model_validate(message).model_dump(mode="json", by_alias=True)
    payload["senderId"] = payload.pop("senderUserId")
    realtime.publish_after_commit(
        db, _participant_ids(db, room), "message.created", {"roomId": room.id, "message": payload}
    )


def _my_read(db: Session, room_id: int, user_id: int, *, lock: bool = False) -> ChatRead:
    stmt = select(ChatRead).where(ChatRead.room_id == room_id, ChatRead.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    read = db.scalar(stmt)
    if read is None:
        read = ChatRead(room_id=room_id, user_id=user_id)
        db.add(read)
    return read


# ---------------------------------------------------------------------------
# 목록·고정 (AC-F3-26·27)
# ---------------------------------------------------------------------------


def list_rooms(db: Session, user: User) -> list[dict[str, Any]]:
    """AC-F3-27, D-56: 내 채팅방. 내가 고정한 방 먼저, 각 묶음 안은 최근 대화순 (마지막 메시지 번호가 큰 순).

    상대 이름은 업체 상호 또는 사용자 닉네임만 (연락처·실명 없음, CLAUDE.md 3장 20).
    """
    supplier_id = _my_supplier_id(db, user)
    owner = ChatRoom.supplier_id == supplier_id if supplier_id is not None else ChatRoom.user_id == user.id
    rooms = db.scalars(select(ChatRoom).where(owner)).all()
    if not rooms:
        return []
    ids = [r.id for r in rooms]

    last_ids = dict(
        db.execute(
            select(ChatMessage.room_id, func.max(ChatMessage.id)).where(ChatMessage.room_id.in_(ids)).group_by(ChatMessage.room_id)
        ).all()
    )
    last_msgs = {m.room_id: m for m in db.scalars(select(ChatMessage).where(ChatMessage.id.in_(last_ids.values())))}
    reads = {r.room_id: r for r in db.scalars(select(ChatRead).where(ChatRead.room_id.in_(ids), ChatRead.user_id == user.id))}
    unread = dict(
        db.execute(
            select(ChatMessage.room_id, func.count())
            .outerjoin(ChatRead, and_(ChatRead.room_id == ChatMessage.room_id, ChatRead.user_id == user.id))
            .where(
                ChatMessage.room_id.in_(ids),
                ChatMessage.id > func.coalesce(ChatRead.last_read_message_id, 0),
                or_(ChatMessage.sender_user_id.is_(None), ChatMessage.sender_user_id != user.id),
            )
            .group_by(ChatMessage.room_id)
        ).all()
    )
    stages = {s.id: s for s in db.scalars(select(Stage).where(Stage.id.in_({r.stage_id for r in rooms})))}
    if supplier_id is None:
        names = dict(db.execute(select(Supplier.id, Supplier.company_name).where(Supplier.id.in_({r.supplier_id for r in rooms}))).all())
        partner = {r.id: names[r.supplier_id] for r in rooms}
    else:
        names = dict(db.execute(select(User.id, User.nickname).where(User.id.in_({r.user_id for r in rooms}))).all())
        partner = {r.id: names.get(r.user_id) or DEFAULT_PARTNER_NAME for r in rooms}

    rows = []
    for room in rooms:
        read = reads.get(room.id)
        last = last_msgs.get(room.id)
        rows.append({
            "room_id": room.id,
            "stage_id": room.stage_id,
            "stage_type": stages[room.stage_id].stage_type,
            "performance_id": stages[room.stage_id].performance_id,
            "partner_name": partner[room.id],
            "started_at": room.started_at,
            "pinned_at": read.pinned_at if read else None,
            "unread_count": unread.get(room.id, 0),
            "last_message": last,
        })
    rows.sort(key=lambda r: (r["pinned_at"] is None, -(last_ids.get(r["room_id"]) or 0), -r["room_id"]))
    return rows


def _ms(now: datetime) -> datetime:
    """DateTime3 은 밀리초까지만 저장한다 — 첫 응답과 다시 읽은 값이 같도록 저장 전에 맞춘다 (MariaDB)."""
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def pin_room(db: Session, user: User, room_id: int, *, now: datetime) -> ChatRead:
    """AC-F3-27: 나에게만 상단 고정. 이미 고정했으면 처음 고정 시각 그대로."""
    _room_for(db, user, room_id)
    read = _my_read(db, room_id, user.id, lock=True)
    if read.pinned_at is None:
        read.pinned_at = _ms(now)
    db.commit()
    return read


def unpin_room(db: Session, user: User, room_id: int) -> None:
    """AC-F3-27: 고정 풀기. 이미 풀려 있어도 같은 결과."""
    _room_for(db, user, room_id)
    read = db.scalar(select(ChatRead).where(ChatRead.room_id == room_id, ChatRead.user_id == user.id).with_for_update())
    if read is not None and read.pinned_at is not None:
        read.pinned_at = None
    db.commit()


# ---------------------------------------------------------------------------
# 시작·메시지·읽음 (AC-F3-06·07·08·15)
# ---------------------------------------------------------------------------


def start_chat(db: Session, user: User, room_id: int, *, now: datetime) -> ChatRoom:
    """AC-F3-06: 그 공연의 사용자만 [채팅 시작]을 누를 수 있다 (= 컨택). 두 번 눌러도 처음 시각 그대로."""
    room = db.scalar(select(ChatRoom).where(ChatRoom.id == room_id).with_for_update())
    if room is None or user.role != "USER" or room.user_id != user.id:
        raise not_found()
    if room.started_at is None:
        room.started_at = _ms(now)
        # #45 업체에게 CHAT_STARTED (처음 한 번만). 닉네임만, 실명·연락처 없음
        from app.notification import service as notification  # 3번 안, 순환 import 피함

        stage = db.get(Stage, room.stage_id)
        supplier_user_id = db.scalar(select(Supplier.user_id).where(Supplier.id == room.supplier_id))
        notification.notify(
            db, supplier_user_id, "CHAT_STARTED", link=f"/chats/{room.id}",
            params={"nickname": user.nickname or "사용자", "title": stage.performance.title,
                    "stage": notification.stage_label(stage.stage_type)},
            payload={"roomId": room.id}, actor_id=user.id,
        )
    db.commit()
    return room


def list_messages(db: Session, user: User, room_id: int, *, after: int | None, limit: int) -> dict[str, Any]:
    """AC-F3-07·08: 방 메시지와 상대가 읽은 위치. after 가 있으면 그 뒤로 limit 개, 없으면 최근 limit 개 (오래된 순)."""
    _room_for(db, user, room_id)
    stmt = select(ChatMessage).where(ChatMessage.room_id == room_id)
    if after is not None:
        messages = db.scalars(stmt.where(ChatMessage.id > after).order_by(ChatMessage.id).limit(limit)).all()
    else:
        messages = list(reversed(db.scalars(stmt.order_by(ChatMessage.id.desc()).limit(limit)).all()))
    partner_read = db.scalar(
        select(ChatRead.last_read_message_id).where(ChatRead.room_id == room_id, ChatRead.user_id != user.id)
    )
    return {"messages": messages, "partner_last_read_message_id": partner_read}


def send_message(db: Session, user: User, room_id: int, body: MessageIn, *, now: datetime) -> ChatMessage:
    """AC-F3-06: 사용자가 [채팅 시작]을 누르기 전에는 업체가 보낼 수 없다 (403 CHAT_NOT_STARTED).
    AC-F3-15: 전화번호·계좌번호 모양이면 막지 않고 contact_warning 만 표시한다.
    AC-F3-08: 사진·파일은 먼저 올린 내 CHAT 파일(TEMP) 하나를 붙인다 (uploads.md). 남의 것·다른 용도·없는 것·
    이미 붙은 것은 400. IMAGE 는 jpg·png·webp, FILE 은 pdf (스펙에 나눔이 없어 #42에서 정함).
    저장(커밋)한 뒤 두 참여자의 /ws 로 message.created 를 보낸다.
    """
    room = _room_for(db, user, room_id)
    text = (body.body or "").strip() or None
    if body.type == "TEXT":
        if body.file_id is not None:
            raise _bad("fileId", "글 메시지에는 파일을 붙일 수 없어요. 사진·파일로 보내 주세요.")
        if text is None:
            raise _bad("body", "보낼 내용을 적어 주세요.")
    elif body.file_id is None:
        raise _bad("fileId", "보낼 사진이나 파일을 골라 주세요.")
    if user.role == "SUPPLIER" and room.started_at is None:
        raise AppError(403, "CHAT_NOT_STARTED", "사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.")

    file_id = None
    if body.file_id is not None:
        (stored,) = files_service.attach_files(db, owner_id=user.id, file_ids=[body.file_id], purpose="CHAT", now=now)
        if stored.mime_type not in ATTACHMENT_MIME[body.type]:
            raise _bad("type", "사진은 [사진]으로, PDF는 [파일]로 보내 주세요.")
        file_id = stored.id
    message = ChatMessage(
        room_id=room.id,
        sender_user_id=user.id,
        type=body.type,
        body=text,
        file_id=file_id,
        contact_warning=has_contact_pattern(text or ""),
    )
    db.add(message)
    _publish_message(db, room, message)
    db.commit()
    return message


def mark_read(db: Session, user: User, room_id: int, last_message_id: int) -> None:
    """AC-F3-08: 여기까지 읽음. 그 방 메시지가 아니면 400, 더 작은 번호가 오면 그대로 둔다.

    저장한 뒤 두 참여자의 /ws 로 message.read (상대 화면의 읽음 표시, 내 다른 탭의 안 읽은 수).
    """
    room = _room_for(db, user, room_id)
    exists = db.scalar(select(ChatMessage.id).where(ChatMessage.id == last_message_id, ChatMessage.room_id == room_id))
    if exists is None:
        raise _bad("lastMessageId", "이 채팅방의 메시지가 아니에요. 채팅방을 새로 열어 주세요.")
    read = _my_read(db, room_id, user.id, lock=True)
    if read.last_read_message_id is None or read.last_read_message_id < last_message_id:
        read.last_read_message_id = last_message_id
    realtime.publish_after_commit(
        db,
        _participant_ids(db, room),
        "message.read",
        {"roomId": room.id, "userId": user.id, "lastMessageId": read.last_read_message_id},
    )
    db.commit()


def can_read_chat_file(db: Session, user: User, file_id: int) -> bool:
    """[3 → 1 파일 모듈] uploads.md CHAT: 메시지로 보낸 채팅 파일은 그 방 참여자가 내려받을 수 있다 (AC-F3-07·08).

    올린 사람·관리자는 파일 모듈이 먼저 허용한다. 아직 메시지에 붙지 않은 파일은 False.
    """
    room_id = db.scalar(select(ChatMessage.room_id).where(ChatMessage.file_id == file_id).limit(1))
    if room_id is None:
        return False
    room = db.get(ChatRoom, room_id)
    return room is not None and _is_member(db, user, room)


# ---------------------------------------------------------------------------
# 같은 묶음(견적서)에서 부르는 함수 — 커밋하지 않는다
# ---------------------------------------------------------------------------


def _find_room(db: Session, stage_id: int, supplier_id: int) -> ChatRoom | None:
    return db.scalar(
        select(ChatRoom).where(ChatRoom.stage_id == stage_id, ChatRoom.supplier_id == supplier_id).with_for_update()
    )


def post_quote_message(db: Session, *, stage_id: int, supplier_id: int, user_id: int, quote_version_id: int) -> int:
    """AC-F2-15·20: 견적서를 보내거나 고치면 (단계 × 업체) 방을 — 없으면 만들고 — QUOTE 시스템 메시지를 남긴다.

    업체가 같은 단계에 견적서를 여러 개 보내도 방은 하나 (UNIQUE stage_id, supplier_id). 방 번호를 돌려준다.
    두 요청이 동시에 처음 방을 만들면 늦은 쪽은 UNIQUE 위반이 난다 → 그 부분만 savepoint 로 되돌리고 이미 생긴 방을 쓴다.
    """
    room = _find_room(db, stage_id, supplier_id)
    if room is None:
        try:
            with db.begin_nested():
                room = ChatRoom(stage_id=stage_id, supplier_id=supplier_id, user_id=user_id)
                db.add(room)
        except IntegrityError:
            room = _find_room(db, stage_id, supplier_id)
            if room is None:
                raise
    message = ChatMessage(room_id=room.id, sender_user_id=None, type="QUOTE", ref_id=quote_version_id)
    db.add(message)
    _publish_message(db, room, message)  # 부른 쪽이 커밋하면 나간다
    return room.id


def notify_quote_updated(db: Session, *, room_id: int, quote_id: int, version: int) -> None:
    """AC-F2-20, api-contract.md 7장 quote.updated: 견적서 새 버전. 커밋하지 않는다 — 부른 쪽이 커밋하면 나간다.

    changed(바뀐 칸 이름)는 아직 계산하지 않아 빈 목록이다.
    """
    room = db.get(ChatRoom, room_id)
    realtime.publish_after_commit(
        db,
        _participant_ids(db, room),
        "quote.updated",
        {"roomId": room_id, "quoteId": quote_id, "version": version, "changed": []},
    )


# ---------------------------------------------------------------------------
# 묶음 사이 약속 (CLAUDE.md 5장) — 3번 → 다른 묶음
# 이름·인자·돌려주는 모양을 바꾸려면 쓰는 쪽과 먼저 합의한다.
# ---------------------------------------------------------------------------


def chat_started(db: Session, performance_id: int, supplier_id: int) -> bool:
    """[약속 3 → 다른 묶음] 그 공연의 어느 단계든 그 업체와 채팅이 시작(started_at)됐으면 True. 커밋하지 않는다."""
    room_id = db.scalar(
        select(ChatRoom.id)
        .join(Stage, Stage.id == ChatRoom.stage_id)
        .where(Stage.performance_id == performance_id, ChatRoom.supplier_id == supplier_id, ChatRoom.started_at.is_not(None))
        .limit(1)
    )
    return room_id is not None


def invalidate_pending_cards(db: Session, stage_id: int) -> None:
    """[약속 3 → 2] 이 단계의 대기(PENDING) 견적 내역 확인 카드를 모두 INVALIDATED 로 바꾼다 (CLAUDE.md 3장 6).

    쓰는 곳: 2번 해원 #37 요청서 수정(새 버전) — 부르는 쪽 트랜잭션 안에서 실행되고 커밋하지 않는다.
    구현: 3번 채은 #43 (확인 카드 테이블을 만들 때). 그 전까지는 아무 일도 하지 않는다.
    """
    pass
