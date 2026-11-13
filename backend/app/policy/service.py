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


# ---------------------------------------------------------------------------
# 묶음 사이 약속 (roles.md 3장, CLAUDE.md 5장) — 4번 → 1·3번
# 이름·인자를 바꾸려면 쓰는 쪽(1번 세환: PR 게시판, 3번 채은: 채팅)과 먼저 합의한다.
# ---------------------------------------------------------------------------

REPORT_TARGET_TYPES = ("CHAT_ROOM", "PR_POST", "USER")  # data-model.md reports.target_type


def report(db: Session, *, reporter_id: int, target_type: str, target_id: int, reason: str | None) -> int:
    """[약속 4 → 1·3] 신고를 남기고 신고 id 를 돌려준다. 처리(경고·기각)는 관리자가 한다 (FR-POL-04).

    - reason 이 비면 VALIDATION_FAILED, target_type 이 REPORT_TARGET_TYPES 밖이면 VALIDATION_FAILED.
    - 같은 사람이 같은 대상을 여러 번 신고해도 한 건으로 본다.
    쓰는 곳: 1번 PR 게시글 신고(AC-F4-03), 3번 채팅방 신고(POST /chat-rooms/{id}/report).
    구현: 4번 목산 — T4-09 (#54).
    """
    raise NotImplementedError("4번 묶음 T4-09(#54)에서 구현한다")


def blind_post(db: Session, post_id: int, *, actor_id: int, reason: str | None) -> None:
    """[약속 4 → 1] 관리자가 PR 게시글을 블라인드하고, 그 업체 계정에 경고 1회를 준다 (D-32, AC-F4-03·10).

    - 사유 필수. 상태 이력을 남긴다. 경고는 위 warn() 을 같은 트랜잭션에서 부른다 (3회면 정지).
    - 블라인드된 글이 있는 부문에는 새 글을 쓸 수 없다 — 이는 pr_posts.active_guard 가 막는다 (1번).
    쓰는 곳: SQLAdmin [블라인드] 액션.
    구현: 4번 목산 — T4-09 (#54). 블라인드 해제는 같은 이슈에서 unblind_post() 로 더한다.
    """
    raise NotImplementedError("4번 묶음 T4-09(#54)에서 구현한다")
