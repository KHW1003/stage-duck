"""업체 찾기 API (api-contract.md 5장 /pr-posts, #30). 목록·상세는 방문자도, 작성은 업체(S)만."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.board import service
from app.board.schemas import MyPrPostListOut, PrCategory, PrPostIn, PrPostListOut, PrPostOut, PrPostSavedOut
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


@router.get("/mine", response_model=MyPrPostListOut)
def my_posts(
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> MyPrPostListOut:
    """FR-BOARD-02·03: 내 소개 글 (가려진 글·사유 포함, 내린 글 제외). /{post_id} 보다 먼저 둔다."""
    return service.my_posts(db, user, now=now)


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


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
) -> Response:
    """FR-BOARD-02: [글 내리기] (남의 글·내린 글 404, 가려진 글 409, 정지 계정 403)."""
    service.delete_post(db, user, post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{post_id}/bump", response_model=PrPostOut)
def bump_post(
    post_id: int,
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> PrPostOut:
    """FR-BOARD-03: 끌어올리기 7일에 1회 (429 BUMP_TOO_SOON). 남의 글·내린 글 404, 가려진 글 409, 정지 계정 403."""
    return service.bump_post(db, user, post_id, now=now)
