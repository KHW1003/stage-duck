"""채팅 요청·응답 모양 (api-contract.md 채팅). 연락처·실명은 넣지 않는다 (CLAUDE.md 3장 20)."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class MessageIn(BaseModel):
    """AC-F3-06·08·15: 메시지 보내기. IMAGE·FILE은 다음 PR에서 받는다 (지금은 서비스가 400)."""

    model_config = _IN

    type: Literal["TEXT", "IMAGE", "FILE"]
    body: str | None = None
    file_id: int | None = Field(default=None, ge=1)


class ReadIn(BaseModel):
    """AC-F3-08: 여기까지 읽었어요."""

    model_config = _IN

    last_message_id: int = Field(ge=1)


class MessageOut(BaseModel):
    model_config = _OUT

    id: int
    type: str
    body: str | None
    sender_user_id: int | None  # NULL = 시스템 메시지
    ref_id: int | None  # QUOTE 이면 quote_version_id
    contact_warning: bool  # AC-F3-15
    created_at: datetime


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


class PinOut(BaseModel):
    model_config = _OUT

    room_id: int
    pinned_at: datetime


class StartOut(BaseModel):
    model_config = _OUT

    room_id: int
    started_at: datetime
