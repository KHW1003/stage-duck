"""기술 확인 요청·응답 (api-contract.md 4.5). 화면 모양은 frontend/src/features/tech/api.ts 와 같다."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class TechCheckIn(BaseModel):
    model_config = _IN

    item: str | None = None
    detail: str | None = None
    owner_supplier_id: int | None = None


class TechAnswerIn(BaseModel):
    model_config = _IN

    answer: str | None = None
    memo: str | None = None


class TechCheckOut(BaseModel):
    model_config = _OUT

    id: int
    item: str
    detail: str | None
    owner_supplier_id: int
    owner_label: str
    mine: bool
    answer: str
    memo: str | None
    answered_at: datetime | None


class PerformanceBrief(BaseModel):
    model_config = _OUT

    id: int
    title: str
    show_date: date
    status_label: str


class SupplierBrief(BaseModel):
    model_config = _OUT

    supplier_id: int
    name: str


class OwnerOption(BaseModel):
    model_config = _OUT

    supplier_id: int
    label: str


class TechCheckListOut(BaseModel):
    model_config = _OUT

    performance: PerformanceBrief
    creator: SupplierBrief | None
    can_add: bool
    owners: list[OwnerOption]
    items: list[TechCheckOut]
