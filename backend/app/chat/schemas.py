"""채팅 요청·응답 모양 (api-contract.md 채팅). 연락처·실명은 넣지 않는다 (CLAUDE.md 3장 20)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.chat.calc import attachment_url

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class MessageIn(BaseModel):
    """AC-F3-06·08·15: 메시지 보내기. IMAGE·FILE 은 먼저 POST /files (purpose CHAT) 로 올린 fileId 를 붙인다."""

    model_config = _IN

    type: Literal["TEXT", "IMAGE", "FILE"]
    body: str | None = None
    file_id: int | None = Field(default=None, ge=1)
    reply_to_id: int | None = Field(default=None, ge=1)  # 답장할 메시지 (같은 방만, 11/24)


class MessageEditIn(BaseModel):
    """메시지 수정 (11/24): 내가 보낸 글 메시지만."""

    model_config = _IN

    body: str = Field(min_length=1, max_length=2000)


class ReadIn(BaseModel):
    """AC-F3-08: 여기까지 읽었어요."""

    model_config = _IN

    last_message_id: int = Field(ge=1)


REPLY_PREVIEW = 80  # 답장 인용에 보이는 원문 글자 수


class ReplyRefOut(BaseModel):
    """답장 인용: 원래 메시지 번호·보낸 사람·종류·앞부분만 (11/24)."""

    model_config = _OUT

    id: int
    type: str
    sender_user_id: int | None
    body: str | None
    deleted: bool = False  # 원래 메시지가 지워졌으면 body 없이 "삭제된 메시지"

    @model_validator(mode="after")
    def _preview(self) -> "ReplyRefOut":
        if self.deleted:
            self.body = None
        elif self.body and len(self.body) > REPLY_PREVIEW:
            self.body = self.body[:REPLY_PREVIEW] + "…"
        return self


class MessageOut(BaseModel):
    model_config = _OUT

    id: int
    type: str
    body: str | None
    sender_user_id: int | None  # NULL = 시스템 메시지
    ref_id: int | None  # QUOTE 이면 quote_version_id
    contact_warning: bool  # AC-F3-15
    created_at: datetime
    file_id: int | None = Field(default=None, exclude=True)
    attachment_url: str | None = None  # IMAGE·FILE 이면 /api/v1/files/{id} (그 방 참여자만 열림)
    reply_to: ReplyRefOut | None = None  # 답장이면 원래 메시지 (11/24)
    edited_at: datetime | None = None  # 수정한 시각 (11/24)
    deleted: bool = False  # 지운 메시지 — body·첨부 없음 (11/24)

    @model_validator(mode="after")
    def _attachment(self) -> "MessageOut":
        self.attachment_url = attachment_url(self.file_id)
        return self


class MessagesOut(BaseModel):
    model_config = _OUT

    messages: list[MessageOut]
    partner_last_read_message_id: int | None  # AC-F3-08: 상대가 어디까지 읽었는지


class LastMessageOut(BaseModel):
    model_config = _OUT

    id: int
    type: str
    body: str | None
    created_at: datetime
    deleted: bool = False


class RoomOut(BaseModel):
    """AC-F3-26·27: 채팅 목록 한 줄. partnerName 은 업체 상호 또는 사용자 닉네임 (실명 아님)."""

    model_config = _OUT

    room_id: int
    stage_id: int
    stage_type: str
    performance_id: int
    partner_name: str
    started_at: datetime | None
    pinned_at: datetime | None
    unread_count: int
    last_message: LastMessageOut | None
    latest_quote_version_id: int | None = None  # 그 방의 가장 최근 견적서 버전 → [견적서 보기] (11/25)


class PinOut(BaseModel):
    model_config = _OUT

    room_id: int
    pinned_at: datetime


class StartOut(BaseModel):
    model_config = _OUT

    room_id: int
    started_at: datetime
