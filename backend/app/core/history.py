"""상태 변경 이력 기록 (NFR-HIST-01). 모든 상태 변경 서비스가 같은 트랜잭션에서 부른다."""
from sqlalchemy.orm import Session

from app.models.history import StatusHistory


def record_transition(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    from_status: str | None,
    to_status: str,
    actor_user_id: int | None,
    reason: str | None = None,
) -> None:
    db.add(
        StatusHistory(
            entity_type=entity_type,
            entity_id=entity_id,
            from_status=from_status,
            to_status=to_status,
            actor_user_id=actor_user_id,
            reason=reason,
        )
    )
