"""비밀번호 찾기 — AC-F1-21·22·23 (FR-AUTH-09, D-55, 이슈 #122)."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.auth import calc
from app.auth.router import get_now
from app.auth.tokens import CSRF_COOKIE, REFRESH_COOKIE, issue_refresh_token
from app.core.config import get_settings
from app.core.security import verify_password
from app.main import app
from app.models.password_reset import PasswordResetToken
from tests.conftest import make_user

REQ = "/api/v1/auth/password-reset"
CONFIRM = "/api/v1/auth/password-reset/confirm"
NOW = datetime(2026, 11, 20, 10, 0)
OLD_PW, NEW_PW = "duck1234", "newduck5678"
T = 1_800_000_000  # 2027년쯤 (초)


@pytest.fixture
def clock():
    """지금 시각을 바꿀 수 있는 시계. clock["now"] 을 옮기면 API 가 그 시각을 쓴다."""
    state = {"now": NOW}
    app.dependency_overrides[get_now] = lambda: state["now"]
    yield state
    app.dependency_overrides.pop(get_now, None)


def _token_from(res) -> str:
    link = res.json()["demoLink"]
    assert link.startswith("/password/reset?token=")
    return link.split("token=", 1)[1]


# ---------- AC-F1-21 요청: 가입 여부를 숨기고, 30분 1회용 링크, 10분 3회 ----------

def test_ac_f1_21_registered_email_gets_link_and_only_hash_is_stored(client, db, clock):
    user = make_user(db, password=OLD_PW)
    res = client.post(REQ, json={"email": f"  {user.email.upper()} "})
    assert res.status_code == 202, res.text
    token = _token_from(res)

    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    assert row.token_hash == calc.sha256_hex(token) != token  # 원문은 저장하지 않는다
    assert row.expires_at == NOW + timedelta(minutes=30)
    assert row.used_at is None


def test_ac_f1_21_unknown_email_is_told(client, db, clock):
    """11/19 팀 결정: 가입 화면처럼 가입하지 않은 이메일이라고 알려 준다."""
    res = client.post(REQ, json={"email": "nobody@stageduck.test"})
    assert res.status_code == 404
    body = res.json()
    assert body["code"] == "EMAIL_NOT_REGISTERED" and body["message"].startswith("가입하지 않은 이메일이에요")
    assert body["fieldErrors"] == [{"field": "email", "reason": "가입하지 않은 이메일이에요."}]
    assert db.scalar(select(PasswordResetToken)) is None


def test_ac_f1_21_same_email_three_times_per_ten_minutes(client, db, clock):
    """가입한 이메일이든 아니든 같은 규칙 (없는 이메일도 3번 묻고 나면 429)."""
    user = make_user(db, password=OLD_PW)
    for email, ok in ((user.email, 202), ("nobody@stageduck.test", 404)):
        clock["now"] = NOW
        for _ in range(3):
            assert client.post(REQ, json={"email": email}).status_code == ok
            clock["now"] += timedelta(minutes=1)
        res = client.post(REQ, json={"email": email})
        assert res.status_code == 429
        assert res.json()["code"] == "PASSWORD_RESET_RATE_LIMITED"
    # 첫 요청에서 10분이 지나면 다시 된다
    clock["now"] = NOW + timedelta(minutes=10, seconds=1)
    assert client.post(REQ, json={"email": user.email}).status_code == 202


def test_ac_f1_21_demo_link_only_in_test_env(client, db, clock, monkeypatch):
    user = make_user(db, password=OLD_PW)
    monkeypatch.setattr(get_settings(), "app_env", "local")
    res = client.post(REQ, json={"email": user.email})
    assert res.status_code == 202
    assert res.json() == {"demoLink": None}
    assert db.scalar(select(PasswordResetToken)) is not None  # 링크는 만들어지고 서버 로그에만 남는다


def test_ac_f1_21_needs_no_csrf_header(client, db, clock):
    """로그인 전 화면이라 csrf 헤더가 없을 수 있다."""
    user = make_user(db, password=OLD_PW)
    client.cookies.set(CSRF_COOKIE, "x")
    assert client.post(REQ, json={"email": user.email}).status_code == 202


# ---------- AC-F1-23 소셜 전용 계정은 링크를 만들지 않는다 ----------

@pytest.mark.parametrize(("kind", "status", "code"), [("social", 409, "SOCIAL_ACCOUNT"), ("withdrawn", 404, "EMAIL_NOT_REGISTERED")])
def test_ac_f1_23_social_only_or_withdrawn_gets_no_link(client, db, clock, kind, status, code):
    """소셜 전용은 "네이버로 로그인", 탈퇴는 가입 안 한 이메일과 같게 알려 준다. 링크는 만들지 않는다."""
    user = make_user(db, password=None) if kind == "social" else make_user(db, password=OLD_PW, status="WITHDRAWN")
    res = client.post(REQ, json={"email": user.email})
    assert res.status_code == status and res.json()["code"] == code
    assert db.scalar(select(PasswordResetToken)) is None


# ---------- AC-F1-22 새 비밀번호: 바뀌고, Refresh 끊기고, 만료·사용됨은 400 ----------

def test_ac_f1_22_confirm_changes_password_once(client, db, clock):
    user = make_user(db, password=OLD_PW, failed_login_count=3)
    token = _token_from(client.post(REQ, json={"email": user.email}))
    clock["now"] = NOW + timedelta(minutes=29)

    res = client.post(CONFIRM, json={"token": token, "password": NEW_PW})
    assert res.status_code == 204, res.text
    db.refresh(user)
    assert verify_password(NEW_PW, user.password_hash)
    assert user.failed_login_count == 0
    assert client.post("/api/v1/auth/login", json={"email": user.email, "password": NEW_PW}).status_code == 200

    again = client.post(CONFIRM, json={"token": token, "password": "another999"})
    assert again.status_code == 400
    assert again.json()["code"] == "RESET_TOKEN_INVALID"


def test_ac_f1_22_expired_link_is_invalid(client, db, clock):
    user = make_user(db, password=OLD_PW)
    token = _token_from(client.post(REQ, json={"email": user.email}))
    clock["now"] = NOW + timedelta(minutes=30)
    res = client.post(CONFIRM, json={"token": token, "password": NEW_PW})
    assert res.status_code == 400
    assert res.json()["code"] == "RESET_TOKEN_INVALID"
    db.refresh(user)
    assert verify_password(OLD_PW, user.password_hash)


def test_ac_f1_22_unknown_token_is_invalid(client, db, clock):
    res = client.post(CONFIRM, json={"token": "made-up", "password": NEW_PW})
    assert res.status_code == 400
    assert res.json()["code"] == "RESET_TOKEN_INVALID"


def test_ac_f1_22_password_rule_same_as_signup_and_link_stays_usable(client, db, clock):
    user = make_user(db, password=OLD_PW)
    token = _token_from(client.post(REQ, json={"email": user.email}))
    res = client.post(CONFIRM, json={"token": token, "password": "short1"})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION_FAILED"
    assert res.json()["fieldErrors"][0]["field"] == "password"
    assert client.post(CONFIRM, json={"token": token, "password": NEW_PW}).status_code == 204


def test_ac_f1_22_using_one_link_closes_the_others(client, db, clock):
    user = make_user(db, password=OLD_PW)
    first = _token_from(client.post(REQ, json={"email": user.email}))
    second = _token_from(client.post(REQ, json={"email": user.email}))
    assert client.post(CONFIRM, json={"token": second, "password": NEW_PW}).status_code == 204
    assert client.post(CONFIRM, json={"token": first, "password": "another999"}).status_code == 400


def test_ac_f1_22_old_refresh_tokens_are_revoked(client, db):
    """실제 시각으로: 바꾸기 전에 받은 Refresh 는 끊기고, 바꾼 뒤 로그인한 Refresh 는 된다."""
    user = make_user(db, password=OLD_PW)
    before = issue_refresh_token(user.id, now=datetime.now(timezone.utc) - timedelta(minutes=5))
    token = _token_from(client.post(REQ, json={"email": user.email}))
    assert client.post(CONFIRM, json={"token": token, "password": NEW_PW}).status_code == 204

    client.cookies.set(CSRF_COOKIE, "x")
    client.cookies.set(REFRESH_COOKIE, before)
    assert client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": "x"}).status_code == 401

    after = issue_refresh_token(user.id)  # 바꾼 뒤 다시 로그인
    client.cookies.set(REFRESH_COOKIE, after)
    assert client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": "x"}).status_code == 204


def test_ac_f1_22_confirm_clears_login_cookies(client, db, clock):
    user = make_user(db, password=OLD_PW)
    token = _token_from(client.post(REQ, json={"email": user.email}))
    res = client.post(CONFIRM, json={"token": token, "password": NEW_PW})
    cookies = res.headers.get_list("set-cookie")
    assert any(c.startswith("access_token=") and "Max-Age=0" in c for c in cookies)


@pytest.mark.parametrize(
    ("issued", "reset_at", "revoked"),
    [(T, None, False), (T - 1, datetime.fromtimestamp(T), True), (T, datetime.fromtimestamp(T), False)],
)
def test_ac_f1_22_refresh_revoked_rule(issued, reset_at, revoked):
    assert calc.refresh_revoked(issued, reset_at) is revoked
