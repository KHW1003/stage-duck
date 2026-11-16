"""개발용 가짜 로그인 — AC-F1-16 (FR-AUTH-08, 이슈 #22)."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.auth.tokens import ACCESS_COOKIE, CSRF_COOKIE, read_access_token
from app.core.config import get_settings
from app.core.errors import AppError
from app.demo.service import seed_demo
from app.dev.service import switch_account
from app.main import create_app
from app.models import User
from tests.conftest import make_supplier, make_user

URL = "/api/v1/dev/switch-account"
NOW = datetime(2026, 11, 13, 12, 0)


def _set_cookie_headers(res) -> dict[str, str]:
    return {h.split("=", 1)[0]: h for h in res.headers.get_list("set-cookie")}


@pytest.mark.parametrize("env", ["prod", "local"])
def test_ac_f1_16_dev_router_hidden_outside_test_env(db, monkeypatch, env):
    """운영(prod)·로컬(local) 설정으로 만든 앱에는 주소가 없다 → 404, 쿠키 없음, API 문서에도 안 보인다."""
    user = make_user(db)
    monkeypatch.setattr(get_settings(), "app_env", env)
    app = create_app()
    res = TestClient(app).post(URL, json={"userId": user.id})
    assert res.status_code == 404
    assert res.headers.get_list("set-cookie") == []
    assert URL not in app.openapi()["paths"]


def test_ac_f1_16_switch_service_refused_in_prod_settings(db, monkeypatch):
    """라우터를 거치지 않고 서비스를 바로 불러도 운영 설정이면 404 (이중 방어)."""
    user = make_user(db)
    monkeypatch.setattr(get_settings(), "app_env", "prod")
    with pytest.raises(AppError) as exc:
        switch_account(db, user.id)
    assert exc.value.status == 404


@pytest.mark.parametrize(
    ("kind", "expected_role", "expected_review"),
    [
        ("user", "USER", None),
        ("supplier_approved", "SUPPLIER", "APPROVED"),
        ("supplier_pending", "SUPPLIER", "PENDING"),
        ("admin", "ADMIN", None),
    ],
)
def test_ac_f1_16_switch_account_in_test_env(client, db, kind, expected_role, expected_review):
    """테스트 환경에서는 네 역할 모두 전환된다. access_token 은 httpOnly, csrf_token 은 화면이 읽을 수 있다."""
    if kind == "user":
        user = make_user(db)
    elif kind == "admin":
        user = make_user(db, role="ADMIN")
    else:
        user = make_supplier(db, review_status=expected_review).user

    res = client.post(URL, json={"userId": user.id})

    assert res.status_code == 200, res.text
    assert res.json() == {
        "id": user.id,
        "role": expected_role,
        "nickname": user.nickname,
        "supplierReviewStatus": expected_review,
    }
    assert read_access_token(res.cookies.get(ACCESS_COOKIE)) == user.id
    cookies = _set_cookie_headers(res)
    assert "httponly" in cookies[ACCESS_COOKIE].lower()
    assert "httponly" not in cookies[CSRF_COOKIE].lower()
    assert "samesite=lax" in cookies[ACCESS_COOKIE].lower()


def test_ac_f1_16_switch_to_seed_accounts(client, db):
    """목산 님 시드(#46): 사용자 host, 업체 A 로 전환된다."""
    seed_demo(db, NOW)
    host = db.query(User).filter(User.email == "host@stageduck.test").one()
    supplier_a = db.query(User).filter(User.email == "supplier-a@stageduck.test").one()

    assert client.post(URL, json={"userId": host.id}).json()["role"] == "USER"
    body = client.post(URL, json={"userId": supplier_a.id}).json()
    assert (body["role"], body["supplierReviewStatus"]) == ("SUPPLIER", "APPROVED")
    # 마지막으로 고른 계정으로 바뀌어 있다
    assert read_access_token(client.cookies.get(ACCESS_COOKIE)) == supplier_a.id


def test_ac_f1_16_response_has_no_contact_info(client, db):
    """CLAUDE.md 20: 응답에 이름·이메일·전화번호·생년월일이 없다."""
    user = make_user(db)
    body = client.post(URL, json={"userId": user.id}).json()
    for key in ("name", "email", "phone", "birthDate"):
        assert key not in body


@pytest.mark.parametrize("status", ["missing", "WITHDRAWN"])
def test_ac_f1_16_switch_unknown_or_withdrawn_is_404(client, db, status):
    user = make_user(db, status="WITHDRAWN") if status == "WITHDRAWN" else None
    user_id = user.id if user else 999_999
    res = client.post(URL, json={"userId": user_id})
    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"
    assert res.headers.get_list("set-cookie") == []


@pytest.mark.parametrize("payload", [{}, {"userId": 0}, {"userId": -1}, {"userId": "abc"}])
def test_ac_f1_16_switch_invalid_input_is_400(client, payload):
    res = client.post(URL, json=payload)
    assert res.status_code == 400
    body = res.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert body["fieldErrors"][0]["field"] == "userId"
