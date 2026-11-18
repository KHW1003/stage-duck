"""관리자 화면이 읽는 서비스 (plan.md 6.5). 읽기 전용 — 상태를 바꾸지 않는다."""
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models.history import StatusHistory
from app.models.quote import Quote
from app.models.request import Performance, Stage


def performance_history(db: Session, performance_id: int) -> list[StatusHistory]:
    """AC-F5-13: 한 공연의 모든 상태 변경(공연·단계·견적서)을 시간순으로.

    shortcut: 청구서·결제·취소·확인 카드 이력은 그 테이블이 생기면(#43·#50~52) 여기에 더한다.
    """
    if db.get(Performance, performance_id) is None:
        raise not_found()
    stage_ids = select(Stage.id).where(Stage.performance_id == performance_id)
    quote_ids = select(Quote.id).where(Quote.stage_id.in_(stage_ids))
    owned = or_(
        and_(StatusHistory.entity_type == "performance", StatusHistory.entity_id == performance_id),
        and_(StatusHistory.entity_type == "stage", StatusHistory.entity_id.in_(stage_ids)),
        and_(StatusHistory.entity_type == "quote", StatusHistory.entity_id.in_(quote_ids)),
    )
    return list(db.scalars(select(StatusHistory).where(owned).order_by(StatusHistory.created_at, StatusHistory.id)))
