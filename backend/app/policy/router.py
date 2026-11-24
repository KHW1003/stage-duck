"""신고 API (FR-POL-04, AC-F4-03·15)."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.core.db import get_db
from app.models.user import User
from app.policy import service
from app.policy.schemas import ReportIn, ReportOut

router = APIRouter(prefix="/reports", tags=["policy"])


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(body: ReportIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> ReportOut:
    """로그인한 회원이 글·댓글·채팅방·회원을 신고한다. 같은 대상을 다시 신고하면 처음 신고 번호를 돌려준다."""
    report_id = service.report(db, reporter_id=user.id, target_type=body.target_type, target_id=body.target_id, reason=body.reason)
    return ReportOut(id=report_id)
