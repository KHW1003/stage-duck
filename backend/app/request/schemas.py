"""공연 요청서 요청·응답 (api-contract.md 3.2 POST /performances, POST /performances/{id}/publish).

형식(날짜·시각·숫자)만 여기서 보고, 범위·순서·14일 같은 규칙은 calc.performance_field_errors 가 칸마다 이유를 돌려준다.
"""
from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)


class LineupIn(BaseModel):
    model_config = _IN

    part: str
    count: int = Field(ge=1)


class ItemIn(BaseModel):
    model_config = _IN

    name: str
    qty: int = Field(ge=1)


class OwnedIn(BaseModel):
    model_config = _IN

    name: str
    detail: str = ""


class VenueNeedIn(BaseModel):
    model_config = _IN

    needed: bool
    proposal_wanted: bool = False
    types: list[str] = []
    capacity: int | None = None
    budget: int | None = Field(default=None, ge=0)
    checkin_wish: str | None = None
    checkout_wish: str | None = None
    must_have: list[str] = []
    note: str = ""


class EquipmentNeedIn(BaseModel):
    """AC-F2-09: 장비 목록에 기본값이 없다 — items 는 빈 목록으로 시작한다."""

    model_config = _IN

    needed: bool
    proposal_wanted: bool = False
    items: list[ItemIn] = []
    services: list[str] = []
    budget: int | None = Field(default=None, ge=0)
    owned: list[OwnedIn] = []
    note: str = ""


class EngineerNeedIn(BaseModel):
    model_config = _IN

    needed: bool
    tasks: list[str] = []
    conditions: list[str] = []
    etc: str = ""
    note: str = ""


class NeedsIn(BaseModel):
    """STEP2 (data-model.md performances.needs)."""

    model_config = _IN

    venue: VenueNeedIn
    equipment: EquipmentNeedIn
    engineer: EngineerNeedIn
    owned_venue: dict | None = None


class PerformanceIn(BaseModel):
    """STEP1 + STEP2."""

    model_config = _IN

    title: str
    form: str
    lineup: list[LineupIn] = []
    show_date: date
    rehearsal_start: time
    show_start: time
    show_end: time
    audience: int
    sido: str
    sigungu: str
    contact_phone: str | None = None
    needs: NeedsIn


class PerformanceCreatedOut(BaseModel):
    """계약서에 응답 예시가 없어 정한 모양: 만든 요청서 번호·상태·버전."""

    model_config = _OUT

    id: int
    status: str
    current_version: int


class StageOut(BaseModel):
    model_config = _OUT

    id: int
    stage_type: str
    seq: int
    status: str


class PublishOut(BaseModel):
    model_config = _OUT

    id: int
    status: str
    stages: list[StageOut]
