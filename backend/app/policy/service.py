"""신고·경고·정지 서비스 (FR-POL-04, Q-34). 경고 3회면 이용 정지."""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.board import PrPost
from app.models.policy import REPORT_TARGET_TYPES, WARNINGS_BEFORE_SUSPENSION, Report, Sanction
from app.models.user import User
from app.notification import service as notification
from app.supplier.service import _require_reason


def warn(db: Session, user_id: int, *, actor_id: int | None, reason: str | None, report_id: int | None = None) -> User:
    """AC-F4-08: 경고 3회째에 계정이 정지된다. AC-F5-10(업체 사정 취소)도 이 함수를 쓴다."""
    user = _warn(db, user_id, actor_id=actor_id, reason=reason, report_id=report_id)
    db.commit()
    return user


def _warn(db: Session, user_id: int, *, actor_id: int | None, reason: str | None, report_id: int | None) -> User:
    """warn() 의 본문 — 커밋하지 않는다 (신고 처리처럼 다른 변경과 한 트랜잭션으로 묶을 때)."""
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
    # #45 운영 알림은 정지된 계정에도 간다 (notifications.md 1장 규칙 5). 3회째면 정지 알림까지 두 개
    notification.notify(db, user.id, "WARNING_ISSUED", link="/inquiries/new",
                        params={"count": min(user.warning_count, WARNINGS_BEFORE_SUSPENSION), "reason": reason})

    if user.warning_count >= WARNINGS_BEFORE_SUSPENSION:
        user.status = "SUSPENDED"
        auto_reason = f"경고 {user.warning_count}회 누적"
        db.add(Sanction(user_id=user.id, type="SUSPENSION", reason=auto_reason, report_id=report_id, created_by=actor_id))
        notification.notify(db, user.id, "ACCOUNT_SUSPENDED", link="/inquiries/new")
        record_transition(
            db,
            entity_type="user",
            entity_id=user.id,
            from_status="ACTIVE",
            to_status="SUSPENDED",
            actor_user_id=actor_id,
            reason=auto_reason,
        )
    return user


# 신고 처리 (SQLAdmin [경고]·[기각] 액션) ---------------------------------------
_REPORT_ALLOWED = {("OPEN", "WARNED"), ("OPEN", "DISMISSED")}


def _handle_report(db: Session, report_id: int, to: str, actor_id: int | None, reason: str | None) -> Report:
    reason = _require_reason(reason)
    rep = db.get(Report, report_id, with_for_update=True)
    if rep is None:
        raise not_found()
    if (rep.status, to) not in _REPORT_ALLOWED:
        raise invalid_state("이미 처리한 신고예요.")
    if to == "WARNED":
        if rep.target_type != "USER":
            # shortcut: 글·채팅방의 주인은 1·3번 테이블에 있어 아직 찾을 수 없다. 그 테이블이 생기면 주인을 찾아 경고한다.
            raise invalid_state("회원 신고만 여기서 경고할 수 있어요. PR 글은 [블라인드]로 처리해 주세요.")
        _warn(db, rep.target_id, actor_id=actor_id, reason=reason, report_id=rep.id)
    record_transition(db, entity_type="report", entity_id=rep.id, from_status=rep.status, to_status=to,
                      actor_user_id=actor_id, reason=reason)
    rep.status, rep.handled_by, rep.handled_at = to, actor_id, datetime.now()
    db.commit()
    return rep


def warn_report(db: Session, report_id: int, *, actor_id: int | None, reason: str | None) -> Report:
    """FR-POL-04: 신고를 받아들여 대상 회원에게 경고 1회 (3회면 정지). OPEN → WARNED."""
    return _handle_report(db, report_id, "WARNED", actor_id, reason)


def dismiss_report(db: Session, report_id: int, *, actor_id: int | None, reason: str | None) -> Report:
    """FR-POL-04: 신고를 기각한다. OPEN → DISMISSED."""
    return _handle_report(db, report_id, "DISMISSED", actor_id, reason)


# ---------------------------------------------------------------------------
# 묶음 사이 약속 (roles.md 3장, CLAUDE.md 5장) — 4번 → 1·3번
# 이름·인자를 바꾸려면 쓰는 쪽(1번 세환: PR 게시판, 3번 채은: 채팅)과 먼저 합의한다.
# ---------------------------------------------------------------------------

