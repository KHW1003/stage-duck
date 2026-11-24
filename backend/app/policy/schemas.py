"""신고 요청·응답 (api-contract.md POST /reports)."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)


class ReportIn(BaseModel):
    model_config = _IN

    target_type: Literal["CHAT_ROOM", "PR_POST", "FREE_POST", "FREE_COMMENT", "USER"]
    target_id: int = Field(ge=1)
    reason: str = Field(max_length=500)


class ReportOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    id: int
