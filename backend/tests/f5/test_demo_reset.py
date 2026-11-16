"""시연 데이터 초기화 — AC-F5-14 (FR-DEMO-01~02)."""
from datetime import datetime

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.errors import AppError
from app.demo.service import reset_demo, seed_demo
from app.models import Sanction, Supplier, User
from tests.conftest import make_supplier, make_user

NOW = datetime(2026, 11, 13, 12, 0)


def _count(db, model) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


@pytest.fixture
def prod_env(monkeypatch):
    monkeypatch.setattr(get_settings(), "app_env", "prod")


def test_ac_f5_14_reset_refused_in_prod_settings(db, prod_env):
    make_supplier(db)
    with pytest.raises(AppError) as exc:
        reset_demo(db, NOW)
    assert exc.value.status == 404
    assert _count(db, Supplier) == 1  # 아무것도 지워지지 않았다


def test_ac_f5_14_admin_demo_tool_blocked_in_prod_settings(admin_client, db, prod_env):
    make_supplier(db)
    assert admin_client.get("/admin/demo").status_code == 403
    assert admin_client.post("/admin/demo").status_code == 403
    assert "시연 도구" not in admin_client.get("/admin/").text
    assert _count(db, Supplier) == 1


def test_ac_f5_14_reset_in_test_env_restores_seed_and_keeps_admin(admin_client, admin_user, db):
    seed_demo(db, NOW)
    extra = make_supplier(db, company_name="지울업체")
    db.add(Sanction(user_id=extra.user_id, type="WARNING", reason="테스트", created_by=admin_user.id))
    db.commit()

    res = admin_client.post("/admin/demo", follow_redirects=False)
    assert res.status_code == 302

    names = set(db.scalars(select(Supplier.company_name)))
    assert names == {f"업체 {k}" for k in "ABCDEFG"}
    assert _count(db, Sanction) == 0
    assert db.scalar(select(User).where(User.email == "admin@stageduck.test")) is not None
    assert db.scalar(select(User).where(User.email == "host@stageduck.test")) is not None
    d = db.scalar(select(Supplier).where(Supplier.company_name == "업체 D"))
    assert d.review_status == "APPROVED" and d.setup_minutes == 90
    assert {c.category for c in d.categories} == {"EQUIPMENT", "INSTALL", "ENGINEER"}


def test_ac_f5_14_demo_tool_needs_admin_login(client, db):
    make_user(db, role="USER", password="user-pass-1234", email="u@stageduck.test")
    seed_demo(db, NOW)
    # 로그인 안 함 → 로그인 화면으로 보낸다
    assert client.post("/admin/demo", follow_redirects=False).status_code == 302
    # 관리자가 아닌 계정은 관리자 로그인 실패
    res = client.post("/admin/login", data={"username": "u@stageduck.test", "password": "user-pass-1234"}, follow_redirects=False)
    assert res.status_code == 400
    assert client.post("/admin/demo", follow_redirects=False).status_code == 302
    assert _count(db, Supplier) == 7  # 그대로
