"""견적서 요청·응답 모양 (api-contract.md 3.3)."""
from datetime import date, datetime, time
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer
from pydantic.alias_generators import to_camel

# quote_versions.amount_* 칸이 INT UNSIGNED라서 그 최댓값까지 받는다 (data-model.md)
MAX_AMOUNT = 4_294_967_295


class QuoteAmounts(BaseModel):
    """AC-F2-17: 견적서 항목별 금액. 원 단위 정수(부가세 포함), 0 이상."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel, strict=True)

    items: int = Field(ge=0, le=MAX_AMOUNT)
    transport: int = Field(ge=0, le=MAX_AMOUNT)
    install: int = Field(ge=0, le=MAX_AMOUNT)
    labor: int = Field(ge=0, le=MAX_AMOUNT)
    etc: int = Field(ge=0, le=MAX_AMOUNT)


# ---------------------------------------------------------------------------
# 견적서 보내기·고치기·보기 (T3-01 #41, AC-F2-14~20)
# ---------------------------------------------------------------------------

_IN = ConfigDict(populate_by_name=True, alias_generator=to_camel, str_strip_whitespace=True)
_OUT = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

# 시각은 "17:00" 모양으로 내보낸다 (api-contract.md 1장)
HhMm = Annotated[time, PlainSerializer(lambda t: t.strftime("%H:%M"), return_type=str)]


class QuoteItemIn(BaseModel):
    """견적서 품목 한 줄 (data-model.md quote_versions.items)."""

    model_config = _IN

    name: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=20)
    qty: int = Field(ge=1)
    unit_price: int = Field(ge=0, le=MAX_AMOUNT)
    amount: int = Field(ge=0, le=MAX_AMOUNT)


class StaffIn(BaseModel):
    """투입 인력 한 줄 (quote_versions.staff, CHK-08)."""

    model_config = _IN

    role: str = Field(min_length=1, max_length=20)
    count: int = Field(ge=1)
    start: time
    end: time


class IncludesIn(BaseModel):
    """포함 항목. equipment && engineer 면 풀스펙 (AC-F2-19)."""

    model_config = _IN

    equipment: bool = False
    engineer: bool = False
    install: bool = False
    transport: bool = False


class QuoteBody(BaseModel):
    """견적서 내용 (api-contract.md 3.3 POST 본문). 공연장 견적서의 필수 칸은 서비스가 단계와 함께 본다."""

    model_config = _IN

    venue_id: int | None = None
    checkin_time: time | None = None
    setup_available_time: time | None = None
    items: list[QuoteItemIn] = Field(default_factory=list)
    staff: list[StaffIn] = Field(default_factory=list)
    setup_start: time | None = None
    setup_minutes: int | None = Field(default=None, ge=0, le=65535)
    teardown_minutes: int | None = Field(default=None, ge=0, le=65535)
    includes: IncludesIn = Field(default_factory=IncludesIn)
    amounts: QuoteAmounts
    discount_amount: int = Field(default=0, ge=0, le=MAX_AMOUNT)  # D-44, 생략하면 0
    total_amount: int = Field(ge=0, le=MAX_AMOUNT)
    extra_cost_note: str | None = Field(default=None, max_length=500)
    valid_until: date | None = None
    tech_note: str | None = None


class QuoteIn(QuoteBody):
    """POST /stages/{stageId}/quotes (api-contract.md 3.3). label 로 기본형·고급형을 나눈다 (D-6, AC-F2-16)."""

    label: str = Field(min_length=1, max_length=30)


class QuoteUpdateIn(QuoteBody):
    """PUT /quotes/{quoteId}: 견적서 내용 + 지금 버전 (api-contract.md 1장 버전 충돌). label 은 받지 않는다."""

    version: int = Field(ge=1)


class QuoteSentOut(BaseModel):
    """보내기·고치기 응답 (api-contract.md 3.3): { quoteId, version, chatRoomId, checks }."""

    model_config = _OUT

    quote_id: int
    version: int
    chat_room_id: int | None = None  # #42에서 채팅방 연결
    checks: list[dict] = Field(default_factory=list)  # 자동 검사 결과 (api-contract.md 4.1 checks[])


class QuoteVersionOut(BaseModel):
    """견적서 버전 하나. 연락처·실명은 넣지 않는다 (CLAUDE.md 20)."""

    model_config = _OUT

    version: int
    based_on_perf_version: int
    venue_id: int | None
    venue_snapshot: dict | None
    checkin_time: HhMm | None
    setup_available_time: HhMm | None
    setup_start: HhMm | None
    setup_minutes: int | None
    teardown_minutes: int | None
    staff: list[dict]
    items: list[dict]
    includes_equipment: bool
    includes_engineer: bool
    includes_install: bool
    includes_transport: bool
    amount_items: int
    amount_transport: int
    amount_install: int
    amount_labor: int
    amount_etc: int
    discount_amount: int
    total_amount: int
    extra_cost_note: str | None
    valid_until: date | None
    tech_note: str | None
    created_at: datetime


class QuoteOut(BaseModel):
    """GET /quotes/{quoteId}: 계약서에 예시가 없어 정한 모양 — 견적서 + 현재 버전 + 이력 (AC-F2-20)."""

    model_config = _OUT

    quote_id: int
    stage_id: int
    supplier_id: int
    label: str
    status: str
    is_full_spec: bool
    current_version: int
    current: QuoteVersionOut
    versions: list[QuoteVersionOut]
    # 내역서 화면(문서·인쇄)에 쓰는 읽기 전용 칸 — 연락처·실명은 넣지 않는다 (CLAUDE.md 20)
    stage_type: str = ""
    performance_id: int = 0
    performance_title: str = ""
    show_date: date | None = None
    company_name: str = ""
    checks: list[dict] = Field(default_factory=list)  # 현재 버전의 자동 검사 (api-contract.md 4.1 checks[])


# ---------------------------------------------------------------------------
# 공고 목록·상세 (T3-01 #41, AC-F2-11·12·14, AC-F3-01·03, AC-F4-07, AC-F5-12)
# 사용자 연락처·실명·이메일, 다른 업체의 견적서는 넣지 않는다 (CLAUDE.md 20, AC-F2-14·F5-12).
# ---------------------------------------------------------------------------


class PostingOut(BaseModel):
    """GET /postings 한 줄. 사용자는 닉네임과 반려·이용 횟수만 보인다 (AC-F4-07)."""

    model_config = _OUT

    stage_id: int
    performance_id: int
    stage_type: str
    status: str
    performance_version: int
    title: str
    show_date: date
    sido: str
    sigungu: str
    nickname: str | None
    rejection_count: int
    usage_count: int


class PreviousStageOut(BaseModel):
    """앞 단계 확정 정보 (AC-F3-03). 확정 견적서 버전에서 읽는다. 전원은 전용 칸이 없어 tech_note 로 보여 준다."""

    model_config = _OUT

    stage_type: str
    venue_snapshot: dict | None
    checkin_time: HhMm | None
    setup_available_time: HhMm | None
    items: list[dict]
    tech_note: str | None


class PostingDetailOut(PostingOut):
    """GET /postings/{stageId}: 공고 상세 + 앞 단계 확정 정보."""

    form: str
    rehearsal_start: HhMm
    show_start: HhMm
    show_end: HhMm
    audience: int
    needs: dict
    previous_stages: list[PreviousStageOut]
