"""커뮤니티 글 (T2-07 #100, FR-COMM-01·04, D-47) — 2번 묶음(해원)으로 옮겨 옴.

- 목록·글 보기는 방문자도 (AC-F4-12). 블라인드 글·정지 회원 글은 숨긴다 (pr_posts 와 같은 방식, 상태는 안 바꿈).
- 글쓰기는 사용자·업체, 1분에 1개 (AC-F4-16). 연락처·계좌 모양은 저장하고 경고만.
- 사진은 1번 `files.service.attach_files` 로 붙인다 (내 TEMP 파일·용도·개수 검사는 그 함수가 한다).
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.chat.calc import has_contact_pattern
from app.community import calc
from app.community.schemas import FreePostIn
from app.core.errors import AppError, not_found
from app.files.service import attach_files
from app.models.community import FreePost
from app.models.supplier import Supplier
from app.models.user import User

PAGE_SIZE = 20
RATE_LIMIT = timedelta(minutes=1)  # AC-F4-16
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


def authors(db: Session, posts: list[FreePost]) -> dict[int, Author]:
    """작성자 표시 이름: 업체 회원은 상호 (AC-F4-14 "업체 D · 업체"), 사용자는 닉네임."""
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
