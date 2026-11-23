"""공연 후기·평점 (specs/reviews.md). 시간·날짜는 인자로 받는다 (CLAUDE.md 6.1).

- 쓰기: 공연 주인 사용자만, 결제한(PAID·SETTLEMENT_SCHEDULED) 공연이 끝난 뒤(공연일 다음 날부터), 확정한 단계마다 한 번.
  → 결제·확정 없이 쓰는 가짜 후기를 막는다.
- 내용 10~500자, 별점 1~5. 연락처(전화·메일·계좌 모양)는 받지 않는다 (CLAUDE.md 20 — 직거래 유도 방지).
- 지우기: 쓴 사람만. 고치기는 없다 (지우고 다시 쓰기).
- 공개: 업체 프로필에 평균·개수·최신순 목록. 쓴 사람은 닉네임만 보인다.
"""
import re
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.models.payment import Order
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.review import Review
from app.models.supplier import Supplier
from app.models.user import User

PAID_ORDER = ("PAID", "SETTLEMENT_SCHEDULED")
PAGE_SIZE = 10
_CONTACT = re.compile(r"01[016789][\s\-.]?\d{3,4}[\s\-.]?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+|\d{10,14}")


def _bad(field: str, reason: str) -> AppError:
    return AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": field, "reason": reason}])


def _paid(db: Session, performance_id: int) -> bool:
    stmt = select(Order.id).where(Order.performance_id == performance_id, Order.status.in_(PAID_ORDER))
    return db.scalar(stmt) is not None


def can_review(db: Session, perf: Performance, today: date) -> bool:
    return perf.show_date < today and _paid(db, perf.id)


def _stages(db: Session, perf: Performance) -> list[tuple[Stage, Supplier]]:
    """확정한 단계와 그 업체 (단계 순서대로)."""
    rows = db.execute(
        select(Stage, Supplier)
        .join(QuoteVersion, QuoteVersion.id == Stage.confirmed_quote_version_id)
        .join(Quote, Quote.id == QuoteVersion.quote_id)
        .join(Supplier, Supplier.id == Quote.supplier_id)
        .where(Stage.performance_id == perf.id, Stage.status == "CONFIRMED")
        .order_by(Stage.seq)
    )
    return [(s, sup) for s, sup in rows]


def _mine(db: Session, user: User, performance_id: int) -> Performance:
    perf = db.get(Performance, performance_id)
    if perf is None or perf.user_id != user.id:
        raise not_found()  # 남의 공연은 있는지도 알리지 않는다
    return perf


def performance_reviews(db: Session, user: User, performance_id: int, *, today: date) -> tuple[bool, list[dict]]:
    """내 공연의 후기 칸: (지금 쓸 수 있는지, [단계·업체·내가 쓴 후기])."""
    perf = _mine(db, user, performance_id)
    open_ = can_review(db, perf, today)
    written = {r.stage_id: r for r in db.scalars(select(Review).where(Review.performance_id == perf.id))}
    items = [
        {
            "stage_id": st.id,
            "stage_type": st.stage_type,
            "supplier_id": sup.id,
            "company_name": sup.company_name,
            "review": written.get(st.id),
        }
        for st, sup in _stages(db, perf)
    ]
    return open_, items


def write(
    db: Session, user: User, performance_id: int, *, stage_id: int, rating: int, content: str, today: date, now: datetime
) -> Review:
    perf = _mine(db, user, performance_id)
    if not can_review(db, perf, today):
        raise invalid_state("결제한 공연이 끝난 뒤에 후기를 쓸 수 있어요.")
    pair = next(((st, sup) for st, sup in _stages(db, perf) if st.id == stage_id), None)
    if pair is None:
        raise not_found()
    text = " ".join((content or "").split())
    if not 1 <= rating <= 5:
        raise _bad("rating", "별점은 1~5점으로 골라 주세요")
    if not 10 <= len(text) <= 500:
        raise _bad("content", "후기는 10~500자로 써 주세요")
    if _CONTACT.search(text):
        raise _bad("content", "후기에는 전화번호·이메일·계좌번호를 쓸 수 없어요")
    review = Review(
        performance_id=perf.id, stage_id=stage_id, supplier_id=pair[1].id, user_id=user.id,
        rating=rating, content=text, created_at=now,
    )
    db.add(review)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "ALREADY_REVIEWED", "이 업체에는 이미 후기를 썼어요.") from None
    return review


def delete(db: Session, user: User, review_id: int) -> None:
    review = db.get(Review, review_id)
    if review is None or review.user_id != user.id:
        raise not_found()
    db.delete(review)
    db.commit()


def summary(db: Session, supplier_ids: list[int]) -> dict[int, tuple[float, int]]:
    """업체별 (평균 별점, 후기 수). 후기가 없는 업체는 빠진다."""
    if not supplier_ids:
        return {}
    rows = db.execute(
        select(Review.supplier_id, func.avg(Review.rating), func.count())
        .where(Review.supplier_id.in_(supplier_ids))
        .group_by(Review.supplier_id)
    )
    return {sid: (round(float(avg), 1), n) for sid, avg, n in rows}


def supplier_reviews(db: Session, supplier_id: int, *, before: int | None) -> dict:
    if db.get(Supplier, supplier_id) is None:
        raise not_found()
    avg, count = summary(db, [supplier_id]).get(supplier_id, (None, 0))
    dist = dict(
        db.execute(
            select(Review.rating, func.count()).where(Review.supplier_id == supplier_id).group_by(Review.rating)
        ).all()
    )
    stmt = (
        select(Review, User.nickname, Stage.stage_type, Performance.show_date)
        .join(User, User.id == Review.user_id)
        .join(Stage, Stage.id == Review.stage_id)
        .join(Performance, Performance.id == Review.performance_id)
        .where(Review.supplier_id == supplier_id)
    )
    if before:
        stmt = stmt.where(Review.id < before)
    rows = list(db.execute(stmt.order_by(Review.id.desc()).limit(PAGE_SIZE + 1)))
    more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    items = [
        {
            "id": r.id,
            "rating": r.rating,
            "content": r.content,
            "nickname": nick or "탈퇴한 사용자",
            "stage_type": st,
            "show_month": f"{d.year}년 {d.month}월",
            "created_at": r.created_at,
        }
        for r, nick, st, d in rows
    ]
    return {
        "average": avg,
        "count": count,
        "distribution": {str(k): dist.get(k, 0) for k in range(5, 0, -1)},
        "items": items,
        "next_before": rows[-1][0].id if more else None,
    }
