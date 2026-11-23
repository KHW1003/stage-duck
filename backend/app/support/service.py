"""공지사항 읽기 (FR-CS-02, AC-F5-21). 쓰기는 관리자 SQLAdmin(NoticeAdmin)만 한다.

- 목록: 고정 글 먼저, 그다음 게시일 최신순. 게시일이 아직 안 된 글(예약)은 보이지 않는다.
- 상세: 이전 글 = 바로 먼저 올린 글, 다음 글 = 바로 나중에 올린 글 (고정 여부와 상관없이 게시일 순).
"""
import math
from datetime import datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.files import service as files_service
from app.models.file import StoredFile
from app.models.request import Performance
from app.models.support import Inquiry, Notice
from app.models.user import User
from app.support.schemas import InquiryIn

PAGE_SIZE = 20


def list_notices(db: Session, *, page: int, now: datetime) -> tuple[list[Notice], int]:
    visible = Notice.published_at <= now
    total = db.scalar(select(func.count()).select_from(Notice).where(visible)) or 0
    rows = db.scalars(
        select(Notice)
        .where(visible)
        .order_by(Notice.is_pinned.desc(), Notice.published_at.desc(), Notice.id.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
    ).all()
    return list(rows), total


def total_pages(total: int) -> int:
    return max(1, math.ceil(total / PAGE_SIZE))


def get_public_notice(db: Session, notice_id: int, *, now: datetime) -> Notice | None:
    """공개된(게시일이 지난) 공지면 돌려주고 아니면 None. SEO head 도 이 함수를 쓴다."""
    notice = db.get(Notice, notice_id)
    return notice if notice is not None and notice.published_at <= now else None


def get_notice(db: Session, notice_id: int, *, now: datetime) -> tuple[Notice, Notice | None, Notice | None]:
    """(공지, 이전 글, 다음 글). 없거나 아직 게시 전이면 404."""
    notice = get_public_notice(db, notice_id, now=now)
    if notice is None:
        raise not_found()
    at, nid = notice.published_at, notice.id
    earlier = or_(Notice.published_at < at, and_(Notice.published_at == at, Notice.id < nid))
    later = or_(Notice.published_at > at, and_(Notice.published_at == at, Notice.id > nid))
    prev = db.scalar(select(Notice).where(earlier).order_by(Notice.published_at.desc(), Notice.id.desc()).limit(1))
    nxt = db.scalar(
        select(Notice)
        .where(later, Notice.published_at <= now)
        .order_by(Notice.published_at.asc(), Notice.id.asc())
        .limit(1)
    )
    return notice, prev, nxt


def public_notice_stamps(db: Session, *, now: datetime) -> list[tuple[int, datetime]]:
    """sitemap.xml 용: 공개된 공지의 (id, 게시일)."""
    rows = db.execute(select(Notice.id, Notice.published_at).where(Notice.published_at <= now).order_by(Notice.id))
    return [(i, at) for i, at in rows]


# ---------------------------------------------------------------------------
# 1:1 문의 (T2-09 #102, FR-CS-01, AC-F5-18~20, D-48). 담당 변경으로 4번 목산이 만든다 (CLAUDE.md 5장)
# ---------------------------------------------------------------------------
_ALLOWED = {"WAITING": {"ANSWERED"}}


def _check_performance(db: Session, user: User, performance_id: int | None) -> None:
    """고른 공연은 내 공연이어야 한다 (읽기 전용 참조, 2번 performances)."""
    if performance_id is None:
        return
    perf = db.get(Performance, performance_id)
    if perf is None or perf.user_id != user.id:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.",
                       [{"field": "performanceId", "reason": "내 공연만 고를 수 있어요."}])


def _mine(db: Session, user: User, inquiry_id: int, *, lock: bool = False) -> Inquiry:
    """AC-F5-20: 남의 문의는 404."""
    inquiry = db.get(Inquiry, inquiry_id, with_for_update=lock)
    if inquiry is None or inquiry.user_id != user.id:
        raise not_found()
    return inquiry


def inquiry_photos(db: Session, inquiry: Inquiry) -> list[StoredFile]:
    if not inquiry.attachments:
        return []
    found = {f.id: f for f in db.scalars(select(StoredFile).where(StoredFile.id.in_(inquiry.attachments)))}
    return [found[i] for i in inquiry.attachments if i in found and found[i].status != "DELETED"]


