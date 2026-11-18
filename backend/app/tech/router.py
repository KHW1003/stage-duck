"""기술 확인 API (api-contract.md 4.5)."""
from datetime import datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.core.db import get_db
from app.models.user import User
from app.tech import service
from app.tech.schemas import TechAnswerIn, TechCheckIn, TechCheckListOut, TechCheckOut

router = APIRouter(tags=["tech"])


@router.get("/performances/{performance_id}/tech-checks", response_model=TechCheckListOut, response_model_by_alias=True)
def list_checks(performance_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TechCheckListOut:
    """공연을 올린 사용자와 확정된 업체만 본다. 그 밖은 404."""
    return service.list_checks(db, user, performance_id)


@router.post(
    "/performances/{performance_id}/tech-checks",
    response_model=TechCheckOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def add_check(
    performance_id: int, body: TechCheckIn, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> TechCheckOut:
    """AC-F3-25: 엔지니어(또는 엔지니어 포함 업체)만 항목을 더한다."""
    return service.add_check(db, user, performance_id, body)


@router.put("/tech-checks/{check_id}", response_model=TechCheckOut, response_model_by_alias=True)
def answer_check(check_id: int, body: TechAnswerIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TechCheckOut:
    """AC-F3-25: 담당 업체만 답한다. 담당이 아니면 404."""
    return service.answer_check(db, user, check_id, body, now=datetime.now())
