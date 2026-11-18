"""F5 거래 이력 시간순 — AC-F5-13 (FR-ADMIN-02, T4-09 #54)."""

import pytest
from sqlalchemy import select

from app.admin.service import performance_history
from app.core.errors import AppError
from app.models import Stage
from tests.f2.test_posting import _fixed_today, _published  # noqa: F401  (오늘 날짜 고정 픽스처)


def test_ac_f5_13_history_in_time_order(client, db, admin_client):
    _, perf_id = _published(client, db)  # 게시하면 공연·단계 이력이 쌓인다
    stage = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "VENUE"))
    # 다른 공연의 이력은 섞이지 않는다
    _, other_id = _published(client, db)

    rows = performance_history(db, perf_id)
    assert rows, "게시 이력이 있어야 해요"
    keys = [(r.created_at, r.id) for r in rows]
    assert keys == sorted(keys)
    assert {r.entity_type for r in rows} <= {"performance", "stage", "quote"}
    assert any(r.entity_type == "performance" and r.entity_id == perf_id for r in rows)
    assert any(r.entity_type == "stage" and r.entity_id == stage.id for r in rows)
    assert not any(r.entity_type == "performance" and r.entity_id == other_id for r in rows)

    res = admin_client.get(f"/admin/performance-history?pk={perf_id}")
    assert res.status_code == 200 and f"공연 #{perf_id}" in res.text and "PUBLISHED" in res.text


def test_unknown_performance_is_not_found(db):
    with pytest.raises(AppError) as exc:
        performance_history(db, 999)
    assert exc.value.code == "NOT_FOUND"


def test_history_page_requires_admin_login(client, db):
    _, perf_id = _published(client, db)
    client.cookies.clear()
    res = client.get(f"/admin/performance-history?pk={perf_id}", follow_redirects=False)
    assert res.status_code in (302, 303)
