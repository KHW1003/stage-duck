"""업체 찾기 API (api-contract.md 5장 /pr-posts, #30). 목록·상세는 방문자도, 작성은 업체(S)만."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.board import service
from app.board.schemas import PrCategory, PrPostIn, PrPostListOut, PrPostOut, PrPostSavedOut
from app.core.db import get_db
from app.models.user import User

router = APIRouter(prefix="/pr-posts", tags=["board"])


def get_now() -> datetime:
    """지금 시각 (KST 서버 시각). 테스트에서 dependency_overrides 로 고정할 수 있다."""
    return datetime.now()


@router.get("", response_model=PrPostListOut)
def list_posts(
    category: PrCategory | None = None,
    sido: str | None = Query(default=None, max_length=20),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> PrPostListOut:
    """AC-F4-04·09: 로그인 없이 목록. category 생략 = [전체]."""
    return service.list_posts(db, category=category, sido=sido or None, page=page, size=size)


@router.get("/{post_id}", response_model=PrPostOut)
def get_post(post_id: int, db: Session = Depends(get_db)) -> PrPostOut:
    """AC-F4-04: 로그인 없이 상세."""
    return service.get_post(db, post_id)


@router.post("", response_model=PrPostSavedOut, status_code=status.HTTP_201_CREATED)
def create_post(
    body: PrPostIn,
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> PrPostSavedOut:
    """AC-F4-01·02·03: 승인 부문 말머리만, 부문당 활성 글 1개, 연락처 경고."""
    return service.create_post(db, user, body, now=now)


@router.put("/{post_id}", response_model=PrPostSavedOut)
def update_post(
    post_id: int,
    body: PrPostIn,
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> PrPostSavedOut:
    """AC-F4-10: 본인 글 수정 (블라인드 중 409, 말머리 고정, 남의 글 404). AC-F4-03 연락처 경고."""
    return service.update_post(db, user, post_id, body, now=now)
