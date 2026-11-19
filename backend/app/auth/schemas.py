"""가입·로그인·내 정보 요청·응답 (api-contract.md 2장 F1 회원·인증).

가입 칸은 일부러 모두 비어도 받는다 — 빈 칸 검사는 서비스(calc.signup_field_errors)가 하고, 칸마다 한국어 이유를 돌려준다 (AC-F1-01).
"""
from datetime import date

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class AgreementsIn(BaseModel):
    model_config = _IN

    service: bool = False
    privacy_required: bool = False
    privacy_optional: bool = False
    marketing: bool = False


class SignupIn(BaseModel):
    model_config = _IN

    name: str | None = None
    phone: str | None = None
    email: str | None = None
    birth_date: date | None = None
    nickname: str | None = None
    password: str | None = Field(default=None, json_schema_extra={"format": "password"})
    signup_purpose: str | None = None
    musician_type: str | None = None
    signup_channel: str | None = None
    agreements: AgreementsIn = Field(default_factory=AgreementsIn)


class SupplierSignupIn(BaseModel):
    """FR-SUP-01 업체 1단계. 업체는 이메일로만 가입한다 (담당자 한 명이 계정을 쓴다)."""

    model_config = _IN

    email: str | None = None
    password: str | None = Field(default=None, json_schema_extra={"format": "password"})
    name: str | None = None  # 담당자 이름
    phone: str | None = None  # 담당자 전화
    agreements: AgreementsIn = Field(default_factory=AgreementsIn)


class LoginIn(BaseModel):
    model_config = _IN

    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class PasswordResetIn(BaseModel):
    """AC-F1-21. 이메일 형식이 틀려도 같은 202 — 가입 여부를 알려 주지 않는다."""

    model_config = _IN

    email: str = Field(min_length=1, max_length=255)


class PasswordResetOut(BaseModel):
    """시연용 링크는 테스트 환경에서만 (D-55). 운영·로컬은 null."""

    model_config = _OUT

    demo_link: str | None = None


class PasswordResetConfirmIn(BaseModel):
    model_config = _IN

    token: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200, json_schema_extra={"format": "password"})


class AuthOut(BaseModel):
    """가입·로그인 응답. 연락처는 넣지 않는다 (CLAUDE.md 20)."""

    model_config = _OUT

    id: int
    role: str
    nickname: str | None
    landing: str


class MeOut(BaseModel):
    """GET /me — 본인 정보라 이름·이메일·전화번호를 돌려준다 (CLAUDE.md 20의 예외)."""

    model_config = _OUT

    id: int
    role: str
    status: str
    email: str
    name: str
    phone: str
    nickname: str | None
    supplier_review_status: str | None
    landing: str