def suspension_reason(db: Session, user_id: int) -> str | None:
    """[약속 4 → 1] 그 회원의 가장 최근 SUSPENSION 제재 사유. 없으면 None.

    쓰는 곳: 1번 정지된 계정 로그인 안내 (#24).
    """
    return db.scalar(
        select(Sanction.reason)
        .where(Sanction.user_id == user_id, Sanction.type == "SUSPENSION")
        .order_by(Sanction.created_at.desc(), Sanction.id.desc())
        .limit(1)
    )


def report(db: Session, *, reporter_id: int, target_type: str, target_id: int, reason: str | None) -> int:
    """[약속 4 → 1·3] 신고를 남기고 신고 id 를 돌려준다. 처리(경고·기각)는 관리자가 한다 (FR-POL-04).

    - reason 이 비면 VALIDATION_FAILED, target_type 이 REPORT_TARGET_TYPES 밖이면 VALIDATION_FAILED.
    - 같은 사람이 같은 대상을 여러 번 신고해도 한 건으로 본다.
    쓰는 곳: 1번 PR 게시글 신고(AC-F4-03), 3번 채팅방 신고(POST /chat-rooms/{id}/report), POST /reports.
    """
    reason = _require_reason(reason)
    if target_type not in REPORT_TARGET_TYPES:
        raise AppError(400, "VALIDATION_FAILED", "신고할 수 없는 대상이에요.", [{"field": "targetType", "reason": "허용 안 됨"}])
    if type(target_id) is not int or target_id < 1:
        raise AppError(400, "VALIDATION_FAILED", "신고 대상을 다시 골라 주세요.", [{"field": "targetId", "reason": "1 이상"}])
    key = (Report.reporter_user_id == reporter_id, Report.target_type == target_type, Report.target_id == target_id)
    rep = Report(reporter_user_id=reporter_id, target_type=target_type, target_id=target_id, reason=reason)
    db.add(rep)
    try:
        db.commit()
    except IntegrityError:  # 같은 신고가 이미 있으면 (동시에 두 번 와도) 그 건을 돌려준다
        db.rollback()
        return db.scalar(select(Report.id).where(*key))
    return rep.id


def blind_post(db: Session, post_id: int, *, actor_id: int, reason: str | None) -> None:
    """[약속 4 → 1] 관리자가 PR 게시글을 블라인드하고, 그 업체 계정에 경고 1회를 준다 (D-32, AC-F4-03·10).

    - 사유 필수. 상태 이력을 남긴다. 경고는 위 warn() 을 같은 트랜잭션에서 부른다 (3회면 정지).
    - 블라인드된 글이 있는 부문에는 새 글을 쓸 수 없다 — 이는 pr_posts.active_guard 가 막는다 (1번).
    쓰는 곳: SQLAdmin [블라인드] 액션.
    """
    reason = _require_reason(reason)
    post = db.get(PrPost, post_id, with_for_update=True)
    if post is None:
        raise not_found()
    if post.status != "ACTIVE":
        raise invalid_state("활성 글만 블라인드할 수 있어요.")
    record_transition(db, entity_type="pr_post", entity_id=post.id, from_status="ACTIVE", to_status="BLINDED",
                      actor_user_id=actor_id, reason=reason)
    post.status, post.blind_reason = "BLINDED", reason
    notification.notify(db, post.supplier.user_id, "POST_BLINDED", link=f"/board/{post.id}",
                        params={"board": "업체 찾기", "reason": reason}, payload={"postId": post.id})
    _warn(db, post.supplier.user_id, actor_id=actor_id, reason=f"업체 찾기 소개 글 블라인드: {reason}", report_id=None)
    db.commit()


def unblind_post(db: Session, post_id: int, *, actor_id: int) -> None:
    """AC-F4-10: 블라인드를 풀면 그 글이 다시 활성이 돼서 업체가 수정·재게시할 수 있다. 준 경고는 그대로 둔다."""
    post = db.get(PrPost, post_id, with_for_update=True)
    if post is None:
        raise not_found()
    if post.status != "BLINDED":
        raise invalid_state("블라인드된 글만 해제할 수 있어요.")
    record_transition(db, entity_type="pr_post", entity_id=post.id, from_status="BLINDED", to_status="ACTIVE",
                      actor_user_id=actor_id, reason="블라인드 해제")
    post.status, post.blind_reason = "ACTIVE", None
    db.commit()
