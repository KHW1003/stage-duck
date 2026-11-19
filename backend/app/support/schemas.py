"""공지사항·1:1 문의 요청·응답 (api-contract.md GET /notices · /notices/{id}, /inquiries)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)
_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)


class InquiryIn(BaseModel):
    """POST·PUT /inquiries (FR-CS-01): 유형 5개, 제목 50자, 내용 2,000자, 사진 3장까지 (먼저 POST /files purpose INQUIRY)."""

    model_config = _IN

    category: Literal["PAYMENT", "QUOTE", "SUPPLIER", "ACCOUNT", "ETC"]
    performance_id: int | None = None
    title: str = Field(min_length=1, max_length=50)
    body: str = Field(min_length=1, max_length=2000)
    file_ids: list[int] = Field(default_factory=list, max_length=3)


class InquiryPhoto(BaseModel):
    model_config = _OUT

    id: int
    url: str  # 비공개 파일 — 본인·관리자만 열린다


class InquiryItem(BaseModel):
    model_config = _OUT

    id: int
    category: str
    title: str
    status: str  # WAITING 답변 대기 · ANSWERED 답변 완료
    created_at: datetime


class InquiryOut(InquiryItem):
    performance_id: int | None
    body: str
    answer: str | None
    answered_at: datetime | None
    updated_at: datetime
    photos: list[InquiryPhoto]


class NoticeItem(BaseModel):
    model_config = _OUT

    id: int
    category: str
    title: str
    is_pinned: bool
    published_at: datetime


class NoticePage(BaseModel):
    model_config = _OUT

    items: list[NoticeItem]
    page: int
    total_pages: int
    total: int


class NoticeNeighbor(BaseModel):
    model_config = _OUT

    id: int
    title: str
    published_at: datetime


class NoticeDetail(NoticeItem):
    body: str
    prev: NoticeNeighbor | None  # 이전 글 (바로 먼저 올린 글)
    next: NoticeNeighbor | None  # 다음 글 (바로 나중에 올린 글)
