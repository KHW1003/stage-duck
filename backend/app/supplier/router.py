"""입점 신청 2단계 API (api-contract.md 2장, FR-SUP-02, 이슈 #26). 업체 역할(심사 중 포함 S*)만."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.supplier import Supplier
from app.models.user import User
from app.supplier import service
from app.supplier.schemas import ApplicationIn, ApplicationOut, VenueIn, VenueOut

router = APIRouter(prefix="/supplier", tags=["supplier"])


def _out(s: Supplier) -> ApplicationOut:
    return ApplicationOut(
        business_type=s.business_type,
        company_name=s.company_name,
        representative_name=s.representative_name,
        business_reg_no=s.business_reg_no,
        business_address=s.business_address,
        main_phone=s.main_phone,
        mail_order_no=s.mail_order_no,
        categories=sorted(c.category for c in s.categories),
        review_status=s.review_status,
        reject_reason=s.reject_reason,
        applied_at=s.created_at,
    )


@router.post("/application", response_model=ApplicationOut, status_code=status.HTTP_201_CREATED)
def apply(body: ApplicationIn, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)) -> ApplicationOut:
    """AC-F1-17·18: 입점 신청 → 심사 중. 체크섬이 틀린 사업자번호는 400 INVALID_BUSINESS_NO."""
    return _out(service.apply(db, user, body))


@router.get("/application", response_model=ApplicationOut)
def get_application(user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)) -> ApplicationOut:
    """AC-F1-20: 심사 상태·반려 사유. 신청 전이면 404."""
    return _out(service.get_application(db, user))


@router.put("/application", response_model=ApplicationOut)
def update_application(
    body: ApplicationIn, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)
) -> ApplicationOut:
    """AC-F1-20: 반려된 신청을 고쳐서 다시 신청."""
    return _out(service.update_application(db, user, body))


@router.post("/venues", response_model=VenueOut, status_code=status.HTTP_201_CREATED)
def create_venue(body: VenueIn, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)) -> VenueOut:
    """AC-F2-01·02: 승인된 공연장 업체의 공간 등록."""
    return VenueOut.model_validate(service.create_venue(db, user, body))


@router.put("/venues/{venue_id}", response_model=VenueOut)
def update_venue(
    venue_id: int, body: VenueIn, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)
) -> VenueOut:
    """AC-F2-03: 공간 수정 (이미 보낸 견적서·확정 공연의 스냅샷은 그대로). 남의 공간은 404."""
    return VenueOut.model_validate(service.update_venue(db, user, venue_id, body))
