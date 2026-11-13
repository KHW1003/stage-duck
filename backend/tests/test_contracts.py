"""묶음 사이 약속 함수의 모양 검사 (roles.md 3장, 이슈 #35).

각 묶음이 서로의 함수를 믿고 동시에 개발할 수 있게, **이름·인자·돌려주는 칸**이 바뀌면 이 테스트가 실패한다.
약속을 바꾸려면 쓰는 쪽과 합의한 뒤 이 테스트도 같은 PR에서 고친다 (테스트만 고쳐서 통과시키지 않는다).
본문 구현 여부는 검사하지 않는다 — 구현은 각 묶음 이슈에서 한다.
"""
import inspect
from dataclasses import fields

import pytest

from app.check import calc
from app.policy import service as policy
from app.request import service as request
from app.supplier import service as supplier


def _params(fn) -> list[tuple[str, str]]:
    return [(p.name, p.kind.name) for p in inspect.signature(fn).parameters.values()]


def _field_names(cls) -> list[str]:
    return [f.name for f in fields(cls)]


POS, KW = "POSITIONAL_OR_KEYWORD", "KEYWORD_ONLY"


@pytest.mark.parametrize(
    ("fn", "expected"),
    [
        # 1 → 2
        (supplier.get_venue_snapshot, [("db", POS), ("venue_id", POS)]),
        (supplier.can_send_quotes, [("supplier", POS)]),
        # 2 → 1·3·4
        (request.get_open_stage, [("db", POS), ("performance_id", POS)]),
        (request.stage_confirmed, [("db", POS), ("stage_id", POS), ("quote_version_id", POS), ("actor_id", KW)]),
        (request.confirmed_lines, [("db", POS), ("performance_id", POS)]),
        # 4 → 3
        (calc.run_checks, [("performance", POS), ("quote", POS), ("confirmed", POS), ("setup_warning_minutes", KW)]),
        (calc.has_conflict, [("results", POS)]),
        # 4 → 1·3
        (policy.warn, [("db", POS), ("user_id", POS), ("actor_id", KW), ("reason", KW), ("report_id", KW)]),
        (policy.report, [("db", POS), ("reporter_id", KW), ("target_type", KW), ("target_id", KW), ("reason", KW)]),
        (policy.blind_post, [("db", POS), ("post_id", POS), ("actor_id", KW), ("reason", KW)]),
    ],
    ids=lambda v: getattr(v, "__qualname__", ""),
)
def test_contract_function_signatures(fn, expected):
    assert _params(fn) == expected


@pytest.mark.parametrize(
    ("cls", "expected"),
    [
        (supplier.VenueSnapshot, ["venue_id", "name", "sido", "sigungu", "venue_type", "max_capacity",
                                  "checkin_time", "checkout_time", "has_resident_engineer", "conditions"]),
        (request.OpenStage, ["stage_id", "performance_id", "stage_type", "status", "performance_version"]),
        (request.ConfirmedLine, ["stage_id", "stage_type", "supplier_id", "quote_version_id", "amount"]),
        (calc.CheckResult, ["id", "result", "message"]),
    ],
    ids=lambda v: getattr(v, "__name__", ""),
)
def test_contract_return_shapes(cls, expected):
    assert _field_names(cls) == expected


def test_check_levels_match_api_contract():
    """api-contract.md 4.1 / StatusBadge 와 같은 네 값."""
    assert calc.LEVELS == ("PASS", "NEEDS_INFO", "CONFLICT", "WARNING")


def test_has_conflict_only_on_conflict():
    ok = [calc.CheckResult("CHK-01", calc.PASS, ""), calc.CheckResult("CHK-02", calc.WARNING, "")]
    assert not calc.has_conflict(ok)
    assert not calc.has_conflict([])
    assert calc.has_conflict(ok + [calc.CheckResult("CHK-05", calc.CONFLICT, "")])


def test_stage_order_is_venue_equipment_engineer():
    """constitution 3: 배정 순서는 공연장 → 장비 → 엔지니어."""
    assert request.STAGE_TYPES == ("VENUE", "EQUIPMENT", "ENGINEER")