def create_inquiry(db: Session, user: User, body: InquiryIn, *, now: datetime) -> Inquiry:
    """AC-F5-18: 로그인 회원(정지 계정 포함)이 문의를 쓴다. 상태는 답변 대기."""
    _check_performance(db, user, body.performance_id)
    files = files_service.attach_files(db, owner_id=user.id, file_ids=body.file_ids, purpose="INQUIRY", now=now)
    inquiry = Inquiry(
        user_id=user.id, category=body.category, performance_id=body.performance_id, title=body.title, body=body.body,
        status="WAITING", attachments=[f.id for f in files],
    )
    db.add(inquiry)
    db.flush()
    record_transition(db, entity_type="inquiry", entity_id=inquiry.id, from_status=None, to_status="WAITING",
                      actor_user_id=user.id)
    db.commit()
    return inquiry


def list_my_inquiries(db: Session, user: User) -> list[Inquiry]:
    """GET /me/inquiries: 내 문의 최신순."""
    return list(db.scalars(select(Inquiry).where(Inquiry.user_id == user.id).order_by(Inquiry.created_at.desc(), Inquiry.id.desc())))


def get_inquiry(db: Session, user: User, inquiry_id: int) -> Inquiry:
    """AC-F5-20: 문의 + 답변. 본인만."""
    return _mine(db, user, inquiry_id)


def _editable(inquiry: Inquiry) -> None:
    """AC-F5-19: 답변 완료면 고치거나 지울 수 없다."""
    if inquiry.status != "WAITING":
        raise invalid_state("답변이 끝난 문의는 고치거나 지울 수 없어요. 새 문의를 남겨 주세요.")


def update_inquiry(db: Session, user: User, inquiry_id: int, body: InquiryIn, *, now: datetime) -> Inquiry:
    """PUT /inquiries/{id}: 답변 대기일 때만. 이미 붙은 사진은 그대로 두고, 새 사진만 붙인다. 뺀 사진은 지운다."""
    inquiry = _mine(db, user, inquiry_id, lock=True)
    _editable(inquiry)
    _check_performance(db, user, body.performance_id)
    kept = set(inquiry.attachments)
    new_ids = [i for i in body.file_ids if i not in kept]
    files_service.attach_files(db, owner_id=user.id, file_ids=new_ids, purpose="INQUIRY", now=now)
    for f in inquiry_photos(db, inquiry):
        if f.id not in body.file_ids:
            f.status = "DELETED"  # shortcut: 저장 파일은 남는다, 파일 정리 작업(purge)이 생기면 거기서 지운다
    inquiry.category, inquiry.performance_id = body.category, body.performance_id
    inquiry.title, inquiry.body, inquiry.attachments = body.title, body.body, list(body.file_ids)
    db.commit()
    return inquiry


def delete_inquiry(db: Session, user: User, inquiry_id: int) -> None:
    """DELETE /inquiries/{id}: 답변 대기일 때만. 붙은 사진도 지운 것으로 둔다."""
    inquiry = _mine(db, user, inquiry_id, lock=True)
    _editable(inquiry)
    for f in inquiry_photos(db, inquiry):
        f.status = "DELETED"
    db.delete(inquiry)
    db.commit()


def answer_inquiry(db: Session, inquiry_id: int, *, actor_id: int, reason: str, now: datetime | None = None) -> Inquiry:
    """AC-F5-19 (FR-ADMIN-06): 관리자가 SQLAdmin 에서 답변 → 답변 완료. reason = 답변 글 (사유 입력 화면을 같이 쓴다).

    문의한 회원에게 INQUIRY_ANSWERED (#45, 정지 계정에도 간다).
    """
    answer = (reason or "").strip()
    if not answer:
        raise AppError(400, "VALIDATION_FAILED", "답변을 적어 주세요.", [{"field": "reason", "reason": "답변을 적어 주세요."}])
    inquiry = db.get(Inquiry, inquiry_id, with_for_update=True)
    if inquiry is None:
        raise not_found()
    if "ANSWERED" not in _ALLOWED.get(inquiry.status, set()):
        raise invalid_state("이미 답변한 문의예요.")
    record_transition(db, entity_type="inquiry", entity_id=inquiry.id, from_status=inquiry.status, to_status="ANSWERED",
                      actor_user_id=actor_id)
    inquiry.status, inquiry.answer, inquiry.answered_by = "ANSWERED", answer, actor_id
    inquiry.answered_at = now or datetime.now()
    from app.notification import service as notification  # 3번 → 함수 안 import

    notification.notify(db, inquiry.user_id, "INQUIRY_ANSWERED", link=f"/inquiries/{inquiry.id}",
                        params={"title": notification.snippet(inquiry.title, 30)}, payload={"inquiryId": inquiry.id})
    db.commit()
    return inquiry
