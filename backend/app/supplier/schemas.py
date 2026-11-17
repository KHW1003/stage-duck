"""입점 신청 요청·응답 (api-contract.md 2장 POST·GET·PUT /supplier/application).

칸은 모두 비어도 받는다 — 빈 칸·형식 검사는 calc.application_field_errors 가 칸마다 한국어 이유로 돌려준다.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class ApplicationIn(BaseModel):
    model_config = _IN

    business_type: str | None = None
    company_name: str | None = None
    representative_name: str | None = None
    business_reg_no: str | None = None
    business_address: str | None = None
    main_phone: str | None = None
    mail_order_no: str | None = None  # 통신판매업 신고번호. null = 해당 없음
    categories: list[str] | None = None


class ApplicationOut(BaseModel):
    """본인 업체의 신청 내용과 심사 상태 (AC-F1-20: 반려 사유). 사업자 정보는 본인·관리자만 본다."""

    model_config = _OUT

    business_type: str
    company_name: str
    representative_name: str
    business_reg_no: str | None
    business_address: str | None
    main_phone: str
    mail_order_no: str | None
    categories: list[str]
    review_status: str
    reject_reason: str | None
    applied_at: datetime
