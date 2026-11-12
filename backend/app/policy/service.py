"""경고·정지 서비스 (FR-POL-04, Q-34). 경고 3회면 이용 정지."""
from sqlalchemy.orm import Session

from app.core.errors import invalid_state, not_found
from app.core.history import record_transition
from app.models.policy import WARNINGS_BEFORE_SUSPENSION, Sanction
from app.models.user import User
from app.supplier.service import _require_reason


def warn(db: Session, user_id: int, *, actor_id: int | None, reason: str | None, report_id: int | None = None) -> User:
    """AC-F4-08: 경고 3회째에 계정이 정지된다. AC-F5-10(업체 사정 취소)도 이 함수를 쓴다."""
    reason = _require_reason(reason)
    user = db.get(User, user_id, with_for_update=True)
    if user is None:
        raise not_found()
    if user.status != "ACTIVE":
        raise invalid_state("이미 정지되었거나 탈퇴한 회원이에요.")
    if user.role == "ADMIN":
        raise invalid_state("관리자에게는 경고를 줄 수 없어요.")

    user.warning_count += 1
    db.add(Sanction(user_id=user.id, type="WARNING", reason=reason, report_id=report_id, created_by=actor_id))

    if user.warning_count >= WARNINGS_BEFORE_SUSPENSION:
        user.status = "SUSPENDED"
        auto_reason = f"경고 {user.warning_count}회 누적"
        db.add(Sanction(user_id=user.id, type="SUSPENSION", reason=auto_reason, report_id=report_id, created_by=actor_id))
        record_transition(
            db,
            entity_type="user",
            entity_id=user.id,
            from_status="ACTIVE",
            to_status="SUSPENDED",
            actor_user_id=actor_id,
            reason=auto_reason,
        )
    db.commit()
    return user
