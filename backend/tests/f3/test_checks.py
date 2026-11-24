"""F3 자동 검사 엔진 — AC-F3-20~24 (CHK-01~12, CHK-06 없음). 값은 docs/guides/시연_예시값.md."""
from datetime import time

import pytest

from app.check.calc import (
    CONFLICT, NEEDS_INFO, PASS, WARNING, PerformanceInput, QuoteInput, StaffShift,
    check_engineer_duplicate, has_conflict, run_checks,
)
from app.supplier.service import VenueSnapshot

PERF = PerformanceInput(version=1, audience=80, rehearsal_start=time(17), show_start=time(19), show_end=time(21),
                        must_have=frozenset({"BAND_ALLOWED"}), budgets={"VENUE": 600000, "EQUIPMENT": 1500000})


def venue(capacity=120, conditions=None):
    return VenueSnapshot(venue_id=1, name="공간 C", sido="광주", sigungu="동구", venue_type="CULTURE_SPACE",
                         max_capacity=capacity, checkin_time=time(15), checkout_time=time(23),
                         has_resident_engineer=False, conditions=conditions or {"BAND_ALLOWED": True})


def venue_quote(setup_available, amount=500000, **kw):
    return QuoteInput(stage_type="VENUE", based_on_perf_version=1, total_amount=amount, venue=venue(**kw),
                      checkin_time=time(15), setup_available_time=setup_available)


def quote_d(setup_start=time(15), setup_minutes=90, version=1, amount=1250000):
    return QuoteInput(stage_type="EQUIPMENT", based_on_perf_version=version, total_amount=amount,
                      setup_start=setup_start, setup_minutes=setup_minutes, teardown_minutes=60,
                      includes_equipment=True, includes_engineer=True)


def by_id(results):
    return {r.id: r for r in results}


def test_ac_f3_20_venue_compare_b_warning_c_pass():
    b = by_id(run_checks(PERF, venue_quote(time(17), amount=400000)))
    c = by_id(run_checks(PERF, venue_quote(time(15))))
    assert b["CHK-02"].result == WARNING and "0분" in b["CHK-02"].message
    assert c["CHK-02"].result == PASS and "120분" in c["CHK-02"].message
    assert c["CHK-01"].result == PASS and c["CHK-03"].result == PASS


@pytest.mark.parametrize(("avail", "level"), [(time(16, 1), WARNING), (time(16), PASS), (time(18), WARNING)])
def test_ac_f3_20_chk02_boundary_60_minutes(avail, level):
    assert by_id(run_checks(PERF, venue_quote(avail)))["CHK-02"].result == level


def test_ac_f3_20_chk02_threshold_is_argument():
    assert by_id(run_checks(PERF, venue_quote(time(15)), setup_warning_minutes=121))["CHK-02"].result == WARNING


def test_ac_f3_21_c_plus_d_pass():
    r = by_id(run_checks(PERF, quote_d(), [venue_quote(time(15))]))
    assert r["CHK-05"].result == PASS and "16:30" in r["CHK-05"].message
    assert r["CHK-04"].result == PASS and r["CHK-07"].result == PASS
    assert not has_conflict(r.values())


def test_ac_f3_22_b_plus_d_conflict_90_minutes_late():
    r = run_checks(PERF, quote_d(setup_start=time(17)), [venue_quote(time(17), amount=400000)])
    chk05 = by_id(r)["CHK-05"]
    assert chk05.result == CONFLICT and "18:30" in chk05.message and "90분 늦어요" in chk05.message
    assert has_conflict(r)


def test_ac_f3_22_chk05_boundary_done_at_rehearsal_passes():
    r = by_id(run_checks(PERF, quote_d(setup_minutes=120), [venue_quote(time(15))]))
    assert r["CHK-05"].result == PASS


def test_ac_f3_23_engineer_included_warns_and_suggests_skip():
    confirmed = [venue_quote(time(15)), quote_d()]
    dup = check_engineer_duplicate(confirmed)
    assert dup.result == WARNING and "건너뛸" in dup.message
    eng = QuoteInput(stage_type="ENGINEER", based_on_perf_version=1, total_amount=300000,
                     staff=[StaffShift("ENGINEER", 1, time(17), time(21))])
    r = by_id(run_checks(PERF, eng, confirmed))
    assert r["CHK-09"].result == WARNING and r["CHK-08"].result == PASS
    assert check_engineer_duplicate([venue_quote(time(15))]).result == PASS


def test_ac_f3_24_rehearsal_change_conflict_then_fixed_quote_passes():
    c = venue_quote(time(15))
    assert by_id(run_checks(PERF, quote_d(), [c]))["CHK-05"].result == PASS
    v2 = PerformanceInput(version=2, audience=80, rehearsal_start=time(16), show_start=time(19), show_end=time(21),
                          must_have=PERF.must_have, budgets=PERF.budgets)
    r = by_id(run_checks(v2, quote_d(), [c]))
    assert r["CHK-05"].result == CONFLICT and "30분 늦어요" in r["CHK-05"].message
    assert r["CHK-12"].result == WARNING  # 견적서가 v1 기준
    fixed = by_id(run_checks(v2, quote_d(setup_minutes=45, version=2, amount=1350000), [c]))
    assert fixed["CHK-05"].result == PASS and "15:45" in fixed["CHK-05"].message
    assert fixed["CHK-12"].result == PASS


def test_ac_f3_20_chk01_chk03_conflict_and_needs_info():
    r = by_id(run_checks(PERF, venue_quote(time(15), capacity=79, conditions={"BAND_ALLOWED": False})))
    assert r["CHK-01"].result == CONFLICT and r["CHK-03"].result == CONFLICT
    assert by_id(run_checks(PERF, venue_quote(time(15), conditions={"BAND_ALLOWED": None})))["CHK-03"].result == NEEDS_INFO
    assert by_id(run_checks(PERF, venue_quote(time(15), capacity=80)))["CHK-01"].result == PASS


def test_ac_f3_21_missing_values_give_one_chk11_and_skip_dependent_checks():
    e = QuoteInput(stage_type="EQUIPMENT", based_on_perf_version=1, total_amount=1000000)
    r = by_id(run_checks(PERF, e, [venue_quote(time(15))]))
    assert r["CHK-11"].result == NEEDS_INFO and "설치 시작 시각" in r["CHK-11"].message
    assert not {"CHK-04", "CHK-05", "CHK-07"} & r.keys()


def test_ac_f3_21_chk04_chk07_conflict_and_chk10_budget_warning():
    r = by_id(run_checks(PERF, QuoteInput(stage_type="EQUIPMENT", based_on_perf_version=1, total_amount=1500001,
                                          setup_start=time(14), setup_minutes=60, teardown_minutes=121),
                         [venue_quote(time(15))]))
    assert r["CHK-04"].result == CONFLICT and r["CHK-07"].result == CONFLICT
    assert r["CHK-10"].result == WARNING


def test_ac_f3_23_chk08_shift_not_covering_is_conflict():
    eng = QuoteInput(stage_type="ENGINEER", based_on_perf_version=1, total_amount=300000,
                     staff=[StaffShift("ENGINEER", 1, time(17, 1), time(21))])
    assert by_id(run_checks(PERF, eng))["CHK-08"].result == CONFLICT


def test_ac_f3_20_results_sorted_and_deterministic():
    a = run_checks(PERF, venue_quote(time(17)))
    assert a == run_checks(PERF, venue_quote(time(17)))
    assert [x.id for x in a] == sorted(x.id for x in a)
