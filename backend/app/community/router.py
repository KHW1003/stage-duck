"""커뮤니티 API (api-contract.md 7장 /free-posts). 목록·글 보기는 방문자도, 쓰기는 사용자·업체."""
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.auth.tokens import read_access_token
from app.community import service
from app.community.schemas import AuthorOut, FreePostIn, FreePostOut, FreePostPageOut, FreePostSavedOut, FreePostSummaryOut
from app.core.db import get_db
from app.models.community import FreePost
from app.models.user import User

router = APIRouter(prefix="/free-posts", tags=["community"])
writer = require_role("USER", "SUPPLIER")


def get_now() -> datetime:
    """지금 시각 (KST 서버 시각). 테스트에서 dependency_overrides 로 고정한다 (AC-F4-16)."""
    return datetime.now()


def viewer(access_token: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> User | None:
    """로그인했으면 그 회원, 아니면 None (방문자도 읽을 수 있는 화면용). 정지·탈퇴 계정은 방문자로 본다."""
    user_id = read_access_token(access_token)
    user = db.get(User, user_id) if user_id is not None else None
    return user if user is not None and user.status == "ACTIVE" else None


def _summary(post: FreePost, author: service.Author) -> dict:
    return dict(
        id=post.id, category=post.category, title=post.title, author=AuthorOut(name=author.name, kind=author.kind),
        view_count=post.view_count, comment_count=post.comment_count, helpful_count=post.helpful_count,
        has_photos=bool(post.photos), created_at=post.created_at,
    )


def _full(db: Session, post: FreePost, me: User | None, prev_id: int | None, next_id: int | None) -> dict:
    author = service.authors(db, [post])[post.author_user_id]
    return dict(
        **_summary(post, author), body=post.body, photo_ids=post.photos, status=post.status,
        blind_reason=post.blind_reason, prev_id=prev_id, next_id=next_id,
        is_mine=me is not None and me.id == post.author_user_id, updated_at=post.updated_at,
    )


@router.get("", response_model=FreePostPageOut)
def list_posts(
    category: str | None = Query(None),
    sort: str = Query("latest"),
    field: str = Query("all"),
    q: str | None = Query(None, max_length=50),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
) -> FreePostPageOut:
    """AC-F4-12·13: 방문자도 본다. 말머리·정렬(latest·comments·views)·검색(all·title·author), 20개씩."""
    posts, total = service.list_posts(db, category=category, sort=sort, field=field, q=q, page=page)
    names = service.authors(db, posts)
    return FreePostPageOut(
        items=[FreePostSummaryOut(**_summary(p, names[p.author_user_id])) for p in posts],
        total=total, page=page, page_size=service.PAGE_SIZE,
    )


@router.get("/{post_id}", response_model=FreePostOut)
def get_post(post_id: int, me: User | None = Depends(viewer), db: Session = Depends(get_db)) -> FreePostOut:
    """AC-F4-12: 글 보기 (조회수 +1, 이전·다음 글). 블라인드 글은 작성자만."""
    post, prev_id, next_id = service.get_post(db, me, post_id)
    return FreePostOut(**_full(db, post, me, prev_id, next_id))


@router.post("", response_model=FreePostSavedOut, status_code=status.HTTP_201_CREATED)
def create_post(
    body: FreePostIn, user: User = Depends(writer), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> FreePostSavedOut:
    """AC-F4-16: 1분에 1개. 연락처 모양은 경고만."""
    post, warn = service.create_post(db, user, body, now=now)
    return FreePostSavedOut(**_full(db, post, user, None, None), contact_warning=warn)


@router.put("/{post_id}", response_model=FreePostSavedOut)
def update_post(
    post_id: int, body: FreePostIn, user: User = Depends(writer), db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> FreePostSavedOut:
    """본인 글 수정 (남의 글 404)."""
    post, warn = service.update_post(db, user, post_id, body, now=now)
    return FreePostSavedOut(**_full(db, post, user, None, None), contact_warning=warn)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(post_id: int, user: User = Depends(writer), db: Session = Depends(get_db)) -> Response:
    """본인 글 삭제 → DELETED (남의 글 404)."""
    service.delete_post(db, user, post_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
