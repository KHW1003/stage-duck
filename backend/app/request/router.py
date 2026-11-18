"""공연 요청서 API (api-contract.md 3.2). 사용자(USER) 역할만, 남의 요청서는 404."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.user import User
from app.request import service
from app.request.schemas import PerformanceCreatedOut, PerformanceIn, PublishOut

router = APIRouter(prefix="/performances", tags=["request"])


def get_today() -> date:
    """오늘 날짜 (KST 서버 시각). 테스트에서 dependency_overrides 로 고정한다 (AC-F2-06)."""
    return date.today()


@router.post("", response_model=PerformanceCreatedOut, status_code=status.HTTP_201_CREATED)
def create_performance(
    body: PerformanceIn,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
) -> PerformanceCreatedOut:
    """AC-F2-04~07·10: 요청서 작성 (DRAFT, v1)."""
    return PerformanceCreatedOut.model_validate(service.create_performance(db, user, body, today=today))


@router.post("/{performance_id}/publish", response_model=PublishOut)
def publish(
    performance_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> PublishOut:
    """AC-F2-08: 게시 → 필요한 단계만 만들고 첫 단계 OPEN."""
    return PublishOut.model_validate(service.publish(db, user, performance_id, now=datetime.now()))
