"""quote_counts — 업체 사정 취소로 다시 모집 중인 단계 (2번 #40 내 공연 현황, D-57).

견적서는 CONFIRMED로 남지만 단계가 CONFIRMED·RECHECK가 아니면 세지 않는다 (단계별 비교 화면과 같은 기준).
"""
from sqlalchemy import select

from app.models.request import Stage
from app.models.supplier import Supplier
from app.quote import service as quote_service
from tests.f2.test_quotes import _as
from tests.f5.test_order import _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)


def _stages(db, perf_id):
    db.expire_all()
    return {s.stage_type: s for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}


def test_quote_counts_skips_supplier_cancelled_quote_after_reopen(client, db):
    """공연장 C 확정 → 업체 사정 취소 → 공연장 단계 다시 OPEN → 0건. 정상 확정된 장비 단계는 1건 그대로."""
    _, perf_id, (c, _) = _ready(client, db)
    res = _as(db, db.get(Supplier, c).user).post(
        f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "공간 누수"})
    assert res.status_code == 200, res.text

    stages = _stages(db, perf_id)
    assert stages["VENUE"].status == "OPEN"
    venue, equipment = stages["VENUE"].id, stages["EQUIPMENT"].id
    assert quote_service.quote_counts(db, [venue, equipment]) == {venue: 0, equipment: 1}


def test_quote_counts_counts_confirmed_stage_quote(client, db):
    """정상 확정: 견적서 CONFIRMED + 단계 CONFIRMED → 1건."""
    _, perf_id, _ = _ready(client, db)
    stages = _stages(db, perf_id)
    venue, equipment = stages["VENUE"].id, stages["EQUIPMENT"].id
    assert quote_service.quote_counts(db, [venue, equipment]) == {venue: 1, equipment: 1}
