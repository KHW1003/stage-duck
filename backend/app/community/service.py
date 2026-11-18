"""커뮤니티 글 (T2-07 #100, FR-COMM-01·04, D-47) — 2번 묶음(해원)으로 옮겨 옴.

- 목록·글 보기는 방문자도 (AC-F4-12). 블라인드 글·정지 회원 글은 숨긴다 (pr_posts 와 같은 방식, 상태는 안 바꿈).
- 글쓰기는 사용자·업체, 1분에 1개 (AC-F4-16). 연락처·계좌 모양은 저장하고 경고만.
- 사진은 1번 `files.service.attach_files` 로 붙인다 (내 TEMP 파일·용도·개수 검사는 그 함수가 한다).
- 댓글·답글·도움 돼요·저장·블라인드는 T2-08(#101). 블라인드하면 작성자에게 경고 1회 (4번 `policy.service.warn`, 3회면 정지).
- 댓글 알림(내 글에 댓글, 내 댓글에 답글)은 3번 `notify()`(#45)가 생기면 `add_comment` 에서 부른다.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.chat.calc import has_contact_pattern
from app.community import calc
from app.community.schemas import FreePostIn
from app.core.errors import AppError, invalid_state, not_found
from app.files.service import attach_files
from app.models.community import COMMENT_MAX, FreeBookmark, FreeComment, FreeHelpful, FreePost
from app.models.supplier import Supplier
from app.models.user import User
from app.policy.service import warn

PAGE_SIZE = 20
RATE_LIMIT = timedelta(minutes=1)  # AC-F4-16
COMMENT_RATE_LIMIT = timedelta(seconds=10)  # FR-COMM-04 댓글은 10초에 1개
SORTS = {"latest": FreePost.created_at.desc(), "comments": FreePost.comment_count.desc(), "views": FreePost.view_count.desc()}


@dataclass(frozen=True)
class Author:
    name: str
    kind: str  # USER · SUPPLIER


def _visible():
    """다른 사람에게 보이는 글: 활성 + 작성자가 정지되지 않음."""
    return (FreePost.status == "ACTIVE", User.status != "SUSPENDED")


def _base():
    return select(FreePost).join(User, User.id == FreePost.author_user_id)


def authors(db: Session, posts: list[FreePost] | list[FreeComment]) -> dict[int, Author]:
    """작성자 표시 이름: 업체 회원은 상호 (AC-F4-14 "업체 D · 업체"), 사용자는 닉네임. 글·댓글 모두."""
    users = {p.author_user_id: p.author for p in posts}
    supplier_ids = [uid for uid, u in users.items() if u.role == "SUPPLIER"]
    companies = dict(
        db.execute(select(Supplier.user_id, Supplier.company_name).where(Supplier.user_id.in_(supplier_ids))).all()
    ) if supplier_ids else {}
    return {
        uid: Author(companies[uid], "SUPPLIER") if uid in companies else Author(u.nickname or "회원", "USER")
        for uid, u in users.items()
    }


def list_posts(
    db: Session, *, category: str | None, sort: str, field: str, q: str | None, page: int
) -> tuple[list[FreePost], int]:
    """AC-F4-12·13: 말머리·정렬·검색, 20개씩. (글 목록, 전체 수)"""
    stmt = _base().where(*_visible())
    if category:
        stmt = stmt.where(FreePost.category == category)
    if q:
        title, body = FreePost.title.contains(q, autoescape=True), FreePost.body.contains(q, autoescape=True)
        if field == "title":
            stmt = stmt.where(title)
        elif field == "author":
            company = select(Supplier.user_id).where(Supplier.company_name.contains(q, autoescape=True))
            stmt = stmt.where(or_(User.nickname.contains(q, autoescape=True), FreePost.author_user_id.in_(company)))
        else:
            stmt = stmt.where(or_(title, body))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(
        stmt.order_by(SORTS.get(sort, SORTS["latest"]), FreePost.id.desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    ).all()
    return list(rows), total


def get_post(db: Session, viewer: User | None, post_id: int) -> tuple[FreePost, int | None, int | None]:
    """글 보기 + 조회수 +1. 블라인드 글은 작성자만(사유 포함), 삭제·정지 회원 글과 남의 블라인드 글은 404.

    돌려주는 값: (글, 이전 글 id, 다음 글 id) — 이전 = 더 오래된 글.
    """
    post = db.get(FreePost, post_id)
    mine = post is not None and viewer is not None and post.author_user_id == viewer.id
    if post is None or post.status == "DELETED" or (not mine and (post.status != "ACTIVE" or post.author.status == "SUSPENDED")):
        raise not_found()
    post.view_count += 1
    db.commit()
    db.refresh(post)
    older = _base().where(*_visible(), FreePost.id < post.id).subquery()
    newer = _base().where(*_visible(), FreePost.id > post.id).subquery()
    prev_id = db.scalar(select(func.max(older.c.id)))
    next_id = db.scalar(select(func.min(newer.c.id)))
    return post, prev_id, next_id


def _checked(body: FreePostIn) -> None:
    errors = calc.post_field_errors(body.category, body.title, body.body)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)


def create_post(db: Session, user: User, body: FreePostIn, *, now: datetime) -> tuple[FreePost, bool]:
    """AC-F4-16: 1분 안에 두 번째 글은 403 POSTING_RATE_LIMITED. (글, 연락처 경고)"""
    _checked(body)
    last = db.scalar(select(func.max(FreePost.created_at)).where(FreePost.author_user_id == user.id))
    if last is not None and last > now - RATE_LIMIT:
        raise AppError(403, "POSTING_RATE_LIMITED", "글은 1분에 하나씩 쓸 수 있어요. 잠시 뒤 다시 올려 주세요.")
    attach_files(db, owner_id=user.id, file_ids=body.file_ids, purpose="COMMUNITY", now=now)
    post = FreePost(
        author_user_id=user.id, category=body.category, title=body.title, body=body.body, photos=body.file_ids,
        status="ACTIVE", created_at=now, updated_at=now,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post, has_contact_pattern(f"{body.title}\n{body.body}")


def _mine(db: Session, user: User, post_id: int) -> FreePost:
    post = db.scalar(select(FreePost).where(FreePost.id == post_id, FreePost.author_user_id == user.id).with_for_update())
    if post is None or post.status != "ACTIVE":
        raise not_found()
    return post


def update_post(db: Session, user: User, post_id: int, body: FreePostIn, *, now: datetime) -> tuple[FreePost, bool]:
    """본인 글 수정 (활성 글만). 새로 더한 사진만 붙인다."""
    post = _mine(db, user, post_id)
    _checked(body)
    added = [i for i in body.file_ids if i not in post.photos]
    attach_files(db, owner_id=user.id, file_ids=added, purpose="COMMUNITY", now=now)
    post.category, post.title, post.body, post.photos = body.category, body.title, body.body, body.file_ids
    db.commit()
    db.refresh(post)
    return post, has_contact_pattern(f"{body.title}\n{body.body}")


def delete_post(db: Session, user: User, post_id: int) -> None:
    """본인 글 삭제 → DELETED 로 남긴다 (data-model.md: 댓글 있는 글 삭제는 DELETED)."""
    post = _mine(db, user, post_id)
    post.status = "DELETED"
    db.commit()


# ---------------------------------------------------------------------------
# 댓글·답글 (T2-08 #101, AC-F4-14, FR-COMM-03)
# ---------------------------------------------------------------------------


@dataclass
class CommentView:
    comment: FreeComment
    replies: list["CommentView"]


def _visible_post(db: Session, post_id: int, *, lock: bool = False) -> FreePost:
    """다른 사람에게 보이는 글 (활성 + 작성자 정지 아님). 아니면 404."""
    stmt = _base().where(FreePost.id == post_id, *_visible())
    post = db.scalar(stmt.with_for_update() if lock else stmt)
    if post is None:
        raise not_found()
    return post


def comments_for(db: Session, post_id: int) -> list[CommentView]:
    """글의 댓글 → 답글 (작성 순). 정지 회원의 댓글은 숨긴다 (답글도 함께). 삭제·블라인드는 자리만 남긴다."""
    rows = db.scalars(
        select(FreeComment)
        .join(User, User.id == FreeComment.author_user_id)
        .where(FreeComment.post_id == post_id, User.status != "SUSPENDED")
        .order_by(FreeComment.created_at, FreeComment.id)
    ).all()
    tops = {c.id: CommentView(c, []) for c in rows if c.parent_id is None}
    for c in rows:
        if c.parent_id is not None and c.parent_id in tops:
            tops[c.parent_id].replies.append(CommentView(c, []))
    return list(tops.values())


def my_helpfuls(db: Session, user: User | None, target_type: str, ids: list[int]) -> set[int]:
    if user is None or not ids:
        return set()
    return set(db.scalars(select(FreeHelpful.target_id).where(
        FreeHelpful.user_id == user.id, FreeHelpful.target_type == target_type, FreeHelpful.target_id.in_(ids)
    )))


def is_bookmarked(db: Session, user: User | None, post_id: int) -> bool:
    return user is not None and db.scalar(
        select(FreeBookmark.id).where(FreeBookmark.user_id == user.id, FreeBookmark.post_id == post_id)
    ) is not None


def add_comment(db: Session, user: User, post_id: int, body: str, parent_id: int | None, *, now: datetime) -> tuple[FreeComment, bool]:
    """AC-F4-14: 댓글·답글 (500자, 10초에 1개). 답글의 답글은 400 VALIDATION_FAILED (field parentId). (댓글, 연락처 경고)"""
    post = _visible_post(db, post_id, lock=True)
    if not body:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": "body", "reason": "댓글을 적어 주세요."}])
    if len(body) > COMMENT_MAX:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": "body", "reason": f"댓글은 {COMMENT_MAX}자까지 적을 수 있어요."}])
    if parent_id is not None:
        parent = db.get(FreeComment, parent_id)
        if parent is None or parent.post_id != post.id:
            raise not_found()
        if parent.parent_id is not None:
            raise AppError(400, "VALIDATION_FAILED", "답글에는 답글을 달 수 없어요.", [{"field": "parentId", "reason": "답글에는 답글을 달 수 없어요."}])
    last = db.scalar(select(func.max(FreeComment.created_at)).where(FreeComment.author_user_id == user.id))
    if last is not None and last > now - COMMENT_RATE_LIMIT:
        raise AppError(403, "POSTING_RATE_LIMITED", "댓글은 10초에 하나씩 쓸 수 있어요. 잠시 뒤 다시 올려 주세요.")
    comment = FreeComment(post_id=post.id, parent_id=parent_id, author_user_id=user.id, body=body, status="ACTIVE", created_at=now)
    db.add(comment)
    post.comment_count += 1
    db.commit()
    db.refresh(comment)
    return comment, has_contact_pattern(body)


def delete_comment(db: Session, user: User, comment_id: int) -> None:
    """작성자만 (남의 댓글 404). DELETED 로 남겨 "삭제된 댓글이에요" — 답글은 그대로 (FR-COMM-03)."""
    comment = db.scalar(select(FreeComment).where(FreeComment.id == comment_id, FreeComment.author_user_id == user.id).with_for_update())
    if comment is None or comment.status != "ACTIVE":
        raise not_found()
    comment.status = "DELETED"
    db.commit()


# ---------------------------------------------------------------------------
# 도움 돼요·저장 (AC-F4-17, FR-COMM-02)
# ---------------------------------------------------------------------------


def _helpful_target(db: Session, target_type: str, target_id: int) -> FreePost | FreeComment:
    """도움 돼요를 누를 수 있는 대상 (보이는 글, 그 글의 활성 댓글). 잠가서 수를 맞춘다. 아니면 404."""
    if target_type == "POST":
        return _visible_post(db, target_id, lock=True)
    comment = db.scalar(select(FreeComment).where(FreeComment.id == target_id, FreeComment.status == "ACTIVE").with_for_update())
    if comment is None:
        raise not_found()
    _visible_post(db, comment.post_id)
    return comment


def set_helpful(db: Session, user: User, target_type: str, target_id: int, *, on: bool) -> int:
    """AC-F4-17: 한 사람 한 번 (UNIQUE). on=True 누르기, False 취소. 이미 그 상태면 그대로. 돌려주는 값 = 지금 도움 돼요 수."""
    target = _helpful_target(db, target_type, target_id)
    key = (FreeHelpful.user_id == user.id, FreeHelpful.target_type == target_type, FreeHelpful.target_id == target_id)
    exists = db.scalar(select(FreeHelpful.id).where(*key)) is not None
    if on and not exists:
        db.add(FreeHelpful(user_id=user.id, target_type=target_type, target_id=target_id))
        target.helpful_count += 1
    elif not on and exists:
        db.execute(delete(FreeHelpful).where(*key))
        target.helpful_count -= 1
    try:
        db.commit()
    except IntegrityError:  # 같은 사람이 동시에 두 번 → 한 번만
        db.rollback()
    db.refresh(target)
    return target.helpful_count


def set_bookmark(db: Session, user: User, post_id: int, *, on: bool) -> None:
    """AC-F4-17: 저장 / 저장 취소. 이미 그 상태면 그대로."""
    _visible_post(db, post_id)
    key = (FreeBookmark.user_id == user.id, FreeBookmark.post_id == post_id)
    exists = db.scalar(select(FreeBookmark.id).where(*key)) is not None
    if on and not exists:
        db.add(FreeBookmark(user_id=user.id, post_id=post_id))
    elif not on and exists:
        db.execute(delete(FreeBookmark).where(*key))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def list_bookmarks(db: Session, user: User) -> list[FreePost]:
    """내 저장 글 (최근 저장 먼저). 지금 볼 수 없는 글은 빼고."""
    return list(db.scalars(
        _base().join(FreeBookmark, FreeBookmark.post_id == FreePost.id)
        .where(FreeBookmark.user_id == user.id, *_visible())
        .order_by(FreeBookmark.created_at.desc(), FreeBookmark.id.desc())
    ))


# ---------------------------------------------------------------------------
# 블라인드 (관리자, AC-F4-15, FR-COMM-04) — SQLAdmin 액션이 부른다
# ---------------------------------------------------------------------------


def _require_reason(reason: str | None) -> str:
    reason = (reason or "").strip()
    if not reason:
        raise AppError(400, "VALIDATION_FAILED", "사유를 적어 주세요.", [{"field": "reason", "reason": "사유를 적어 주세요."}])
    return reason


def blind_post(db: Session, post_id: int, *, actor_id: int | None, reason: str | None) -> None:
    """커뮤니티 글 블라인드 + 작성자 경고 1회 (3회면 정지). 작성자에게만 사유와 함께 보인다."""
    reason = _require_reason(reason)
    post = db.get(FreePost, post_id, with_for_update=True)
    if post is None:
        raise not_found()
    if post.status != "ACTIVE":
        raise invalid_state("활성 글만 블라인드할 수 있어요.")
    post.status, post.blind_reason = "BLINDED", reason
    warn(db, post.author_user_id, actor_id=actor_id, reason=f"커뮤니티 글 블라인드: {reason}")  # 같은 세션 — 함께 커밋


def blind_comment(db: Session, comment_id: int, *, actor_id: int | None, reason: str | None) -> None:
    """AC-F4-15: 커뮤니티 댓글 블라인드 + 작성자 경고 1회. 다른 사람에게는 보이지 않는다."""
    reason = _require_reason(reason)
    comment = db.get(FreeComment, comment_id, with_for_update=True)
    if comment is None:
        raise not_found()
    if comment.status != "ACTIVE":
        raise invalid_state("활성 댓글만 블라인드할 수 있어요.")
    comment.status, comment.blind_reason = "BLINDED", reason
    warn(db, comment.author_user_id, actor_id=actor_id, reason=f"커뮤니티 댓글 블라인드: {reason}")
