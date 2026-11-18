"""요청서 규칙 (DB를 모르는 순수 함수). 오늘 날짜는 인자로 받아 테스트에서 고정한다."""
from datetime import date, timedelta

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


def performance_field_errors(body: PerformanceIn, today: date) -> list[dict]:
    """AC-F2-04·05·06·10: 저장하면 안 되는 입력을 칸마다 이유와 함께 돌려준다. 문제가 없으면 빈 목록."""
    errors: list[dict] = []
    if not body.title:
        errors.append(_err("title", "공연명을 적어 주세요."))
    elif len(body.title) > TITLE_MAX:
        errors.append(_err("title", f"공연명은 {TITLE_MAX}자까지 적을 수 있어요."))
    if body.form not in PERFORMANCE_FORMS:
        errors.append(_err("form", "공연 형태를 골라 주세요."))
    if body.show_date < earliest_show_date(today):
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
