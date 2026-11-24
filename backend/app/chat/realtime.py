"""실시간 이벤트 보내기 (api-contract.md 7장 WebSocket, T3-02 #42).

- 연결 목록은 **이 프로세스의 메모리**에만 있다 (user_id → 연결들). 서버를 여러 워커·여러 대로 띄우면
  다른 워커에 붙은 연결에는 이벤트가 가지 않는다 — 그때는 Redis pub/sub 같은 중계가 필요하다 (다음 단계).
- WebSocket은 받기 전용이다. 보내기는 REST이고, 서비스가 DB에 **커밋한 뒤에만** 이벤트를 보낸다
  (publish_after_commit). 롤백되면 버린다.
- 연결마다 보낼 줄(queue)이 하나 있고, 그 연결의 루프에서 차례로 보낸다 → 한 연결 안에서 순서가 지켜진다.
"""
import asyncio
import threading
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session, SessionTransaction

CLOSE_UNAUTHENTICATED = 4401  # api-contract.md 7장: 쿠키 인증 실패
_PENDING = "realtime_pending"  # Session.info 에 커밋을 기다리는 이벤트를 쌓는 칸


@dataclass(eq=False)
class Connection:
    """연결 하나: 그 연결의 이벤트 루프와 보낼 줄."""

    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)


_lock = threading.Lock()
_connections: dict[int, set[Connection]] = {}


def connect(user_id: int) -> Connection:
    """연결을 등록한다. WebSocket 엔드포인트(연결의 루프 안)에서 부른다."""
    conn = Connection(loop=asyncio.get_running_loop())
    with _lock:
        _connections.setdefault(user_id, set()).add(conn)
    return conn


def disconnect(user_id: int, conn: Connection) -> None:
    """끊긴 연결을 목록에서 뺀다. 여러 번 불러도 된다."""
    with _lock:
        conns = _connections.get(user_id)
        if conns is None:
            return
        conns.discard(conn)
        if not conns:
            del _connections[user_id]


def connection_count(user_id: int) -> int:
    with _lock:
        return len(_connections.get(user_id, ()))


def send_to_user(user_id: int, type_: str, data: dict[str, Any]) -> None:
    """그 사용자의 모든 연결에 `{type, data}` 를 보낸다. 연결이 없으면 아무 일도 하지 않는다.

    어느 스레드에서 불러도 된다 (동기 서비스는 스레드풀에서 돈다). 알림(#45)의 `notification` 이벤트도 이 함수로 보낸다.
    커밋 전의 내용을 보내지 않도록, 서비스에서는 보통 publish_after_commit 을 쓴다.
    """
    message = {"type": type_, "data": data}
    with _lock:
        targets = list(_connections.get(user_id, ()))
    for conn in targets:
        try:
            conn.loop.call_soon_threadsafe(conn.queue.put_nowait, message)
        except RuntimeError:  # 연결의 루프가 이미 닫힘 = 끊긴 연결
            disconnect(user_id, conn)


def publish_after_commit(db: Session, user_ids: Iterable[int], type_: str, data: dict[str, Any]) -> None:
    """이 세션이 커밋되면 user_ids 에게 이벤트를 보낸다. 롤백·닫기로 끝나면 보내지 않는다.

    data 는 커밋 전에 만든 JSON 값이어야 한다 (커밋 뒤에는 ORM 값이 만료된다).
    """
    db.info.setdefault(_PENDING, []).append((tuple(dict.fromkeys(user_ids)), type_, data))


@event.listens_for(Session, "after_commit")
def _send_pending(session: Session) -> None:
    if session.in_nested_transaction():  # savepoint 커밋은 아직 진짜 커밋이 아니다
        return
    for user_ids, type_, data in session.info.pop(_PENDING, []):
        for user_id in user_ids:
            send_to_user(user_id, type_, data)


@event.listens_for(Session, "after_transaction_end")
def _drop_pending(session: Session, transaction: SessionTransaction) -> None:
    """바깥 트랜잭션이 커밋 없이 끝나면(롤백·닫기) 쌓인 이벤트를 버린다. 커밋된 것은 이미 _send_pending 이 꺼냈다."""
    if transaction.parent is None:
        session.info.pop(_PENDING, None)
