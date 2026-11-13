"""자동 검사 엔진 (FR-CHK, plan.md 5.4) — DB를 모르는 순수 함수.

약속한 모양(roles.md 3장, 이슈 #35)에 4번 목산이 T4-02(#47)에서 규칙 본문을 채웠다.
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

    AC-F3-20~24, FR-CHK. 세팅은 리허설 시작 전에 끝나고 철수는 공연 끝 뒤에 한다
    (입실 → 설치 → 리허설 → 공연 → 철수 → 퇴실).
    confirmed: 이미 확정된 앞 단계 견적서들 (장비 검사에 공연장 입실·퇴실 시각이 필요하다).
    쓰는 곳: 3번 컨펌 전(`has_conflict` 면 409 CHECK_CONFLICT), 4번 단계별 비교 화면(AC-F3-20~24).
    검사에 필요한 값이 비면 그 검사는 빼고 CHK-11 `확인 필요` 하나에 빠진 값을 모두 적는다.
    결과는 CHK 번호 순이다.
    """
    p, q = performance, quote
    out: list[CheckResult] = []
    missing: list[str] = []
    rehearsal, show_end = _min(p.rehearsal_start), _min(p.show_end)

    if q.stage_type == "VENUE":
        v = q.venue
        if v is None:
            missing.append("공간 정보")
        else:
            # CHK-01 인원
            if p.audience <= v.max_capacity:
                out.append(CheckResult("CHK-01", PASS, f"수용 인원 {v.max_capacity}명 ≥ 관객 {p.audience}명"))
            else:
                out.append(CheckResult("CHK-01", CONFLICT,
                                       f"관객 {p.audience}명이 수용 인원 {v.max_capacity}명보다 많아요."))
            # CHK-03 공간 조건 (True 있음 · False 없음 · None/키 없음 미확인)
            lacking = sorted(k for k in p.must_have if v.conditions.get(k) is False)
            unknown = sorted(k for k in p.must_have if v.conditions.get(k) is None)
            if lacking:
                out.append(CheckResult("CHK-03", CONFLICT, f"꼭 필요한 조건이 이 공간에 없어요: {', '.join(lacking)}."))
            elif unknown:
                out.append(CheckResult("CHK-03", NEEDS_INFO,
                                       f"꼭 필요한 조건을 아직 확인하지 못했어요: {', '.join(unknown)}. 채팅으로 물어봐 주세요."))
            else:
                out.append(CheckResult("CHK-03", PASS, "꼭 필요한 조건을 모두 갖췄어요."))
        # CHK-02 설치 가능 시간 = 장비 설치 가능 시각 ~ 리허설 시작
        if q.setup_available_time is None:
            missing.append("장비 설치 가능 시각")
        else:
            avail = _min(q.setup_available_time)
            gap = rehearsal - avail
            if gap < 0:
                msg = f"장비 설치 가능 시각({_hhmm(avail)})이 리허설({_hhmm(rehearsal)})보다 {-gap}분 늦어요."
            else:
                msg = f"설치에 쓸 수 있는 시간이 {gap}분이에요 (설치 가능 {_hhmm(avail)}, 리허설 {_hhmm(rehearsal)})."
            out.append(CheckResult("CHK-02", WARNING if gap < setup_warning_minutes else PASS, msg))

    elif q.stage_type == "EQUIPMENT":
        vq = next((c for c in confirmed if c.stage_type == "VENUE"), None)
        checkin = vq and (vq.checkin_time or (vq.venue and vq.venue.checkin_time))
        checkout = vq and vq.venue and vq.venue.checkout_time
        if not checkin:
            missing.append("공연장 입실 시각")
        if not checkout:
            missing.append("공연장 퇴실 마감")
        if q.setup_start is None:
            missing.append("설치 시작 시각")
        if q.setup_minutes is None:
            missing.append("설치 소요 시간")
        if q.teardown_minutes is None:
            missing.append("철수 소요 시간")
        # CHK-04 입실 → 설치
        if checkin and q.setup_start is not None:
            ci, ss = _min(checkin), _min(q.setup_start)
            if ci <= ss:
                out.append(CheckResult("CHK-04", PASS, f"입실 {_hhmm(ci)} 뒤에 설치를 시작해요 ({_hhmm(ss)})."))
            else:
                out.append(CheckResult("CHK-04", CONFLICT,
                                       f"설치 시작 {_hhmm(ss)}이 입실 {_hhmm(ci)}보다 {ci - ss}분 빨라요."))
        # CHK-05 설치 → 리허설
        if q.setup_start is not None and q.setup_minutes is not None:
            done = _min(q.setup_start) + q.setup_minutes
            if done <= rehearsal:
                out.append(CheckResult("CHK-05", PASS, f"설치가 {_hhmm(done)}에 끝나요 (리허설 {_hhmm(rehearsal)} 전)."))
            else:
                out.append(CheckResult("CHK-05", CONFLICT,
                                       f"설치가 {_hhmm(done)}에 끝나 리허설 {_hhmm(rehearsal)}보다 {done - rehearsal}분 늦어요."))
        # CHK-07 철수 → 퇴실
        if checkout and q.teardown_minutes is not None:
            end, co = show_end + q.teardown_minutes, _min(checkout)
            if end <= co:
                out.append(CheckResult("CHK-07", PASS, f"철수가 {_hhmm(end)}에 끝나요 (퇴실 {_hhmm(co)} 전)."))
            else:
                out.append(CheckResult("CHK-07", CONFLICT,
                                       f"철수가 {_hhmm(end)}에 끝나 퇴실 {_hhmm(co)}보다 {end - co}분 늦어요."))

    elif q.stage_type == "ENGINEER":
        # CHK-08 근무가 리허설 시작 ~ 공연 끝을 덮는가
        # shortcut: "철수 포함 조건"을 받는 칸이 없어 철수 시간은 보지 않는다. 칸이 생기면 끝 시각에 더한다.
        shifts = [s for s in q.staff if s.role == "ENGINEER"]
        if not shifts:
            missing.append("엔지니어 근무 시간")
        elif any(_min(s.start) <= rehearsal and _min(s.end) >= show_end for s in shifts):
            out.append(CheckResult("CHK-08", PASS,
                                   f"근무가 리허설 {_hhmm(rehearsal)} ~ 공연 끝 {_hhmm(show_end)}을 덮어요."))
        else:
            out.append(CheckResult("CHK-08", CONFLICT,
                                   f"근무 시간이 리허설 {_hhmm(rehearsal)} ~ 공연 끝 {_hhmm(show_end)}을 다 덮지 못해요."))
        out.append(check_engineer_duplicate(confirmed))

    # CHK-10 예산 (그 단계 예산이 없으면 하지 않는다)
    budget = p.budgets.get(q.stage_type)
    if budget is not None:
        if q.total_amount > budget:
            out.append(CheckResult("CHK-10", WARNING,
                                   f"견적 금액 {q.total_amount:,}원이 예산 {budget:,}원보다 {q.total_amount - budget:,}원 많아요."))
        else:
            out.append(CheckResult("CHK-10", PASS, f"견적 금액 {q.total_amount:,}원이 예산 {budget:,}원 안이에요."))
    # CHK-11 정보 누락
    if missing:
        out.append(CheckResult("CHK-11", NEEDS_INFO,
                               f"검사에 필요한 값이 비어 있어요: {', '.join(missing)}. 채팅으로 물어봐 주세요."))
    # CHK-12 이전 버전 기준
    if q.based_on_perf_version < p.version:
        out.append(CheckResult("CHK-12", WARNING,
                               f"요청서 v{q.based_on_perf_version} 기준 견적서예요 (지금 v{p.version}). 새 견적서를 요청해 주세요."))
    else:
        out.append(CheckResult("CHK-12", PASS, f"요청서 v{p.version} 기준 견적서예요."))
    return sorted(out, key=lambda r: r.id)


