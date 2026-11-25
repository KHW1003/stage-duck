"""입점 신청 2단계 API (api-contract.md 2장, FR-SUP-02, 이슈 #26). 업체 역할(심사 중 포함 S*)만."""
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.supplier import Supplier
from app.models.user import User
from app.supplier import service, terms
from app.supplier.schemas import ApplicationIn, ApplicationOut, VenueIn, VenueListItem, VenueOut, VenuePage, VenuePublicOut

router = APIRouter(prefix="/supplier", tags=["supplier"])


class TermsReviewIn(BaseModel):
    version: str


class TermsReviewOut(BaseModel):
    version: str
    reviewed: bool


@router.get("/terms-review", response_model=TermsReviewOut)
def get_terms_review(user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)) -> TermsReviewOut:
    terms.require_approved(db, user)
    return TermsReviewOut(version=terms.TERMS_VERSION, reviewed=terms.review_status(db, user))


@router.put("/terms-review", response_model=TermsReviewOut)
def put_terms_review(
    body: TermsReviewIn, user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db),
) -> TermsReviewOut:
    terms.require_approved(db, user)
    terms.confirm_review(db, user, body.version)
    return TermsReviewOut(version=terms.TERMS_VERSION, reviewed=True)


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


@router.get("/venues", response_model=list[VenueOut])
def my_venues(user: User = Depends(require_role("SUPPLIER")), db: Session = Depends(get_db)) -> list[VenueOut]:
    """AC-F2-18 화면용: 내 공간 목록 (숨긴 공간 포함, 등록 순). 견적서 작성에서 공간을 고를 때 쓴다."""
    return [VenueOut.model_validate(v) for v in service.my_venues(db, user)]


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


# 공간 탐색 — 누구나 (api-contract.md GET /venues, FR-SPACE-03) ---------------------------------
venue_router = APIRouter(prefix="/venues", tags=["supplier"])


@venue_router.get("", response_model=VenuePage)
def list_venues(
    sido: str | None = None,
    sigungu: str | None = None,
    min_capacity: int | None = Query(None, alias="minCapacity", ge=1, le=500),
    venue_type: Literal["CONCERT_HALL", "CULTURE_SPACE", "ROOFTOP", "GARDEN", "WAREHOUSE", "ETC"] | None = Query(None, alias="type"),
    band_allowed: bool | None = Query(None, alias="bandAllowed"),
    sort: Literal["fee", "capacity", "latest", "views"] = "latest",
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> VenuePage:
    """AC-F5-01: 광주 / 80명 / 밴드 가능 → 공간 A·B·C. 예약 가능 여부는 업체 확인 전이에요."""
    rows, total = service.list_venues(
        db, sido=sido, sigungu=sigungu, min_capacity=min_capacity, venue_type=venue_type,
        band_allowed=band_allowed, sort=sort, page=page, size=size,
    )
    fields = [f for f in VenueListItem.model_fields if f != "company_name"]
    items = [VenueListItem(company_name=name, **{f: getattr(v, f) for f in fields}) for v, name in rows]
    return VenuePage(items=items, page=page, size=size, total=total)


@venue_router.get("/{venue_id}", response_model=VenuePublicOut)
def get_venue(venue_id: int, db: Session = Depends(get_db)) -> VenuePublicOut:
    """공간 상세 — 조건의 null 은 미확인. 업체 연락처는 없음 (결제 뒤 담당표에서만)."""
    venue, name = service.get_public_venue(db, venue_id)
    service.count_venue_view(db, venue)
    data = VenueOut.model_validate(venue).model_dump()
    return VenuePublicOut(**data, supplier_id=venue.supplier_id, company_name=name)
