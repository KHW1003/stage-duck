"""사이트 안 알림 (specs/notifications.md, D-52, 이슈 #45). 다른 묶음은 notify()·notify_many() 만 부른다.

- 부른 서비스의 트랜잭션 안에서 저장만 한다 (커밋하지 않는다). 커밋되면 WebSocket `notification` 이벤트로 보낸다
  (chat.realtime.publish_after_commit — 롤백되면 보내지 않는다).
- 내가 한 일은 나에게 알리지 않는다: actor_id 와 받는 사람이 같으면 건너뛴다 (1장 규칙 2).
- 문구는 templates.py 틀을 채워 확정해 저장한다. 연락처 모양(전화·계좌·메일)은 가린다 (1장 규칙 4).
- 채팅 메시지는 알림을 만들지 않는다 (1장 규칙 1) — 이 모듈을 부르지 않는다.
- 90일 지난 알림은 목록을 볼 때 지운다 (스케줄러 대신, 1장 규칙 7).
"""
import re
from datetime import date, datetime, timedelta
from typing import Any, Iterable

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.chat import realtime
from app.models.notification import Notification
from app.notification.templates import STAGE_LABEL, TEMPLATES

PAGE_SIZE = 20
KEEP_DAYS = 90

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_LONG_DIGITS = re.compile(r"\d[\d\-. ]{7,}\d")  # 전화·계좌처럼 숫자가 길게 이어진 것


def won(n: int) -> str:
    return f"{n:,}"


def month_day(d: date) -> str:
    return f"{d.month}월 {d.day}일"


def stage_label(stage_type: str) -> str:
    return STAGE_LABEL.get(stage_type, stage_type)


def _mask(text: str | None) -> str | None:
    """연락처 모양을 가린다. 금액(1,250,000원)은 쉼표가 있어 잡히지 않는다."""
    if text is None:
        return None
    return _LONG_DIGITS.sub("•••", _EMAIL.sub("•••", text))


def _cut(text: str | None, size: int) -> str | None:
    if text is None:
        return None
    return text if len(text) <= size else text[: size - 1] + "…"


def snippet(text: str, size: int) -> str:
    """글 제목·댓글 앞부분 (한 줄로)."""
    flat = " ".join(text.split())
    return flat if len(flat) <= size else flat[:size] + "…"


def notify(
    db: Session, user_id: int, type_: str, *, link: str, params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None, actor_id: int | None = None,
) -> Notification | None:
    """알림 하나를 저장하고 커밋되면 실시간으로 보낸다. 커밋하지 않는다."""
    if actor_id is not None and actor_id == user_id:
        return None
    category, title_tmpl, body_tmpl = TEMPLATES[type_]
    params = params or {}
    row = Notification(
        user_id=user_id, type=type_, category=category,
        title=_cut(_mask(title_tmpl.format(**params)), 100),
        body=_cut(_mask(body_tmpl.format(**params)), 200) if body_tmpl else None,
        link=link, payload=payload, created_at=datetime.now(),
    )
    db.add(row)
    db.flush()
    realtime.publish_after_commit(db, [user_id], "notification", _event(row))
    return row


def notify_many(
    db: Session, user_ids: Iterable[int], type_: str, *, link: str, params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None, actor_id: int | None = None,
) -> None:
    for uid in dict.fromkeys(user_ids):
        notify(db, uid, type_, link=link, params=params, payload=payload, actor_id=actor_id)


def _event(n: Notification) -> dict[str, Any]:
    return {
        "id": n.id, "type": n.type, "category": n.category, "title": n.title, "body": n.body, "link": n.link,
        "createdAt": n.created_at.isoformat(timespec="milliseconds"),
    }


# ---------------------------------------------------------------------------
# 내 알림 (GET·POST /me/notifications)
# ---------------------------------------------------------------------------


def unread_count(db: Session, user_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )


def list_mine(
    db: Session, user_id: int, *, category: str | None, before: int | None, now: datetime,
) -> tuple[list[Notification], int | None]:
    """최신순 20개. before = 이 id 보다 앞의 것. 다음 쪽이 있으면 그 기준 id 를 함께 돌려준다."""
    db.execute(delete(Notification).where(Notification.created_at < now - timedelta(days=KEEP_DAYS)))
    db.commit()
    stmt = select(Notification).where(Notification.user_id == user_id)
    if category:
        stmt = stmt.where(Notification.category == category)
    if before:
        stmt = stmt.where(Notification.id < before)
    rows = list(db.scalars(stmt.order_by(Notification.id.desc()).limit(PAGE_SIZE + 1)))
    more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    return rows, (rows[-1].id if more else None)


def mark_read(db: Session, user_id: int, *, ids: list[int] | None, all_: bool, now: datetime) -> None:
    """읽음 처리. 남의 id 는 조용히 무시한다 (notifications.md 7장)."""
    stmt = update(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
    if not all_:
        if not ids:
            return
        stmt = stmt.where(Notification.id.in_(ids))
    db.execute(stmt.values(read_at=now).execution_options(synchronize_session=False))
    db.commit()
