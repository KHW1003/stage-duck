"""시연 계정 전환 요청·응답 (api-contract.md /dev/switch-account).

응답에 이름·이메일·전화번호를 넣지 않는다 (CLAUDE.md 20).
"""
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SwitchAccountIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    user_id: int = Field(ge=1)


class SwitchAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    id: int
    role: str
    nickname: str | None
    supplier_review_status: str | None
