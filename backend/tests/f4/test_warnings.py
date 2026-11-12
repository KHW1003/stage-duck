"""F4 경고·정지 — AC-F4-08."""
import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models import Sanction, StatusHistory, User
from app.policy import service
from app.supplier.service import can_send_quotes
from tests.conftest import make_supplier, make_user


def test_ac_f4_08_third_warning_suspends_and_blocks_quotes(db, admin_user):
    supplier = make_supplier(db, review_status="APPROVED")
    user_id = supplier.user_id

    service.warn(db, user_id, actor_id=admin_user.id, reason="외부 거래 유도 1")
    service.warn(db, user_id, actor_id=admin_user.id, reason="외부 거래 유도 2")
    db.refresh(supplier.user)
    assert supplier.user.status == "ACTIVE" and can_send_quotes(supplier)

    service.warn(db, user_id, actor_id=admin_user.id, reason="외부 거래 유도 3")

    db.expire_all()
    user = db.get(User, user_id)
    assert user.warning_count == 3
    assert user.status == "SUSPENDED"
    db.refresh(supplier)
    assert not can_send_quotes(supplier)
    types = [s.type for s in db.scalars(select(Sanction).where(Sanction.user_id == user_id).order_by(Sanction.id))]
    assert types == ["WARNING", "WARNING", "WARNING", "SUSPENSION"]
    [h] = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "user")).all()
    assert (h.from_status, h.to_status) == ("ACTIVE", "SUSPENDED")


def test_warning_requires_reason(db, admin_user):
    user = make_user(db)
    with pytest.raises(AppError):
        service.warn(db, user.id, actor_id=admin_user.id, reason="")


def test_suspended_user_cannot_be_warned_again(db, admin_user):
    user = make_user(db, status="SUSPENDED")
    with pytest.raises(AppError) as exc:
        service.warn(db, user.id, actor_id=admin_user.id, reason="추가 경고")
    assert exc.value.code == "INVALID_STATE"


def test_ac_f4_08_admin_warn_action(admin_client, db):
    user = make_user(db)
    for i in range(3):
        res = admin_client.post(
            f"/admin/reason?op=user_warn&pks={user.id}&back=user", data={"reason": f"신고 처리 {i + 1}"}, follow_redirects=False
        )
        assert res.status_code == 302
    db.expire_all()
    assert db.get(User, user.id).status == "SUSPENDED"
