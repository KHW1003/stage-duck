"""F4 업체 소개 글 블라인드·해제 — AC-F4-03·10 (D-32, T4-09 #54)."""
import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models import Sanction, StatusHistory, User
from app.policy import service
from tests.conftest import login_as, make_supplier
from tests.f4.test_pr_posts import _body, _post


@pytest.fixture
def supplier(db):
    return make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))


def test_ac_f4_03_blind_post_warns_supplier_once(db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    service.blind_post(db, post.id, actor_id=admin_user.id, reason="연락처 노출")
    db.expire_all()
    assert (post.status, post.blind_reason) == ("BLINDED", "연락처 노출")
    assert db.get(User, supplier.user_id).warning_count == 1
    warn = db.scalar(select(Sanction).where(Sanction.user_id == supplier.user_id))
    assert warn.type == "WARNING" and "연락처 노출" in warn.reason
    hist = db.scalar(select(StatusHistory).where(StatusHistory.entity_type == "pr_post"))
    assert (hist.from_status, hist.to_status, hist.actor_user_id) == ("ACTIVE", "BLINDED", admin_user.id)


def test_ac_f4_08_third_blind_suspends_supplier(db, admin_user):
    s = make_supplier(db, review_status="APPROVED", categories=("VENUE", "EQUIPMENT", "ENGINEER"))
    for cat in ("VENUE", "EQUIPMENT", "ENGINEER"):
        service.blind_post(db, _post(db, s, cat).id, actor_id=admin_user.id, reason="외부 거래 유도")
    db.expire_all()
    assert db.get(User, s.user_id).status == "SUSPENDED"


def test_ac_f4_10_blinded_category_blocks_new_post_until_unblind(client, db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    service.blind_post(db, post.id, actor_id=admin_user.id, reason="연락처 노출")
    owner = login_as(client, supplier.user)
    res = owner.post("/api/v1/pr-posts", json=_body("EQUIPMENT"))
    assert res.status_code == 409 and res.json()["code"] == "BLINDED_POST_EXISTS"

    service.unblind_post(db, post.id, actor_id=admin_user.id)
    db.expire_all()
    assert (post.status, post.blind_reason) == ("ACTIVE", None)
    assert db.get(User, supplier.user_id).warning_count == 1  # 경고는 그대로
    hist = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "pr_post")).all()
    assert [(h.from_status, h.to_status) for h in hist] == [("ACTIVE", "BLINDED"), ("BLINDED", "ACTIVE")]


@pytest.mark.parametrize(("fn", "status"), [("blind_post", "BLINDED"), ("blind_post", "DELETED"), ("unblind_post", "ACTIVE")])
def test_wrong_state_is_rejected(db, admin_user, supplier, fn, status):
    post = _post(db, supplier, "EQUIPMENT", status=status)
    kw = {"reason": "사유"} if fn == "blind_post" else {}
    with pytest.raises(AppError) as exc:
        getattr(service, fn)(db, post.id, actor_id=admin_user.id, **kw)
    assert exc.value.code == "INVALID_STATE"


def test_blind_needs_reason_and_existing_post(db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    with pytest.raises(AppError) as exc:
        service.blind_post(db, post.id, actor_id=admin_user.id, reason="  ")
    assert exc.value.code == "VALIDATION_FAILED"
    for fn, kw in (("blind_post", {"reason": "사유"}), ("unblind_post", {})):
        with pytest.raises(AppError) as exc:
            getattr(service, fn)(db, 999, actor_id=admin_user.id, **kw)
        assert exc.value.code == "NOT_FOUND"


def test_admin_blind_and_unblind_actions(admin_client, db, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    res = admin_client.post(f"/admin/reason?op=pr_post_blind&pks={post.id}&back=pr-post", data={"reason": "연락처 노출"},
                            follow_redirects=False)
    assert res.status_code == 302
    db.expire_all()
    assert post.status == "BLINDED"
    assert admin_client.get(f"/admin/pr-post/action/unblind?pks={post.id}", follow_redirects=False).status_code == 302
    db.expire_all()
    assert post.status == "ACTIVE"
