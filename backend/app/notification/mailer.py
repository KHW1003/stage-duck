"""중요 알림을 메일로도 보낸다 (specs/notifications.md 10장).

- 사이트 알림(notify)과 같은 때에 만들고, 그 트랜잭션이 커밋된 뒤에만 보낸다 (롤백되면 보내지 않는다).
- 보내는 종류는 MAIL_TYPES 만: 놓치면 일정·돈이 걸린 알림. 공고·커뮤니티·채팅처럼 자주 오는 것은 사이트 알림만.
- 받는 사람이 [알림] 화면에서 메일 알림을 껐거나, 탈퇴했으면 보내지 않는다.
- 시연 계정(@stageduck.test 같은 .test 주소)은 메일함이 없으니 실제 발송(smtp)에서는 건너뛴다.
- 문구는 사이트 알림과 같다 (이미 연락처를 가린 문구). 메일 틀은 합니다체.
"""
from sqlalchemy import event, select
from sqlalchemy.orm import Session, SessionTransaction

from app.core import mail
from app.core.config import get_settings
from app.models.notification import Notification, NotificationSetting
from app.models.user import User

_PENDING = "pending_notification_mail"

MAIL_TYPES = frozenset({
    # 업체 입점·제재
    "SUPPLIER_APPROVED", "SUPPLIER_REJECTED", "WARNING_ISSUED", "ACCOUNT_SUSPENDED", "ACCOUNT_UNSUSPENDED",
    # 견적 요청·견적서·최종 견적
    "OFFER_RECEIVED", "QUOTE_RECEIVED", "CONFIRM_REQUESTED", "CONFIRM_EXPIRING",
    # 결제·마감·취소
    "INVOICE_READY", "PAYMENT_DEADLINE_SET", "PAYMENT_READY", "PAYMENT_REMINDER", "HOLD_EXPIRED", "PAID",
    "CANCELLED_BY_USER", "CANCELLED_BY_SUPPLIER",
    # 문의 답변
    "INQUIRY_ANSWERED",
})

FOOTER = "중요한 알림만 메일로 보내 드립니다. 메일 알림은 사이트의 [알림] 화면에서 끄실 수 있습니다."


def email_enabled(db: Session, user_id: int) -> bool:
    row = db.get(NotificationSetting, user_id)
    return True if row is None else row.email_enabled


def mail_text(n: Notification) -> str:
    lines = ["안녕하세요, STAGE DUCK입니다.", "", n.title]
    if n.body:
        lines.append(n.body)
    lines += ["", f"자세히 보기: {get_settings().public_base_url}{n.link}", "", FOOTER, "본 메일은 발신 전용입니다."]
    return chr(10).join(lines)


def queue(db: Session, n: Notification) -> None:
    """이 알림을 메일로도 보낼지 보고, 보낼 것이면 커밋 뒤로 미룬다."""
    if n.type not in MAIL_TYPES:
        return
    user = db.scalar(select(User).where(User.id == n.user_id))
    if user is None or user.status == "WITHDRAWN" or not user.email or not email_enabled(db, user.id):
        return
    db.info.setdefault(_PENDING, []).append((user.email, f"[STAGE DUCK] {n.title}", mail_text(n)))


def _skip(to: str) -> bool:
    return get_settings().mail_backend == "smtp" and to.lower().endswith(".test")


@event.listens_for(Session, "after_commit")
def _send_pending(session: Session) -> None:
    if session.in_nested_transaction():
        return
    for to, subject, text in session.info.pop(_PENDING, []):
        if not _skip(to):
            mail.send_mail(to, subject, text)


@event.listens_for(Session, "after_transaction_end")
def _drop_pending(session: Session, transaction: SessionTransaction) -> None:
    if transaction.parent is None:
        session.info.pop(_PENDING, None)
