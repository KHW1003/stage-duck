"""입점 신청 요청·응답 (api-contract.md 2장 POST·GET·PUT /supplier/application).

칸은 모두 비어도 받는다 — 빈 칸·형식 검사는 calc.application_field_errors 가 칸마다 한국어 이유로 돌려준다.
"""
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class ApplicationIn(BaseModel):
    model_config = _IN

    business_type: str | None = None
    company_name: str | None = None
    representative_name: str | None = None
    business_reg_no: str | None = None
    business_address: str | None = None
    main_phone: str | None = None
    mail_order_no: str | None = None  # 통신판매업 신고번호. null = 해당 없음
    categories: list[str] | None = None


class ApplicationOut(BaseModel):
    """본인 업체의 신청 내용과 심사 상태 (AC-F1-20: 반려 사유). 사업자 정보는 본인·관리자만 본다."""

    model_config = _OUT

    business_type: str
    company_name: str
    representative_name: str
    business_reg_no: str | None
    business_address: str | None
    main_phone: str
    mail_order_no: str | None
    categories: list[str]
    review_status: str
    reject_reason: str | None
    applied_at: datetime


# 공간 등록·수정 (api-contract.md POST·PUT /supplier/venues, FR-SPACE-01) -------------------------
class VenueEquipmentIn(BaseModel):
    model_config = _IN

    category: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=999)


class VenueIn(BaseModel):
    """조건 칸(band_allowed 등)은 비우면 None = 미확인 (CHK-03 에서 확인 필요)."""

    model_config = _IN

    name: str = Field(min_length=1, max_length=100)
    sido: str = Field(min_length=1, max_length=20)
    sigungu: str = Field(min_length=1, max_length=30)
    address: str = Field(min_length=1, max_length=255)
    venue_type: Literal["CONCERT_HALL", "CULTURE_SPACE", "ROOFTOP", "GARDEN", "WAREHOUSE", "ETC"]
    max_capacity: int = Field(ge=1, le=500)  # AC-F2-01
    checkin_time: time
    checkout_time: time
    rental_fee: int = Field(ge=0, le=100_000_000)
    has_resident_engineer: bool = False
    band_allowed: bool | None = None
    external_equipment_allowed: bool | None = None
    external_engineer_allowed: bool | None = None
    has_waiting_room: bool | None = None
    has_stage_platform: bool | None = None
    has_parking: bool | None = None
    hall_registered: bool | None = None
    equipment: list[VenueEquipmentIn] = Field(default_factory=list, max_length=50)


class VenueEquipmentOut(BaseModel):
    model_config = _OUT

    category: str
    name: str
    quantity: int


class VenueListItem(BaseModel):
    """공간 탐색 목록 한 줄 (FR-SPACE-03). 예약 가능 여부는 업체 확인 전이라 보여 주지 않는다 (constitution 5)."""

    model_config = _OUT

    id: int
    name: str
    company_name: str
    sido: str
    sigungu: str
    venue_type: str
    max_capacity: int
    rental_fee: int
    has_resident_engineer: bool
    band_allowed: bool | None
    # 목록 카드의 "15:00 입실"과 조건 필터(외부 장비·외부 엔지니어·대기실·주차)에 쓴다 (목업 spaces.html)
    checkin_time: time
    external_equipment_allowed: bool | None
    external_engineer_allowed: bool | None
    has_waiting_room: bool | None
    has_parking: bool | None


class VenuePage(BaseModel):
    model_config = _OUT

    items: list[VenueListItem]
    page: int
    size: int
    total: int


class VenueOut(BaseModel):
    model_config = _OUT

    id: int
    name: str
    sido: str
    sigungu: str
    address: str
    venue_type: str
    max_capacity: int
    checkin_time: time
    checkout_time: time
    rental_fee: int
    has_resident_engineer: bool
    band_allowed: bool | None
    external_equipment_allowed: bool | None
    external_engineer_allowed: bool | None
    has_waiting_room: bool | None
    has_stage_platform: bool | None
    has_parking: bool | None
    hall_registered: bool | None
    status: str
    equipment: list[VenueEquipmentOut]


class VenuePublicOut(VenueOut):
    """공간 상세 (GET /venues/{id}). 조건 칸의 null 은 '미확인'으로 보여 준다. 업체 연락처는 넣지 않는다 (CLAUDE.md 20)."""

    supplier_id: int
    company_name: str
