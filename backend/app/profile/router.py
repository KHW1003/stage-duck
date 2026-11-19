"""프로필 API (api-contract.md 5장, #33). 업체 프로필은 누구나, 개인 프로필은 관계있는 업체·관리자, 내 프로필은 사용자."""
from datetime import datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.user import User
from app.profile import service
from app.profile.schemas import MyProfileIn, SupplierProfileOut, UserProfileOut

router = APIRouter(tags=["profile"])


def get_now() -> datetime:
    """지금 시각 (반려 180일 계산). 테스트는 dependency_overrides 로 고정한다."""
    return datetime.now()


@router.get("/suppliers/{supplier_id}/profile", response_model=SupplierProfileOut)
def supplier_profile(supplier_id: int, db: Session = Depends(get_db)) -> SupplierProfileOut:
    """AC-F5-15: 방문자도 본다. 연락처·사업자 서류 없음, 승인 업체가 아니면 404."""
    return service.supplier_profile(db, supplier_id)


@router.get("/users/{user_id}/profile", response_model=UserProfileOut)
def user_profile(
    user_id: int,
    viewer: User = Depends(require_role("SUPPLIER", "ADMIN")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> UserProfileOut:
    """AC-F5-16·17: 관계있는 업체·관리자만. 만난 적 없으면 404."""
    return service.user_profile(db, viewer, user_id, now=now)


@router.get("/me/profile", response_model=UserProfileOut)
def my_profile(
    response: Response,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> UserProfileOut:
    """마이페이지 "업체에게 이렇게 보여요" (AC-F5-16). 계약서 추가 요청 중 (#33)."""
    response.headers["Cache-Control"] = "no-store"
    return service.my_profile(db, user, now=now)


@router.patch("/me/profile", response_model=UserProfileOut)
def update_my_profile(
    body: MyProfileIn,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> UserProfileOut:
    """FR-PROFILE-02: 닉네임(409 NICKNAME_TAKEN)·프로필 사진 변경."""
    return service.update_my_profile(db, user, body, now=now)
