"""자동 검사 엔진 (FR-CHK, plan.md 5.4) — DB를 모르는 순수 함수.

지금은 **약속한 모양만** 있다 (roles.md 3장, 이슈 #35). 규칙 본문은 4번 목산이 T4-02(#47)에서 채운다.
입력 모양(PerformanceInput·QuoteInput)은 4번이 필요에 따라 칸을 더해도 된다. 단 이름을 바꾸거나 빼려면
쓰는 쪽(3번 채은: 컨펌 전 검사)과 먼저 합의한다.

규칙 목록 (요구사항 명세서 3.8): CHK-01 인원, 02 설치 가능 시간(기준 60분), 03 공간 조건, 04 입실→설치,
05 설치→리허설, 07 철수→퇴실, 08 엔지니어 근무, 09 엔지니어 중복, 10 예산, 11 정보 누락, 12 이전 버전 기준.
CHK-06(수량)은 없다.
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import time

from app.supplier.service import VenueSnapshot

PASS = "PASS"
NEEDS_INFO = "NEEDS_INFO"  # 확인 필요
CONFLICT = "CONFLICT"  # 충돌 — 하나라도 있으면 컨펌할 수 없다
WARNING = "WARNING"  # 경고 — 컨펌은 되지만 한 번 더 묻는다
LEVELS = (PASS, NEEDS_INFO, CONFLICT, WARNING)


@dataclass(frozen=True)
class CheckResult:
    """검사 하나의 결과. API 응답의 checks[] 한 칸과 같다 (api-contract.md 4.1)."""

    id: str  # "CHK-02"
    result: str  # PASS · NEEDS_INFO · CONFLICT · WARNING
    message: str  # 화면에 그대로 보여 줄 한국어 문장 (해요체)


@dataclass(frozen=True)
class StaffShift:
    role: str  # ENGINEER 등
    count: int
    start: time
    end: time


@dataclass(frozen=True)
class PerformanceInput:
    """검사에 필요한 요청서 값 (지금 버전)."""

    version: int
    audience: int
    rehearsal_start: time
    show_start: time
    show_end: time
    must_have: frozenset[str] = frozenset()  # STEP2 공연장 꼭 필요한 조건 (BAND_ALLOWED 등)
    budgets: Mapping[str, int] = field(default_factory=dict)  # 단계별 예산 {"VENUE": 600000, ...}


@dataclass(frozen=True)
class QuoteInput:
    """검사에 필요한 견적서 버전 값. 확정된 앞 단계 견적서도 같은 모양으로 넘긴다."""

    stage_type: str  # VENUE · EQUIPMENT · ENGINEER
    based_on_perf_version: int
    total_amount: int
    venue: VenueSnapshot | None = None  # 공연장 견적서만
    checkin_time: time | None = None
    setup_available_time: time | None = None  # 공연장: 장비 설치 가능 시작 시각 (CHK-02)
    setup_start: time | None = None
    setup_minutes: int | None = None
    teardown_minutes: int | None = None
    staff: Sequence[StaffShift] = ()
    includes_equipment: bool = False
    includes_engineer: bool = False


def run_checks(
    performance: PerformanceInput,
    quote: QuoteInput,
    confirmed: Sequence[QuoteInput] = (),
    *,
    setup_warning_minutes: int = 60,
) -> list[CheckResult]:
    """[약속 4 → 3] 견적서 하나를 검사한다. 같은 입력이면 언제나 같은 결과 (DB에 저장하지 않는다).

    confirmed: 이미 확정된 앞 단계 견적서들 (장비 검사에 공연장 입실·퇴실 시각이 필요하다).
    쓰는 곳: 3번 컨펌 전(`has_conflict` 면 409 CHECK_CONFLICT), 4번 단계별 비교 화면(AC-F3-20~24).
    구현: 4번 목산 — T4-02 (#47).
    """
    raise NotImplementedError("4번 묶음 T4-02(#47)에서 구현한다")


def has_conflict(results: Sequence[CheckResult]) -> bool:
    """`충돌`이 하나라도 있으면 True — 컨펌할 수 없다 (constitution 5, plan.md 5.4)."""
    return any(r.result == CONFLICT for r in results)
