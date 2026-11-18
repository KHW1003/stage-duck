"""요청서 규칙 (DB를 모르는 순수 함수). 오늘 날짜는 인자로 받아 테스트에서 고정한다."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.models.request import AUDIENCE_MAX, AUDIENCE_MIN, PERFORMANCE_FORMS
from app.request.schemas import PerformanceIn

MIN_LEAD_DAYS = 14  # 공연 14일 전까지만 요청 (D-53)
TITLE_MAX = 100
NOTE_MAX = 500  # 단계별 추가 요청 (D-45)


def _err(field: str, reason: str) -> dict:
    return {"field": field, "reason": reason}


def earliest_show_date(today: date) -> date:
    """AC-F2-06: 11/12 기준 11/26부터 가능."""
    return today + timedelta(days=MIN_LEAD_DAYS)


def performance_field_errors(body: PerformanceIn, today: date, *, check_show_date: bool = True) -> list[dict]:
    """AC-F2-04·05·06·10: 저장하면 안 되는 입력을 칸마다 이유와 함께 돌려준다. 문제가 없으면 빈 목록.

    check_show_date=False: 수정에서 공연 날짜를 바꾸지 않았으면 14일 규칙을 보지 않는다 (#37).
    """
    errors: list[dict] = []
    if not body.title:
        errors.append(_err("title", "공연명을 적어 주세요."))
    elif len(body.title) > TITLE_MAX:
        errors.append(_err("title", f"공연명은 {TITLE_MAX}자까지 적을 수 있어요."))
    if body.form not in PERFORMANCE_FORMS:
        errors.append(_err("form", "공연 형태를 골라 주세요."))
    if check_show_date and body.show_date < earliest_show_date(today):
        first = earliest_show_date(today)
        errors.append(_err("showDate", f"공연 {MIN_LEAD_DAYS}일 전까지만 요청할 수 있어요. {first.month}월 {first.day}일 이후 날짜를 골라 주세요."))
    if not body.rehearsal_start < body.show_start:
        errors.append(_err("rehearsalStart", "리허설 시작은 공연 시작보다 빨라야 해요. 시각을 다시 확인해 주세요."))
    if not body.show_start < body.show_end:
        errors.append(_err("showEnd", "공연 종료는 공연 시작보다 늦어야 해요. 시각을 다시 확인해 주세요."))
    if not AUDIENCE_MIN <= body.audience <= AUDIENCE_MAX:
        errors.append(_err("audience", f"예상 관객은 {AUDIENCE_MIN}명에서 {AUDIENCE_MAX}명 사이로 적어 주세요."))
    if not body.sido:
        errors.append(_err("sido", "지역(시·도)을 골라 주세요."))
    if not body.sigungu:
        errors.append(_err("sigungu", "지역(시·군·구)을 골라 주세요."))

    needs = body.needs
    if needs.engineer.needed and not needs.engineer.tasks:
        errors.append(_err("needs.engineer.tasks", "엔지니어에게 맡길 작업을 하나 이상 골라 주세요."))
    for part in ("venue", "equipment", "engineer"):
        if len(getattr(needs, part).note) > NOTE_MAX:
            errors.append(_err(f"needs.{part}.note", f"추가 요청은 {NOTE_MAX}자까지 적을 수 있어요."))
    return errors


def stage_plan(needs: dict) -> list[tuple[str, int]]:
    """AC-F2-08: 필요하다고 한 단계만 (종류, 순서). 장비 "이미 있어요"(needed=false)면 장비 단계가 없다.

    순서는 종류마다 고정(공연장 1 · 장비 2 · 엔지니어 3)이라 빠진 단계가 있으면 번호가 건너뛴다.
    """
    plan = [("VENUE", 1), ("EQUIPMENT", 2), ("ENGINEER", 3)]
    keys = {"VENUE": "venue", "EQUIPMENT": "equipment", "ENGINEER": "engineer"}
    return [(stage_type, seq) for stage_type, seq in plan if needs[keys[stage_type]]["needed"]]


def needed_change_errors(old_needs: dict, body: PerformanceIn) -> list[dict]:
    """#37: 게시 뒤에는 단계 구성(필요해요/이미 있어요)을 바꿀 수 없다 — 이미 만든 단계와 어긋나지 않게."""
    return [
        _err(f"needs.{part}.needed", "게시한 뒤에는 필요해요/이미 있어요를 바꿀 수 없어요. 바꾸려면 공고를 내리고 새로 써 주세요.")
        for part in ("venue", "equipment", "engineer")
        if old_needs[part]["needed"] != getattr(body.needs, part).needed
    ]


def changed_fields(old: dict, new: dict) -> list[str]:
    """AC-F2-13: 이전 버전과 달라진 항목. STEP1 칸은 이름 그대로, STEP2 는 needs.<항목> 단위 (업체 화면 "v1 → v2")."""
    changed = [key for key in new if key != "needs" and old.get(key) != new[key]]
    old_needs, new_needs = old.get("needs", {}), new.get("needs", {})
    changed += [f"needs.{key}" for key in new_needs if old_needs.get(key) != new_needs[key]]
    return changed


OPEN_STAGE = ("OPEN", "NEGOTIATING")
DONE_STAGE = ("CONFIRMED", "SKIPPED")


def next_action(perf_status: str, stage_statuses: list[str]) -> tuple[str, int | None]:
    """AC-F5-02·NFR-UX-06: 내 공연의 "다음 할 일" 코드와 그 일이 걸린 단계 위치(배정 순서의 몇 번째, 없으면 None).

    PUBLISH 게시하기 · WAIT_QUOTES 견적서 기다리는 중 · NEGOTIATE 채팅으로 조율 중 · RECHECK 업체 재확인 대기 ·
    OPEN_NEXT [다음 단계로] · PAY [통합 결제하기] · DONE 끝 · NONE 할 일 없음(내림·취소). 화면 문구는 화면이 코드로 고른다.
    """
    if perf_status == "DRAFT":
        return "PUBLISH", None
    if perf_status in ("WITHDRAWN", "CANCELLED"):
        return "NONE", None
    if perf_status in ("CONFIRMED", "COMPLETED"):
        return "DONE", None
    if "RECHECK" in stage_statuses:
        return "RECHECK", stage_statuses.index("RECHECK")
    for i, status in enumerate(stage_statuses):
        if status in OPEN_STAGE:
            return ("WAIT_QUOTES" if status == "OPEN" else "NEGOTIATE"), i
    for i in range(len(stage_statuses) - 1, -1, -1):
        if stage_statuses[i] in DONE_STAGE and i + 1 < len(stage_statuses) and stage_statuses[i + 1] == "WAITING":
            return "OPEN_NEXT", i
    return "PAY", None


def performance_group(perf_status: str, show_date: date, today: date) -> str:
    """내 공연 묶음: draft 작성 중 · past 지난 공연(공연일이 지났거나 내림·취소·끝) · active 진행 중."""
    if perf_status == "DRAFT":
        return "draft"
    if perf_status in ("WITHDRAWN", "CANCELLED", "COMPLETED") or show_date < today:
        return "past"
    return "active"


# ---------------------------------------------------------------------------
# 반려 카운트·게시 제한 (FR-POL-02 · AC-F4-05·06, #39)
# ---------------------------------------------------------------------------

REJECTION_RESET = timedelta(days=180)  # 마지막 반려 후 이만큼 지나면 0
REJECTION_WAIT = timedelta(hours=24)  # 제한에 걸리면 마지막 반려 + 24시간 뒤에 게시
AFTER_CHAT_LIMIT = 5
NO_CHAT_LIMIT = 10


@dataclass(frozen=True)
class PostingLimit:
    after_chat: int
    no_chat: int
    limited: bool  # 지금 게시가 막혀 있는가
    available_at: datetime | None  # 제한에 걸린 경우 게시할 수 있는 시각


def posting_limit(events: list[tuple[str, datetime]], now: datetime) -> PostingLimit:
    """반려 기록 [(kind, 시각)] → 지금 카운트와 제한.

    카운트는 "마지막 반려 후 180일" 규칙으로 끊는다: 가장 최근부터 거슬러 올라가며 앞 반려와 180일 이상 벌어지면 거기서 멈춘다.
    지금이 마지막 반려 + 180일 이후면 0 (AC-F4-06). 채팅 반려 5회 또는 미응답 반려 10회부터,
    마지막 반려 + 24시간 전에는 게시할 수 없다 (AC-F4-05).
    """
    ordered = sorted(events, key=lambda e: e[1])
    if not ordered or now - ordered[-1][1] >= REJECTION_RESET:
        return PostingLimit(0, 0, False, None)
    run = [ordered[-1]]
    for event in reversed(ordered[:-1]):
        if run[-1][1] - event[1] >= REJECTION_RESET:
            break
        run.append(event)
    after_chat = sum(1 for kind, _ in run if kind == "AFTER_CHAT")
    no_chat = sum(1 for kind, _ in run if kind == "NO_CHAT")
    if after_chat < AFTER_CHAT_LIMIT and no_chat < NO_CHAT_LIMIT:
        return PostingLimit(after_chat, no_chat, False, None)
    available_at = ordered[-1][1] + REJECTION_WAIT
    return PostingLimit(after_chat, no_chat, now < available_at, available_at)

