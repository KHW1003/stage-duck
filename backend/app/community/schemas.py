"""커뮤니티 글 요청·응답 (api-contract.md 7장 free-posts).

글쓰기 본문의 사진은 `fileIds`(업로드 API로 먼저 올린 파일 id) — uploads.md 의 "저장할 때 fileIds만 보낸다"를 따른다.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class FreePostIn(BaseModel):
    """칸 검사(말머리·길이)는 service 가 칸마다 한국어 이유로 돌려준다."""

    model_config = _IN

    category: str = ""
    title: str = ""
    body: str = ""
    file_ids: list[int] = []


class AuthorOut(BaseModel):
    """작성자 표시: 사용자는 닉네임, 업체는 상호 + "업체" (AC-F4-14). 연락처·실명은 넣지 않는다."""

    model_config = _OUT

    name: str
    kind: Literal["USER", "SUPPLIER"]


class FreePostSummaryOut(BaseModel):
    model_config = _OUT

    id: int
    category: str
    title: str
    author: AuthorOut
    view_count: int
    comment_count: int
    helpful_count: int
    has_photos: bool
    created_at: datetime


class FreePostPageOut(BaseModel):
    model_config = _OUT

    items: list[FreePostSummaryOut]
    total: int
    page: int
    page_size: int


class CommentOut(BaseModel):
    """댓글·답글. 삭제·블라인드면 body 는 null (블라인드는 작성자에게만 본문·사유). 업체 회원은 상호로."""

    model_config = _OUT

    id: int
    author: AuthorOut
    body: str | None
    status: str
    blind_reason: str | None
    is_post_author: bool  # "글쓴이" 표시
    is_mine: bool
    helpful_count: int
    my_helpful: bool
    created_at: datetime
    replies: list["CommentOut"] = []


class CommentSavedOut(CommentOut):
    contact_warning: bool


class CommentIn(BaseModel):
    model_config = _IN

    body: str = ""
    parent_id: int | None = None


class HelpfulIn(BaseModel):
    model_config = _IN

    target_type: Literal["POST", "COMMENT"]
    target_id: int


class HelpfulOut(BaseModel):
    model_config = _OUT

    helpful_count: int


class FreePostOut(FreePostSummaryOut):
    """글 보기. 사진은 지금 파일 id만 (주소는 1번 files 함수가 생기면 붙인다). 방문자면 my* 는 false."""

    body: str
    photo_ids: list[int]
    status: str
    blind_reason: str | None
    prev_id: int | None
    next_id: int | None
    is_mine: bool
    updated_at: datetime
    comments: list[CommentOut] = []
    my_helpful: bool = False
    bookmarked: bool = False


class FreePostSavedOut(FreePostOut):
    contact_warning: bool  # 연락처·계좌 모양이 있으면 저장은 하고 경고만 (FR-CHAT-06 과 같은 패턴)
