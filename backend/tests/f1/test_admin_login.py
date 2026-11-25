"""AC-F1-11: 사이트에서 로그인한 관리자는 관리자 화면에 다시 로그인하지 않는다."""
from datetime import datetime, timedelta

import pytest

from app.auth import reset, tokens
from app.auth.tokens import issue_access_token
from app.core.config import get_settings
from app.main import create_app
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from tests.conftest import ADMIN_PASSWORD


def _login(client, user: User) -> None:
    client.cookies.set("access_token", issue_access_token(user.id))


def test_ac_f1_11_site_login_opens_admin_home(client, admin_user):
    _login(client, admin_user)
    first = client.get("/admin/", follow_redirects=False)
    assert first.status_code == 302 and first.headers["location"].endswith("/admin/")
    assert client.get("/admin/", follow_redirects=False).status_code == 200
    client.cookies.delete("access_token")  # 들어온 뒤에는 관리자 세션으로 본다 (30분 쿠키가 끝나도 유지)
    assert client.get("/admin/", follow_redirects=False).status_code == 200


def test_site_cookie_alone_never_runs_the_requested_admin_page(client, admin_user):
    """위조 링크로 액션 주소를 열어도 첫 화면으로만 보낸다."""
    _login(client, admin_user)
    res = client.get("/admin/supplier/action/approve?pks=1", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"].endswith("/admin/")


def test_site_cookie_is_not_accepted_for_post(client, admin_user):
    _login(client, admin_user)
    res = client.post("/admin/notice/create", follow_redirects=False)
    assert res.status_code == 302 and res.headers["location"].endswith("/admin/login")


@pytest.mark.parametrize("role,status", [("USER", "ACTIVE"), ("SUPPLIER", "ACTIVE"), ("ADMIN", "SUSPENDED"), ("ADMIN", "WITHDRAWN")])
def test_other_accounts_still_see_admin_login(client, db, admin_user, role, status):
    admin_user.role, admin_user.status = role, status
    db.commit()
    _login(client, admin_user)
    assert client.get("/admin/", follow_redirects=False).headers["location"].endswith("/admin/login")


def test_forged_token_is_refused(client):
    client.cookies.set("access_token", "forged.token.value")
    assert client.get("/admin/", follow_redirects=False).headers["location"].endswith("/admin/login")


def test_admin_logout_also_logs_out_of_site(client, admin_user):
    _login(client, admin_user)
    client.get("/admin/")
    res = client.get("/admin/logout", follow_redirects=False)
    assert any(c.startswith("access_token=") and "Max-Age=0" in c for c in res.headers.get_list("set-cookie"))
    client.cookies.delete("access_token")
    assert client.get("/admin/", follow_redirects=False).headers["location"].endswith("/admin/login")


def test_site_logout_also_ends_admin_session(admin_client):
    admin_client.cookies.set("csrf_token", "t")
    assert admin_client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "t"}).status_code == 204
    assert admin_client.get("/admin/", follow_redirects=False).headers["location"].endswith("/admin/login")


def _admin_form(client, email, password):
    return client.post("/admin/login", data={"username": email, "password": password}, follow_redirects=False)


def test_fr_auth_06_admin_login_locks_after_five_failures(client, db, admin_user):
    """plan.md 6.5: 관리자 로그인도 일반 로그인과 같은 잠금을 쓴다."""
    for _ in range(4):
        res = _admin_form(client, admin_user.email, "wrong-pass-1")
        assert res.status_code == 400 and "이메일이나 비밀번호가 맞지 않아요." in res.text
    fifth = _admin_form(client, admin_user.email, "wrong-pass-1")
    assert fifth.status_code == 400 and "잠시 막혔어요" in fifth.text

    locked = _admin_form(client, admin_user.email, ADMIN_PASSWORD)  # 맞는 비밀번호도 10분 동안 막는다
    assert locked.status_code == 400 and "잠시 막혔어요" in locked.text
    site = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": ADMIN_PASSWORD})
    assert site.json()["code"] == "LOGIN_LOCKED"  # 사이트 로그인과 같은 잠금

    db.refresh(admin_user)
    admin_user.locked_until = datetime.now() - timedelta(minutes=1)
    db.commit()
    assert _admin_form(client, admin_user.email, ADMIN_PASSWORD).status_code == 302


