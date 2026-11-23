"""업체 찾기 서비스 (FR-BOARD-01~03, #30). 화면 이름은 "업체 찾기"·"소개 글", 코드·DB 는 pr_posts."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.board.calc import can_bump, has_contact_or_link, next_bump_at
from app.board.schemas import (
    MyPrPostListOut,
    MyPrPostOut,
    PhotoOut,
    PrPostIn,
    PrPostItemOut,
    PrPostListOut,
    PrPostOut,
    PrPostSavedOut,
)
from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.files import service as files
from app.models.board import PrPost
from app.models.file import StoredFile
from app.models.supplier import Supplier
from app.models.user import User

# 새 글을 막는 상태: 활성 글, 관리자가 가린 글 (FR-BOARD-03, data-model.md active_guard 와 같은 범위)
_BLOCKING = ("ACTIVE", "BLINDED")


def _visible():
    """방문자에게 보이는 글: 활성 글이고 정지 업체가 아닌 것 (AC-F4-04, data-model.md pr_posts)."""
    return (PrPost.status == "ACTIVE", Supplier.review_status != "SUSPENDED")


def _photos(db: Session, file_ids: list[int]) -> list[StoredFile]:
    if not file_ids:
        return []
    found = {f.id: f for f in db.scalars(select(StoredFile).where(StoredFile.id.in_(file_ids)))}
    return [found[i] for i in file_ids if i in found and found[i].status == "ATTACHED"]


def _out(db: Session, post: PrPost) -> PrPostOut:
    return PrPostOut(
        id=post.id,
        category=post.category,
        title=post.title,
        body=post.body,
        photos=[PhotoOut(id=f.id, url=files.file_url(f), thumb_url=files.thumb_url(f)) for f in _photos(db, post.photos)],
        supplier_id=post.supplier_id,
        company_name=post.supplier.company_name,
        sido=post.sido,
        price_range=post.price_range,
        bumped_at=post.bumped_at,
        created_at=post.created_at,
    )


def _items(db: Session, posts) -> list[PrPostItemOut]:
    covers = {f.id: f for f in _photos(db, [p.photos[0] for p in posts if p.photos])}
    return [
        PrPostItemOut(
            id=p.id,
            category=p.category,
            title=p.title,
            supplier_id=p.supplier_id,
            company_name=p.supplier.company_name,
            sido=p.sido,
            price_range=p.price_range,
            thumb_url=files.thumb_url(covers[p.photos[0]]) if p.photos and p.photos[0] in covers else None,
            bumped_at=p.bumped_at,
        )
        for p in posts
    ]


def list_posts(db: Session, *, category: str | None, sido: str | None, page: int, size: int) -> PrPostListOut:
    """AC-F4-04·09: 로그인 없이 보는 목록. category 생략 = [전체]. 최신순(끌어올린 시각)."""
    conds = [*_visible()]
    if category:
        conds.append(PrPost.category == category)
    if sido:
        conds.append(PrPost.sido == sido)
    base = select(PrPost).join(Supplier, PrPost.supplier_id == Supplier.id).where(*conds)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    posts = db.scalars(base.order_by(PrPost.bumped_at.desc(), PrPost.id.desc()).offset((page - 1) * size).limit(size)).all()
    return PrPostListOut(items=_items(db, posts), page=page, size=size, total=total)


def supplier_posts(db: Session, supplier_id: int) -> list[PrPostItemOut]:
    """AC-F5-15: 업체 프로필의 소개 글 목록. 방문자에게 보이는 글만, 최신순 (부문당 활성 1개라 많아야 3개)."""
    posts = db.scalars(
        select(PrPost).join(Supplier, PrPost.supplier_id == Supplier.id)
        .where(PrPost.supplier_id == supplier_id, *_visible())
        .order_by(PrPost.bumped_at.desc(), PrPost.id.desc())
    ).all()
    return _items(db, posts)


_CATEGORY_ORDER = {"VENUE": 0, "EQUIPMENT": 1, "ENGINEER": 2}  # 배정 순서 (CLAUDE.md 4)


def my_posts(db: Session, user: User, *, now: datetime) -> MyPrPostListOut:
    """FR-BOARD-02·03: 내 소개 글 화면용. 내린 글은 빼고, 가려진 글은 사유와 함께 본인에게만 준다 (공개 목록·상세에는 없음).

    정지된 업체도 자기 글은 본다 (고치기·내리기·끌어올리기는 403). 업체 정보가 없으면 빈 목록.
    """
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    if supplier is None:
        return MyPrPostListOut(items=[])
    posts = db.scalars(select(PrPost).where(PrPost.supplier_id == supplier.id, PrPost.status != "DELETED")).all()
    posts = sorted(posts, key=lambda p: (_CATEGORY_ORDER.get(p.category, 9), p.id))
    return MyPrPostListOut(
        items=[
            MyPrPostOut(
                **_out(db, p).model_dump(),
                status=p.status,
                blind_reason=p.blind_reason,
                can_bump=can_bump(p.bumped_at, now),
                next_bump_at=next_bump_at(p.bumped_at),
            )
            for p in posts
        ]
    )


def get_post(db: Session, post_id: int) -> PrPostOut:
    """AC-F4-04: 방문자도 상세를 본다. 보이지 않는 글(내린·가린·지운 글, 정지 업체 글)은 404."""
    post = db.scalar(
        select(PrPost).join(Supplier, PrPost.supplier_id == Supplier.id).where(PrPost.id == post_id, *_visible())
    )
    if post is None:
        raise not_found()
    return _out(db, post)


def public_post_stamps(db: Session) -> list[tuple[int, datetime]]:
    """sitemap.xml 용 (id, 수정 시각). 방문자에게 보이는 글만 (specs/seo.md 5장)."""
    return [tuple(r) for r in db.execute(
        select(PrPost.id, PrPost.updated_at).join(Supplier, PrPost.supplier_id == Supplier.id).where(*_visible())
        .order_by(PrPost.id)
    ).all()]


def _raise_if_blocked(db: Session, supplier_id: int, category: str) -> None:
    """AC-F4-02·10: 그 부문에 활성 글이 있으면 ACTIVE_POST_EXISTS, 가린 글이 있으면 BLINDED_POST_EXISTS."""
    existing = db.scalar(
        select(PrPost.status).where(
            PrPost.supplier_id == supplier_id, PrPost.category == category, PrPost.status.in_(_BLOCKING)
        )
    )
    if existing == "BLINDED":
        raise AppError(409, "BLINDED_POST_EXISTS", "가려진 글이 있어서 이 부문에는 새 글을 쓸 수 없어요. 고객센터로 문의해 주세요.")
    if existing == "ACTIVE":
        raise AppError(409, "ACTIVE_POST_EXISTS", "이 부문에는 이미 올린 소개 글이 있어요. 올린 글을 고쳐 주세요.")


def _saved(db: Session, post: PrPost) -> PrPostSavedOut:
    """AC-F4-03: 저장한 글 + 연락처·계좌·외부 링크 경고."""
    return PrPostSavedOut(**_out(db, post).model_dump(), contact_warning=has_contact_or_link(post.title, post.body))


def create_post(db: Session, user: User, body: PrPostIn, *, now: datetime) -> PrPostSavedOut:
    """AC-F4-01: 승인된 업체가 자기 승인 부문 말머리로만 쓴다.
    AC-F4-02: 부문당 활성 글 1개 (가린 글이 있어도 새 글 불가, AC-F4-10).
    AC-F4-03: 연락처·계좌·외부 링크가 있으면 경고만 한다.
    """
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id).with_for_update())
    if supplier is None or supplier.review_status in ("PENDING", "REJECTED"):
        raise AppError(403, "SUPPLIER_NOT_APPROVED", "입점 심사가 끝난 뒤에 소개 글을 쓸 수 있어요.")
    if supplier.review_status == "SUSPENDED":
        raise AppError(403, "ACCOUNT_SUSPENDED", "정지된 계정은 소개 글을 쓸 수 없어요. 고객센터로 문의해 주세요.")
    if body.category not in {c.category for c in supplier.categories}:
        raise AppError(
            403,
            "CATEGORY_NOT_APPROVED",
            "승인받은 부문의 말머리만 고를 수 있어요.",
            [{"field": "category", "reason": "승인받지 않은 부문이에요."}],
        )

    _raise_if_blocked(db, supplier.id, body.category)

    attached = files.attach_files(db, owner_id=user.id, file_ids=body.file_ids, purpose="PR_POST", now=now)
    post = PrPost(
        supplier_id=supplier.id,
        category=body.category,
        title=body.title,
        body=body.body,
        photos=[f.id for f in attached],
        sido=body.sido,
        price_range=body.price_range or None,
        status="ACTIVE",
        bumped_at=now,
    )
    db.add(post)
    try:
        db.commit()
    except IntegrityError:  # 같은 부문에 동시에 두 번 — active_guard 가 하나만 남긴다 (AC-F4-02)
        db.rollback()
        _raise_if_blocked(db, supplier.id, body.category)
        raise
    db.refresh(post)
    return _saved(db, post)


def update_post(db: Session, user: User, post_id: int, body: PrPostIn, *, now: datetime) -> PrPostSavedOut:
    """AC-F4-10: 본인 글을 고친다. 블라인드 중에는 고칠 수 없고, 관리자가 풀면(ACTIVE) 고쳐서 다시 보인다.

    말머리(부문)는 바꿀 수 없다 (#31). 남의 글·지운 글은 404 (CLAUDE.md 10).
    사진: fileIds 는 보여 줄 순서 그대로. 이미 붙은 사진은 그대로 두고 새 TEMP 파일만 붙인다.
    AC-F4-03: 연락처·계좌·외부 링크가 있으면 경고만 한다.
    """
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    post = db.scalar(select(PrPost).where(PrPost.id == post_id).with_for_update())
    if supplier is None or post is None or post.supplier_id != supplier.id or post.status == "DELETED":
        raise not_found()
    if supplier.review_status == "SUSPENDED":
        raise AppError(403, "ACCOUNT_SUSPENDED", "정지된 계정은 소개 글을 고칠 수 없어요. 고객센터로 문의해 주세요.")
    if post.status != "ACTIVE":
        raise invalid_state("가려진 글은 고칠 수 없어요. 블라인드가 풀린 뒤에 고쳐 주세요.")
    if body.category != post.category:
        raise AppError(
            400,
            "VALIDATION_FAILED",
            "말머리는 바꿀 수 없어요.",
            [{"field": "category", "reason": "말머리는 바꿀 수 없어요. 다른 부문은 새 글로 써 주세요."}],
        )

    kept = set(post.photos)
    files.attach_files(
        db, owner_id=user.id, file_ids=[i for i in body.file_ids if i not in kept], purpose="PR_POST", now=now
    )
    post.title = body.title
    post.body = body.body
    post.sido = body.sido
    post.price_range = body.price_range or None
    post.photos = list(body.file_ids)
    db.commit()
    db.refresh(post)
    return _saved(db, post)


def _own_post(db: Session, user: User, post_id: int, *, action: str) -> PrPost:
    """본인 글을 잠가서 가져온다. 남의 글·없는 글·내린 글은 404, 정지 계정은 403 (update_post 와 같은 규칙)."""
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    post = db.scalar(select(PrPost).where(PrPost.id == post_id).with_for_update())
    if supplier is None or post is None or post.supplier_id != supplier.id or post.status == "DELETED":
        raise not_found()
    if supplier.review_status == "SUSPENDED":
        raise AppError(403, "ACCOUNT_SUSPENDED", f"정지된 계정은 소개 글을 {action} 없어요. 고객센터로 문의해 주세요.")
    return post


def delete_post(db: Session, user: User, post_id: int) -> None:
    """FR-BOARD-02: [글 내리기]. 지우지 않고 DELETED 로 바꿔 그 부문에 새 글을 쓸 수 있게 한다 (active_guard).

    가려진(BLINDED) 글은 내릴 수 없다 — 내리면 "관리자가 풀기 전까지 그 부문 새 글 불가"(FR-BOARD-03)를 피해 가게 된다.
    """
    post = _own_post(db, user, post_id, action="내릴 수")
    if post.status != "ACTIVE":
        raise invalid_state("가려진 글은 내릴 수 없어요. 블라인드가 풀린 뒤에 내려 주세요.")
    record_transition(db, entity_type="pr_post", entity_id=post.id, from_status="ACTIVE", to_status="DELETED",
                      actor_user_id=user.id, reason="업체가 글 내림")
    post.status = "DELETED"
    db.commit()


def bump_post(db: Session, user: User, post_id: int, *, now: datetime) -> PrPostOut:
    """FR-BOARD-03: 끌어올리기 7일에 1회. 목록은 bumped_at 최신순이라 맨 위로 올라간다 (FR-BOARD-01)."""
    post = _own_post(db, user, post_id, action="끌어올릴 수")
    if post.status != "ACTIVE":
        raise invalid_state("가려진 글은 끌어올릴 수 없어요. 블라인드가 풀린 뒤에 해 주세요.")
    if not can_bump(post.bumped_at, now):
        at = next_bump_at(post.bumped_at)
        raise AppError(
            429,
            "BUMP_TOO_SOON",
            f"끌어올리기는 7일에 한 번 할 수 있어요. {at.month}월 {at.day}일 {at:%H:%M}부터 다시 할 수 있어요.",
        )
    post.bumped_at = now
    db.commit()
    db.refresh(post)
    return _out(db, post)
