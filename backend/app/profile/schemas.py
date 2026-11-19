"""프로필 요청·응답 (api-contract.md 5장 /suppliers/{id}/profile, /users/{id}/profile, /me/profile, #33).

연락처(전화·이메일·이름·생년월일)와 사업자 정보(대표자·사업자번호·주소)는 넣지 않는다 (CLAUDE.md 20).
# 계약 예시 없음: 응답 칸은 FR-PROFILE-01·02 와 목업 supplier.html·mypage.html 에서 정했다.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.board.schemas import PrPostItemOut
from app.supplier.schemas import VenueListItem

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class SupplierProfileOut(BaseModel):
    """AC-F5-15: 상호·대표 이미지·승인 부문·소개·설치/철수·엔지니어 경력·신뢰 지표·입점일·소개 글·등록 공간."""

    model_config = _OUT

    id: int
    company_name: str
    image_url: str | None
    categories: list[str]
    intro: str | None
    setup_minutes: int | None
    teardown_minutes: int | None
    engineer_years: int | None
    band_experience: bool | None
    has_liability_insurance: bool | None
    sound_certification: str | None
    joined_at: datetime
    posts: list[PrPostItemOut]
    venues: list[VenueListItem]


class UserProfileOut(BaseModel):
    """AC-F5-16: 닉네임·프로필 사진·가입일·이용 횟수·반려 횟수만."""

    model_config = _OUT

    id: int
    nickname: str | None
    profile_image_url: str | None
    joined_at: datetime
    usage_count: int
    rejection_count: int


class MyProfileIn(BaseModel):
    """PATCH /me/profile — 보낸 칸만 바꾼다. profileFileId 에 null 을 보내면 사진을 뺀다."""

    model_config = _IN

    nickname: str | None = Field(default=None, max_length=30)
    profile_file_id: int | None = None
