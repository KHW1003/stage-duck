"""공지사항 API (FR-CS-02 · AC-F5-21, 누구나 읽는다) + 1:1 문의 API (FR-CS-01 · AC-F5-18~20, 정지 계정 포함)."""
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import unauthenticated
from app.auth.tokens import read_access_token
from app.core.db import get_db
from app.files.service import file_url
from app.models.support import Inquiry
from app.models.user import User
from app.support import service
from app.support.schemas import (
    InquiryIn,
    InquiryItem,
    InquiryOut,
    InquiryPhoto,
    NoticeDetail,
    NoticeItem,
    NoticeNeighbor,
    NoticePage,
)

router = APIRouter(prefix="/notices", tags=["support"])
inquiry_router = APIRouter(tags=["support"])


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


def inquiry_member(access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> User:
    """문의 API 전용 로그인 확인. current_user 와 같지만 정지(SUSPENDED) 계정도 통과한다 (api-contract.md, D-48)."""
    user_id = read_access_token(access_token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None or user.status == "WITHDRAWN":
        raise unauthenticated()
    return user


def _inquiry_out(db: Session, inquiry: Inquiry) -> InquiryOut:
    photos = [InquiryPhoto(id=f.id, url=file_url(f)) for f in service.inquiry_photos(db, inquiry)]
    return InquiryOut(
        id=inquiry.id, category=inquiry.category, title=inquiry.title, status=inquiry.status,
        created_at=inquiry.created_at, performance_id=inquiry.performance_id, body=inquiry.body,
        answer=inquiry.answer, answered_at=inquiry.answered_at, updated_at=inquiry.updated_at, photos=photos,
    )


@inquiry_router.post("/inquiries", response_model=InquiryOut, status_code=status.HTTP_201_CREATED)
def create_inquiry(
    body: InquiryIn, user: User = Depends(inquiry_member), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> InquiryOut:
    """AC-F5-18: 정지 계정도 문의할 수 있다. 상태는 답변 대기."""
    return _inquiry_out(db, service.create_inquiry(db, user, body, now=now))


@inquiry_router.get("/me/inquiries", response_model=list[InquiryItem])
def list_my_inquiries(user: User = Depends(inquiry_member), db: Session = Depends(get_db)) -> list[InquiryItem]:
    return [InquiryItem.model_validate(i) for i in service.list_my_inquiries(db, user)]


@inquiry_router.get("/inquiries/{inquiry_id}", response_model=InquiryOut)
def get_inquiry(inquiry_id: int, user: User = Depends(inquiry_member), db: Session = Depends(get_db)) -> InquiryOut:
    """AC-F5-20: 남의 문의는 404."""
    return _inquiry_out(db, service.get_inquiry(db, user, inquiry_id))


@inquiry_router.put("/inquiries/{inquiry_id}", response_model=InquiryOut)
def update_inquiry(
    inquiry_id: int, body: InquiryIn, user: User = Depends(inquiry_member), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> InquiryOut:
    """AC-F5-19: 답변 대기일 때만. 답변 완료면 409 INVALID_STATE."""
    return _inquiry_out(db, service.update_inquiry(db, user, inquiry_id, body, now=now))


@inquiry_router.delete("/inquiries/{inquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inquiry(inquiry_id: int, user: User = Depends(inquiry_member), db: Session = Depends(get_db)) -> Response:
    """AC-F5-19: 답변 대기일 때만. 답변 완료면 409 INVALID_STATE."""
    service.delete_inquiry(db, user, inquiry_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
