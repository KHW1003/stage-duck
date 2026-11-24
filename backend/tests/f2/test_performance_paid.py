"""약속 함수 performance_paid (4 → 2): 테스트 결제가 성공하면 공연이 섭외 확정(CONFIRMED)이 되고 다음 할 일이 DONE (AC-F5-02·06)."""
import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models.history import StatusHistory
from app.models.request import Performance
from app.request import service
from tests.f2.test_posting import _fixed_today, _published, _set_stages  # noqa: F401  (_fixed_today: 오늘 날짜 고정)


def _awaiting(client, db) -> tuple:
    user, perf_id = _published(client, db)
    _set_stages(db, perf_id, VENUE="CONFIRMED", EQUIPMENT="SKIPPED", ENGINEER="SKIPPED")
    perf = db.get(Performance, perf_id)
    perf.status = "AWAITING_PAYMENT"
    db.commit()
    return user, perf_id


def test_paid_moves_awaiting_payment_to_confirmed_and_next_action_done(client, db):
    user, perf_id = _awaiting(client, db)
    assert user.get(f"/api/v1/performances/{perf_id}").json()["nextAction"] == "PAY"

    service.performance_paid(db, perf_id, actor_id=None)
    db.commit()

    db.expire_all()
    assert db.get(Performance, perf_id).status == "CONFIRMED"
    history = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "performance", StatusHistory.entity_id == perf_id)).all()
    assert ("AWAITING_PAYMENT", "CONFIRMED") in [(h.from_status, h.to_status) for h in history]
    assert user.get(f"/api/v1/performances/{perf_id}").json()["nextAction"] == "DONE"


def test_paid_twice_is_harmless(client, db):
    _, perf_id = _awaiting(client, db)
    service.performance_paid(db, perf_id, actor_id=None)
    db.commit()
    service.performance_paid(db, perf_id, actor_id=None)  # 같은 결제 결과가 다시 와도 그대로
    db.commit()
    db.expire_all()
    assert db.get(Performance, perf_id).status == "CONFIRMED"


def test_paid_before_all_stages_done_is_invalid_state(client, db):
    _, perf_id = _published(client, db)  # 아직 PUBLISHED
    with pytest.raises(AppError) as err:
        service.performance_paid(db, perf_id, actor_id=None)
    assert err.value.code == "INVALID_STATE"


def test_paid_unknown_performance_is_not_found(db):
    with pytest.raises(AppError) as err:
        service.performance_paid(db, 999999, actor_id=None)
    assert err.value.code == "NOT_FOUND"