def check_engineer_duplicate(confirmed: Sequence[QuoteInput]) -> CheckResult:
    """AC-F3-23, CHK-09: 확정된 앞 단계 견적서에 엔지니어가 포함되면 `경고` + 건너뛰기 제안.

    엔지니어 견적서가 아직 없을 때([다음 단계로] 화면)도 이 함수만 부르면 된다.
    """
    if any(c.includes_engineer for c in confirmed):
        return CheckResult("CHK-09", WARNING,
                           "앞 단계 견적서에 엔지니어가 이미 포함되어 있어요. 엔지니어 단계를 건너뛸 수 있어요.")
    return CheckResult("CHK-09", PASS, "앞 단계 견적서에 엔지니어가 포함되어 있지 않아요.")


def _min(t: time) -> int:
    """시각 → 자정부터 지난 분."""
    return t.hour * 60 + t.minute


def _hhmm(m: int) -> str:
    # shortcut: 자정을 넘긴 철수 끝은 "24:30"처럼 보인다. 비교는 맞다. 밤샘 공연을 받게 되면 날짜를 더한다.
    return f"{m // 60:02d}:{m % 60:02d}"


def has_conflict(results: Sequence[CheckResult]) -> bool:
    """`충돌`이 하나라도 있으면 True — 컨펌할 수 없다 (constitution 5, plan.md 5.4)."""
    return any(r.result == CONFLICT for r in results)