def test_fr_auth_06_site_and_admin_failures_add_up(client, admin_user):
    for _ in range(4):
        client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "wrong-pass-1"})
    assert "잠시 막혔어요" in _admin_form(client, admin_user.email, "wrong-pass-1").text


@pytest.mark.parametrize("role,status", [("USER", "ACTIVE"), ("ADMIN", "SUSPENDED"), ("ADMIN", "WITHDRAWN")])
def test_admin_form_refuses_other_accounts(client, db, admin_user, role, status):
    admin_user.role, admin_user.status = role, status
    db.commit()
    res = _admin_form(client, admin_user.email, ADMIN_PASSWORD)
    assert res.status_code == 400 and "이메일이나 비밀번호가 맞지 않아요." in res.text


def test_admin_form_unknown_email(client):
    res = _admin_form(client, "none@stageduck.test", "wrong-pass-1")
    assert res.status_code == 400 and "이메일이나 비밀번호가 맞지 않아요." in res.text


# ---------- 비밀번호 찾기·세션·쿠키 보안 ----------

def test_admin_reset_link_is_never_shown_on_screen(client, db, admin_user):
    """시연 설정(test + console)에서도 남이 관리자 비밀번호를 바꿀 수 없게 링크를 화면에 주지 않는다."""
    res = client.post("/api/v1/auth/password-reset", json={"email": admin_user.email})
    assert (res.status_code, res.json()) == (202, {"demoLink": None})
    assert db.query(PasswordResetToken).filter_by(user_id=admin_user.id).count() == 1  # 메일(로그)로는 받는다


@pytest.mark.parametrize("role,status", [("USER", "ACTIVE"), ("ADMIN", "SUSPENDED"), ("ADMIN", "WITHDRAWN")])
def test_admin_session_ends_when_account_changes(admin_client, db, admin_user, role, status):
    assert admin_client.get("/admin/", follow_redirects=False).status_code == 200
    admin_user.role, admin_user.status = role, status
    db.commit()
    for res in (admin_client.get("/admin/", follow_redirects=False),
                admin_client.post("/admin/reason?op=supplier_approve&pks=1", follow_redirects=False)):
        assert res.status_code == 302 and res.headers["location"].endswith("/admin/login")


def _reset_password(db, user, at):
    db.add(PasswordResetToken(user_id=user.id, token_hash="h" * 64, created_at=at, expires_at=at, used_at=at))
    db.commit()


def test_admin_session_ends_after_password_reset(admin_client, db, admin_user):
    _reset_password(db, admin_user, datetime.now() + timedelta(seconds=5))
    assert reset.last_reset_at(db, admin_user.id) is not None
    assert admin_client.get("/admin/", follow_redirects=False).headers["location"].endswith("/admin/login")


def test_site_cookie_from_before_password_reset_is_refused(client, db, admin_user):
    _login(client, admin_user)
    _reset_password(db, admin_user, datetime.now() + timedelta(seconds=5))
    assert client.get("/admin/", follow_redirects=False).headers["location"].endswith("/admin/login")


def test_admin_session_survives_older_password_reset(client, db, admin_user):
    _reset_password(db, admin_user, datetime.now() - timedelta(minutes=5))
    _admin_form(client, admin_user.email, ADMIN_PASSWORD)
    assert client.get("/admin/", follow_redirects=False).status_code == 200


@pytest.mark.parametrize("env,base,secure", [
    ("test", "https://demo.stageduck.test", True), ("test", "http://localhost:8000", False), ("prod", "http://localhost:8000", True),
])
def test_login_cookies_are_secure_on_https(client, admin_user, monkeypatch, env, base, secure):
    monkeypatch.setattr(get_settings(), "app_env", env)
    monkeypatch.setattr(get_settings(), "public_base_url", base)
    res = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": ADMIN_PASSWORD})
    cookies = res.headers.get_list("set-cookie")
    assert len(cookies) == 3 and all(("secure" in c.lower()) == secure for c in cookies)
    assert tokens.secure_cookies() == secure


def test_server_hides_api_docs(monkeypatch):
    s = get_settings()
    assert create_app().openapi_url == "/openapi.json"  # 로컬·테스트는 그대로
    monkeypatch.setattr(s, "require_strong_secrets", True)
    monkeypatch.setattr(s, "admin_session_secret", "a" * 32)
    monkeypatch.setattr(s, "jwt_secret", "b" * 32)
    hidden = create_app()
    assert (hidden.openapi_url, hidden.docs_url, hidden.redoc_url) == (None, None, None)
