"""공지사항 읽기 (FR-CS-02, AC-F5-21). 쓰기는 관리자 SQLAdmin(NoticeAdmin)만 한다.

- 목록: 고정 글 먼저, 그다음 게시일 최신순. 게시일이 아직 안 된 글(예약)은 보이지 않는다.
- 상세: 이전 글 = 바로 먼저 올린 글, 다음 글 = 바로 나중에 올린 글 (고정 여부와 상관없이 게시일 순).
"""
import math
from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models.support import Notice

PAGE_SIZE = 20


def list_notices(db: Session, *, page: int, now: datetime) -> tuple[list[Notice], int]:
    visible = Notice.published_at <= now
    total = db.scalar(select(func.count()).select_from(Notice).where(visible)) or 0
    rows = db.scalars(
        select(Notice)
        .where(visible)
        .order_by(Notice.is_pinned.desc(), Notice.published_at.desc(), Notice.id.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    ).all()
    return list(rows), total


def total_pages(total: int) -> int:
    return max(1, math.ceil(total / PAGE_SIZE))


def get_public_notice(db: Session, notice_id: int, *, now: datetime) -> Notice | None:
    """공개된(게시일이 지난) 공지면 돌려주고 아니면 None. SEO head 도 이 함수를 쓴다."""
    notice = db.get(Notice, notice_id)
    return notice if notice is not None and notice.published_at <= now else None


def get_notice(db: Session, notice_id: int, *, now: datetime) -> tuple[Notice, Notice | None, Notice | None]:
    """(공지, 이전 글, 다음 글). 없거나 아직 게시 전이면 404."""
    notice = get_public_notice(db, notice_id, now=now)
    if notice is None:
        raise not_found()
    at, nid = notice.published_at, notice.id
    earlier = or_(Notice.published_at < at, and_(Notice.published_at == at, Notice.id < nid))
    later = or_(Notice.published_at > at, and_(Notice.published_at == at, Notice.id > nid))
    prev = db.scalar(select(Notice).where(earlier).order_by(Notice.published_at.desc(), Notice.id.desc()).limit(1))
    nxt = db.scalar(
        select(Notice)
        .where(later, Notice.published_at <= now)
        .order_by(Notice.published_at.asc(), Notice.id.asc())
        .limit(1)
    )
    return notice, prev, nxt


def public_notice_stamps(db: Session, *, now: datetime) -> list[tuple[int, datetime]]:
    """sitemap.xml 용: 공개된 공지의 (id, 게시일)."""
    rows = db.execute(select(Notice.id, Notice.published_at).where(Notice.published_at <= now).order_by(Notice.id))
    return [(i, at) for i, at in rows]
