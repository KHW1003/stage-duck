"""공연 요청서 요청·응답 (api-contract.md 3.2 POST /performances, POST /performances/{id}/publish).

형식(날짜·시각·숫자)만 여기서 보고, 범위·순서·14일 같은 규칙은 calc.performance_field_errors 가 칸마다 이유를 돌려준다.
"""
from datetime import date, datetime, time
from typing import Literal

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


class SkipAckIn(BaseModel):
    """건너뛰기 책임 고지 동의 (FR-ASSIGN-03). acknowledgement = "STAGE_SKIP_OWNED", noticeVersion = 안내 문구 버전."""

    model_config = _IN

    acknowledgement: str | None = None
    notice_version: str | None = Field(default=None, max_length=10)


class AdvanceIn(SkipAckIn):
    """[다음 단계로] (api-contract.md 4.3). SKIP_NEXT 일 때만 동의가 필요하다."""

    action: Literal["OPEN_NEXT", "SKIP_NEXT"]


class StageRefOut(BaseModel):
    model_config = _OUT

    stage_id: int
    stage_type: str
    status: str


class AdvanceOut(BaseModel):
    """계약서에 예시가 없어 정한 모양: 지금 단계 + 다음 단계 + 요청서 상태."""

    model_config = _OUT

    stage_id: int
    stage_type: str
    status: str
    performance_status: str
    next: StageRefOut


class StageSummaryOut(BaseModel):
    model_config = _OUT

    id: int
    stage_type: str
    seq: int
    status: str
    quote_count: int | None = None  # 받은 견적서 수 — 3번 quote_counts 를 연결하기 전까지 null


class PerformanceSummaryOut(BaseModel):
    """내 공연 한 건 (AC-F5-02). 연락처는 넣지 않는다 (CLAUDE.md 20)."""

    model_config = _OUT

    id: int
    title: str
    form: str
    status: str
    show_date: date
    rehearsal_start: time
    show_start: time
    show_end: time
    audience: int
    sido: str
    sigungu: str
    current_version: int
    stages: list[StageSummaryOut]
    next_action: str  # PUBLISH · WAIT_QUOTES · NEGOTIATE · RECHECK · OPEN_NEXT · PAY · DONE · NONE
    next_stage_id: int | None


class MyPerformancesOut(BaseModel):
    model_config = _OUT

    active: list[PerformanceSummaryOut]
    draft: list[PerformanceSummaryOut]
    past: list[PerformanceSummaryOut]


class PerformanceDetailOut(PerformanceSummaryOut):
    """내 공연 상세 = 현재 버전 전체 (요청서 수정 화면이 채워 쓴다). 전화번호는 있다/없다만."""

    lineup: list[dict]
    needs: dict
    has_contact_phone: bool
    published_at: datetime | None


class VersionOut(BaseModel):
    model_config = _OUT

    version: int
    changed_fields: list[str]
    created_at: datetime
