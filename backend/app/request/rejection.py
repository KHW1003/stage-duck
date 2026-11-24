"""반려 카운트·게시 제한 서비스 (T2-05 #39, FR-POL-02 · AC-F4-05·06·07).

- 반려 = 견적서를 받은 공고를 내림(withdraw). 그 공연에서 채팅을 시작한 업체가 있으면 AFTER_CHAT, 없으면 NO_CHAT
- D-57: 채팅을 시작한 공연을 결제 전에 취소해도 반려 — 4번 묶음 취소가 record_rejection() 을 부른다
- 게시 제한·카운트 계산은 calc.posting_limit (순수 함수)

[약속 2 → 3] user_counts(): 공고 목록(GET /postings)의 반려·이용 횟수 (AC-F4-07)
[약속 2 → 4] record_rejection(): 결제 전 취소 때 반려 기록
quote 서비스를 import 하지 않는다 (quote 가 이 파일을 부르므로 서로 부르면 순환).
"""
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.chat.service import chat_started
from app.core.errors import AppError
from app.models.quote import Quote
from app.models.rejection import RejectionEvent
from app.models.request import Performance, Stage
from app.request import calc

USED_STATUSES = ("CONFIRMED", "COMPLETED")  # 결제까지 끝난 공연 = 이용 1회


def _quoted_suppliers(db: Session, performance_id: int) -> list[int]:
    return list(
        db.scalars(
            select(Quote.supplier_id).distinct().join(Stage, Stage.id == Quote.stage_id).where(Stage.performance_id == performance_id)
        )
    )


def record_rejection(db: Session, performance_id: int, *, now: datetime) -> RejectionEvent | None:
    """[약속 2 → 4] 반려 한 줄을 쌓는다. 견적서를 하나도 받지 않은 공연이면 반려가 아니라 None. 커밋하지 않는다.

    결제 후 업체 사정 취소로 다시 모집하던 공연이면 사용자 잘못이 아니라 쌓지 않는다 (AC-F5-10).
    """
    from app.payment.deadline import paid_supplier_cancel  # 4번 → 2번 순환 import 를 피한다

    if paid_supplier_cancel(db, performance_id) is not None:
        return None
    suppliers = _quoted_suppliers(db, performance_id)
    if not suppliers:
        return None
    perf = db.get(Performance, performance_id)
    kind = "AFTER_CHAT" if any(chat_started(db, performance_id, s) for s in suppliers) else "NO_CHAT"
    event = RejectionEvent(user_id=perf.user_id, performance_id=performance_id, kind=kind, created_at=now)
    db.add(event)
    return event


def limit_for(db: Session, user_id: int, now: datetime) -> calc.PostingLimit:
    rows = db.execute(select(RejectionEvent.kind, RejectionEvent.created_at).where(RejectionEvent.user_id == user_id)).all()
    return calc.posting_limit([(k, t) for k, t in rows], now)


def check_can_publish(db: Session, user_id: int, now: datetime) -> None:
    """AC-F4-05: 제한 중이면 403 POSTING_RATE_LIMITED (게시할 수 있는 시각을 문구에)."""
    limit = limit_for(db, user_id, now)
    if limit.limited:
        at = limit.available_at
        raise AppError(
            403,
            "POSTING_RATE_LIMITED",
            f"공고를 여러 번 내려서 잠시 게시할 수 없어요. {at.month}월 {at.day}일 {at:%H:%M} 이후에 게시해 주세요.",
        )


def user_counts(db: Session, user_ids: set[int], *, now: datetime) -> dict[int, dict[str, int]]:
    """[약속 2 → 3] 사용자별 반려 횟수(지금 카운트, 180일 규칙)·이용 횟수 (AC-F4-07)."""
    if not user_ids:
        return {}
    events: dict[int, list[tuple[str, datetime]]] = {uid: [] for uid in user_ids}
    for uid, kind, at in db.execute(
        select(RejectionEvent.user_id, RejectionEvent.kind, RejectionEvent.created_at).where(RejectionEvent.user_id.in_(user_ids))
    ):
        events[uid].append((kind, at))
    used = dict(
        db.execute(
            select(Performance.user_id, func.count())
            .where(Performance.user_id.in_(user_ids), Performance.status.in_(USED_STATUSES))
            .group_by(Performance.user_id)
        ).all()
    )
    result = {}
    for uid in user_ids:
        limit = calc.posting_limit(events[uid], now)
        result[uid] = {"rejection_count": limit.after_chat + limit.no_chat, "usage_count": used.get(uid, 0)}
    return result
