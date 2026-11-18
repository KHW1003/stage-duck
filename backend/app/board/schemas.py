"""업체 찾기 요청·응답 (api-contract.md 5장 /pr-posts).

# 계약 예시 없음: 응답 칸은 FR-BOARD-01·02 목록 카드·상세 항목에서 정했다. 연락처·사업자 정보는 넣지 않는다 (CLAUDE.md 20).
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

PrCategory = Literal["VENUE", "EQUIPMENT", "ENGINEER"]


class PrPostIn(BaseModel):
    """FR-BOARD-02: 말머리 · 제목 · 소개 · 사진(최대 10) · 활동 지역 · 대표 가격대(선택)."""

    model_config = _IN

    category: PrCategory
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=5000)
    sido: str = Field(min_length=1, max_length=20)
    price_range: str | None = Field(default=None, max_length=50)
    file_ids: list[int] = Field(default_factory=list, max_length=10)


class PhotoOut(BaseModel):
    model_config = _OUT

    id: int
    url: str
    thumb_url: str


class PrPostItemOut(BaseModel):
    """목록 카드: 말머리, 대표 사진, 업체명, 제목, 활동 지역, 대표 가격대."""

    model_config = _OUT

    id: int
    category: str
    title: str
    supplier_id: int
    company_name: str
    sido: str
    price_range: str | None
    thumb_url: str | None
    bumped_at: datetime


class PrPostOut(BaseModel):
    model_config = _OUT

    id: int
    category: str
    title: str
    body: str
    photos: list[PhotoOut]
    supplier_id: int
    company_name: str
    sido: str
    price_range: str | None
    bumped_at: datetime
    created_at: datetime


class PrPostListOut(BaseModel):
    model_config = _OUT

    items: list[PrPostItemOut]
    page: int
    size: int
    total: int
