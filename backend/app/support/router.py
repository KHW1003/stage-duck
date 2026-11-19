"""공지사항 API (api-contract.md · FR-CS-02 · AC-F5-21). 누구나 읽는다 (로그인 필요 없음)."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.support import service
from app.support.schemas import NoticeDetail, NoticeItem, NoticeNeighbor, NoticePage

router = APIRouter(prefix="/notices", tags=["support"])


def get_now() -> datetime:
    """지금 시각. 테스트는 dependency_overrides 로 바꾼다."""
    return datetime.now()


@router.get("", response_model=NoticePage)
def list_notices(
    page: int = Query(1, ge=1, le=1000), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> NoticePage:
    """AC-F5-21: 고정 글이 맨 위, 그다음 최신 글."""
    rows, total = service.list_notices(db, page=page, now=now)
    return NoticePage(
        items=[NoticeItem.model_validate(r) for r in rows],
        page=page,
        total_pages=service.total_pages(total),
        total=total,
    )


@router.get("/{notice_id}", response_model=NoticeDetail)
def get_notice(notice_id: int, db: Session = Depends(get_db), now: datetime = Depends(get_now)) -> NoticeDetail:
    notice, prev, nxt = service.get_notice(db, notice_id, now=now)
    return NoticeDetail(
        id=notice.id,
        category=notice.category,
        title=notice.title,
        is_pinned=notice.is_pinned,
        published_at=notice.published_at,
        body=notice.body,
        prev=NoticeNeighbor.model_validate(prev) if prev else None,
        next=NoticeNeighbor.model_validate(nxt) if nxt else None,
    )
