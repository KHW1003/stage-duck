"""공지사항 응답 (api-contract.md GET /notices · /notices/{id})."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


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
