"""커뮤니티 API (api-contract.md 7장 /free-posts). 목록·글 보기는 방문자도, 쓰기는 사용자·업체."""
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.auth.tokens import read_access_token
from app.community import service
from app.community.schemas import (
    AuthorOut,
    CommentEditIn,
    CommentIn,
    CommentOut,
    CommentSavedOut,
    FreePostIn,
    FreePostOut,
    FreePostPageOut,
    FreePostSavedOut,
    FreePostSummaryOut,
    HelpfulIn,
    HelpfulOut,
)
from app.core.db import get_db
from app.models.community import FreeComment, FreePost
from app.models.user import User

router = APIRouter(prefix="/free-posts", tags=["community"])
extra_router = APIRouter(tags=["community"])  # /free-comments · /free-helpfuls · /me/free-bookmarks
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
        id=post.id, category=post.category, title=post.title, author=AuthorOut.model_validate(author),
        view_count=post.view_count, comment_count=post.comment_count, helpful_count=post.helpful_count,
        has_photos=bool(post.photos), created_at=post.created_at,
    )


def _full(db: Session, post: FreePost, me: User | None, prev_id: int | None, next_id: int | None) -> dict:
    author = service.authors(db, [post])[post.author_user_id]
    return dict(
        **_summary(post, author), body=post.body, photo_ids=post.photos, status=post.status,
        blind_reason=post.blind_reason, prev_id=prev_id, next_id=next_id,
        # 이전·다음 글 제목 (화면이 "다음 글 보기" 대신 제목을 보여 준다, 11/23 디자인 검수)
        prev_title=db.get(FreePost, prev_id).title if prev_id else None,
        next_title=db.get(FreePost, next_id).title if next_id else None,
        is_mine=me is not None and me.id == post.author_user_id, updated_at=post.updated_at,
    )


def _comment(c: FreeComment, post: FreePost, me: User | None, names: dict, liked: set[int], replies: list | None = None) -> CommentOut:
    mine = me is not None and me.id == c.author_user_id
    show = c.status == "ACTIVE" or (c.status == "BLINDED" and mine)
    author = names[c.author_user_id]
    return CommentOut(
        id=c.id, author=AuthorOut.model_validate(author), body=c.body if show else None, status=c.status,
        blind_reason=c.blind_reason if mine else None, is_post_author=c.author_user_id == post.author_user_id,
        is_mine=mine, helpful_count=c.helpful_count, my_helpful=c.id in liked, created_at=c.created_at,
        edited_at=c.edited_at,
        replies=replies or [],
    )


def _with_comments(db: Session, post: FreePost, me: User | None, out: dict) -> dict:
    views = service.comments_for(db, post.id)
    all_comments = [v.comment for v in views] + [r.comment for v in views for r in v.replies]
    names = service.authors(db, all_comments) if all_comments else {}
    liked = service.my_helpfuls(db, me, "COMMENT", [c.id for c in all_comments])
    out["comments"] = [
        _comment(v.comment, post, me, names, liked, [_comment(r.comment, post, me, names, liked) for r in v.replies])
        for v in views
    ]
    out["my_helpful"] = post.id in service.my_helpfuls(db, me, "POST", [post.id])
    out["bookmarked"] = service.is_bookmarked(db, me, post.id)
    return out


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
    return FreePostOut(**_with_comments(db, post, me, _full(db, post, me, prev_id, next_id)))


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


# ---- 댓글·도움 돼요·저장 (T2-08 #101) ----------------------------------------------------------


@router.post("/{post_id}/comments", response_model=CommentSavedOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    post_id: int, body: CommentIn, user: User = Depends(writer), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> CommentSavedOut:
    """AC-F4-14: 댓글·답글 (답글의 답글 400). 10초에 1개, 연락처 모양은 경고만."""
    comment, warn = service.add_comment(db, user, post_id, body.body, body.parent_id, now=now)
    post = db.get(FreePost, post_id)
    out = _comment(comment, post, user, service.authors(db, [comment]), set())
    return CommentSavedOut(**out.model_dump(), contact_warning=warn)


@router.put("/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
def bookmark(post_id: int, user: User = Depends(writer), db: Session = Depends(get_db)) -> Response:
    """AC-F4-17: 저장 (이미 저장했으면 그대로)."""
    service.set_bookmark(db, user, post_id, on=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
def unbookmark(post_id: int, user: User = Depends(writer), db: Session = Depends(get_db)) -> Response:
    """AC-F4-17: 저장 취소."""
    service.set_bookmark(db, user, post_id, on=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@extra_router.put("/free-comments/{comment_id}", response_model=CommentSavedOut)
def update_comment(
    comment_id: int, body: CommentEditIn, user: User = Depends(writer), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> CommentSavedOut:
    """FR-COMM-03: 본인 댓글·답글 고치기 (남의 댓글 404, 처리 전 신고가 있으면 409). 연락처 모양은 경고만."""
    comment, warn = service.update_comment(db, user, comment_id, body.body, now=now)
    post = db.get(FreePost, comment.post_id)
    liked = service.my_helpfuls(db, user, "COMMENT", [comment.id])
    out = _comment(comment, post, user, service.authors(db, [comment]), liked)
    return CommentSavedOut(**out.model_dump(), contact_warning=warn)


@extra_router.delete("/free-comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: int, user: User = Depends(writer), db: Session = Depends(get_db)) -> Response:
    """본인 댓글 삭제 → "삭제된 댓글이에요" (남의 댓글 404)."""
    service.delete_comment(db, user, comment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@extra_router.put("/free-helpfuls", response_model=HelpfulOut)
def helpful(body: HelpfulIn, user: User = Depends(writer), db: Session = Depends(get_db)) -> HelpfulOut:
    """AC-F4-17: 도움 돼요 (한 사람 한 번)."""
    return HelpfulOut(helpful_count=service.set_helpful(db, user, body.target_type, body.target_id, on=True))


@extra_router.delete("/free-helpfuls", response_model=HelpfulOut)
def unhelpful(body: HelpfulIn, user: User = Depends(writer), db: Session = Depends(get_db)) -> HelpfulOut:
    """AC-F4-17: 도움 돼요 취소."""
    return HelpfulOut(helpful_count=service.set_helpful(db, user, body.target_type, body.target_id, on=False))


@extra_router.get("/me/free-bookmarks", response_model=FreePostPageOut)
def my_bookmarks(user: User = Depends(writer), db: Session = Depends(get_db)) -> FreePostPageOut:
    """AC-F4-17: 내 저장 글 (최근 저장 먼저)."""
    posts = service.list_bookmarks(db, user)
    names = service.authors(db, posts) if posts else {}
    return FreePostPageOut(
        items=[FreePostSummaryOut(**_summary(p, names[p.author_user_id])) for p in posts],
        total=len(posts), page=1, page_size=max(len(posts), 1),
    )
