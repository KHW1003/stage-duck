"""업체 찾기 서비스 (FR-BOARD-01~03, #30). 화면 이름은 "업체 찾기"·"소개 글", 코드·DB 는 pr_posts."""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.board.schemas import PhotoOut, PrPostIn, PrPostItemOut, PrPostListOut, PrPostOut
from app.core.errors import AppError, not_found
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

    covers = {f.id: f for f in _photos(db, [p.photos[0] for p in posts if p.photos])}
    items = [
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
    return PrPostListOut(items=items, page=page, size=size, total=total)


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


def create_post(db: Session, user: User, body: PrPostIn, *, now: datetime) -> PrPostOut:
    """AC-F4-01: 승인된 업체가 자기 승인 부문 말머리로만 쓴다.
    AC-F4-02: 부문당 활성 글 1개 (가린 글이 있어도 새 글 불가, AC-F4-10).
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
    return _out(db, post)
