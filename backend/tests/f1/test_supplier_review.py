"""F1 업체 심사 — AC-F1-19, AC-F1-20 (서비스 + SQLAdmin 액션)."""
import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models import StatusHistory, Supplier
from app.supplier import service
from tests.conftest import make_supplier


def _history(db, supplier_id):
    return db.scalars(
        select(StatusHistory).where(StatusHistory.entity_type == "supplier", StatusHistory.entity_id == supplier_id)
    ).all()


def test_ac_f1_19_approve_opens_supplier_and_records_history(db, admin_user):
    s = make_supplier(db)

    service.approve(db, s.id, actor_id=admin_user.id)

    db.refresh(s)
    assert s.review_status == "APPROVED"
    assert s.approved_at is not None
    assert service.can_send_quotes(s)
    [h] = _history(db, s.id)
    assert (h.from_status, h.to_status, h.actor_user_id) == ("PENDING", "APPROVED", admin_user.id)


def test_ac_f1_20_reject_keeps_reason_and_allows_resubmit(db, admin_user):
    s = make_supplier(db)

    service.reject(db, s.id, actor_id=admin_user.id, reason="사업자등록증 이미지가 흐려요")
    db.refresh(s)
    assert s.review_status == "REJECTED"
    assert s.reject_reason == "사업자등록증 이미지가 흐려요"
    assert not service.can_send_quotes(s)

    service.resubmit(db, s.id, actor_id=s.user_id)
    db.refresh(s)
    assert s.review_status == "PENDING"


def test_ac_f1_20_reject_requires_reason(db, admin_user):
    s = make_supplier(db)
    with pytest.raises(AppError) as exc:
        service.reject(db, s.id, actor_id=admin_user.id, reason="  ")
    assert exc.value.code == "VALIDATION_FAILED"


def test_invalid_transition_is_refused(db, admin_user):
    s = make_supplier(db, review_status="APPROVED")
    with pytest.raises(AppError) as exc:
        service.reject(db, s.id, actor_id=admin_user.id, reason="이미 승인됨")
    assert exc.value.code == "INVALID_STATE"


def test_suspend_and_unsuspend(db, admin_user):
    s = make_supplier(db, review_status="APPROVED")
    service.suspend(db, s.id, actor_id=admin_user.id, reason="허위 정보")
    db.refresh(s)
    assert s.review_status == "SUSPENDED" and not service.can_send_quotes(s)
    service.unsuspend(db, s.id, actor_id=admin_user.id)
    db.refresh(s)
    assert s.review_status == "APPROVED" and s.reject_reason is None


# ---- SQLAdmin 화면을 통한 처리 ----

def test_ac_f1_19_admin_approve_action(admin_client, db):
    s = make_supplier(db)

    res = admin_client.get(f"/admin/supplier/action/approve?pks={s.id}", follow_redirects=False)

    assert res.status_code == 302
    db.expire_all()
    assert db.get(Supplier, s.id).review_status == "APPROVED"


def test_ac_f1_20_admin_reject_action_with_reason_form(admin_client, db):
    s = make_supplier(db)

    form_page = admin_client.get(f"/admin/supplier/action/reject?pks={s.id}")
    assert form_page.status_code == 200 and "업체 반려" in form_page.text

    res = admin_client.post(
        f"/admin/reason?op=supplier_reject&pks={s.id}&back=supplier", data={"reason": "주소 확인 불가"}, follow_redirects=False
    )
    assert res.status_code == 302
    db.expire_all()
    s = db.get(Supplier, s.id)
    assert (s.review_status, s.reject_reason) == ("REJECTED", "주소 확인 불가")
