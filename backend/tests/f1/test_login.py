"""로그인·로그아웃·내 정보 — AC-F1-11, AC-F1-12(서버 부분) (FR-AUTH-06, 이슈 #24)."""
from datetime import datetime, timedelta, timezone

import pytest

from app.auth import service
from app.auth.tokens import (
    ACCESS_COOKIE,
    CSRF_COOKIE,
    REFRESH_COOKIE,
    issue_access_token,
    issue_refresh_token,
    read_access_token,
)
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password
from tests.conftest import make_supplier, make_user

LOGIN = "/api/v1/auth/login"
PW = "duck1234"
NOW = datetime(2026, 11, 16, 9, 0)


def _login(client, email: str, password: str = PW):
    return client.post(LOGIN, json={"email": email, "password": password})


def _csrf(client) -> dict:
    return {"X-CSRF-Token": client.cookies.get(CSRF_COOKIE)}


# ---------- AC-F1-11 역할별 첫 화면 ----------

@pytest.mark.parametrize(
    ("kind", "landing"),
    [
        ("user", "/me/performances"),
        ("approved", "/supplier/postings"),
        ("pending", "/supplier/onboarding"),
        ("rejected", "/supplier/onboarding"),
        ("admin", "/admin"),
    ],
)
def test_ac_f1_11_login_lands_on_role_home(client, db, kind, landing):
    if kind == "user":
        user = make_user(db, password=PW)
    elif kind == "admin":
        user = make_user(db, role="ADMIN", password=PW)
    else:
        status = {"approved": "APPROVED", "pending": "PENDING", "rejected": "REJECTED"}[kind]
        user = make_supplier(db, review_status=status).user
        user.password_hash = hash_password(PW)
        db.commit()

    res = _login(client, user.email)

    assert res.status_code == 200, res.text
    assert res.json() == {"id": user.id, "role": user.role, "nickname": user.nickname, "landing": landing}
    assert read_access_token(res.cookies.get(ACCESS_COOKIE)) == user.id
    me = client.get("/api/v1/me")
    assert me.status_code == 200
    assert me.json()["landing"] == landing


def test_ac_f1_11_me_returns_own_info_only(client, db):
    me_user = make_user(db, password=PW)
    make_user(db, password=PW)  # 다른 사람
    _login(client, me_user.email)
    res = client.get("/api/v1/me")
    body = res.json()
    assert body["id"] == me_user.id
    assert (body["email"], body["name"], body["phone"]) == (me_user.email, me_user.name, me_user.phone)
    assert body["supplierReviewStatus"] is None
    assert res.headers["cache-control"] == "no-store"  # AC-F1-12: 브라우저가 개인 정보를 저장하지 않게


def test_ac_f1_11_me_without_login_is_401(client):
    assert client.get("/api/v1/me").status_code == 401


def test_login_email_is_case_insensitive(client, db):
    user = make_user(db, password=PW, email="case@stageduck.test")
    assert _login(client, "  CASE@StageDuck.test ").status_code == 200
    assert read_access_token(client.cookies.get(ACCESS_COOKIE)) == user.id


@pytest.mark.parametrize("case", ["wrong_password", "unknown_email", "withdrawn", "social_only"])
def test_login_failures_look_the_same(client, db, case):
    """어떤 이메일이 가입됐는지 알 수 없게 같은 응답."""
    if case == "withdrawn":
        email = make_user(db, password=PW, status="WITHDRAWN").email
    elif case == "social_only":
        email = make_user(db).email  # 비밀번호 없음
    elif case == "wrong_password":
        email = make_user(db, password="other1234").email
    else:
        email = "nobody@stageduck.test"
    res = _login(client, email)
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHENTICATED"
    assert res.json()["message"] == "이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요."
    assert ACCESS_COOKIE not in res.cookies


def test_suspended_user_cannot_log_in(client, db):
    """정지 계정은 로그인 자체가 막히고 정지라는 것을 알려 준다 (#24 결정). 쿠키도 붙이지 않는다."""
    user = make_user(db, password=PW, status="SUSPENDED")
    res = _login(client, user.email)
    assert res.status_code == 403
    assert res.json()["code"] == "ACCOUNT_SUSPENDED"
    assert ACCESS_COOKIE not in res.cookies
    assert client.get("/api/v1/me").status_code == 401


def test_suspended_user_wrong_password_does_not_reveal_suspension(client, db):
    """비밀번호를 모르는 사람은 정지 여부를 알 수 없다."""
    user = make_user(db, password=PW, status="SUSPENDED")
    res = _login(client, user.email, "wrong-pass1")
    assert res.status_code == 401 and res.json()["code"] == "UNAUTHENTICATED"


def test_suspended_after_login_is_kicked_out(client, db):
    """로그인한 뒤에 정지되면 이미 받은 쿠키로도 /me 가 401."""
    user = make_user(db, password=PW)
    _login(client, user.email)
    user.status = "SUSPENDED"
    db.commit()
    assert client.get("/api/v1/me").status_code == 401


# ---------- FR-AUTH-06 5회 연속 실패 → 10분 잠금 ----------

def _fail(db, email, now):
    with pytest.raises(AppError) as exc:
        service.login(db, email, "wrong-pass1", now=now)
    return exc.value.code


def test_login_four_failures_then_success_resets_count(db):
    user = make_user(db, password=PW)
    codes = [_fail(db, user.email, NOW) for _ in range(4)]
    assert codes == ["UNAUTHENTICATED"] * 4
    service.login(db, user.email, PW, now=NOW)
    db.refresh(user)
    assert user.failed_login_count == 0
    # 다시 4번 틀려도 잠기지 않는다 (연속 횟수가 처음부터)
    assert [_fail(db, user.email, NOW) for _ in range(4)] == ["UNAUTHENTICATED"] * 4


def test_login_fifth_failure_locks_for_ten_minutes(db):
    user = make_user(db, password=PW)
    codes = [_fail(db, user.email, NOW) for _ in range(5)]
    assert codes == ["UNAUTHENTICATED"] * 4 + ["LOGIN_LOCKED"]
    db.refresh(user)
    assert user.locked_until == NOW + timedelta(minutes=10)

    # 잠긴 동안은 맞는 비밀번호도 막힌다 (경계: 9분 59초)
    with pytest.raises(AppError) as exc:
        service.login(db, user.email, PW, now=NOW + timedelta(minutes=9, seconds=59))
    assert exc.value.code == "LOGIN_LOCKED"
    assert "09:10" in exc.value.message  # 언제부터 되는지 알려 준다

    # 10분이 지나면 된다 (경계: 정확히 10분)
    assert service.login(db, user.email, PW, now=NOW + timedelta(minutes=10)).id == user.id


def test_login_lock_over_http(client, db):
    user = make_user(db, password=PW)
    codes = [_login(client, user.email, "wrong-pass1").json()["code"] for _ in range(5)]
    assert codes[-1] == "LOGIN_LOCKED"
    res = _login(client, user.email)
    assert res.status_code == 401 and res.json()["code"] == "LOGIN_LOCKED"


def test_lock_is_per_account(db):
    a, b = make_user(db, password=PW), make_user(db, password=PW)
    for _ in range(5):
        _fail(db, a.email, NOW)
    assert service.login(db, b.email, PW, now=NOW).id == b.id


# ---------- AC-F1-12 로그아웃 (서버 부분: 쿠키 삭제) ----------

def test_ac_f1_12_logout_clears_cookies_and_me_is_401(client, db):
    user = make_user(db, password=PW)
    _login(client, user.email)
    res = client.post("/api/v1/auth/logout", headers=_csrf(client))
    assert res.status_code == 204
    deleted = " ".join(res.headers.get_list("set-cookie")).lower()
    for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        assert f'{name}=""' in deleted or f"{name}=;" in deleted
    assert client.get("/api/v1/me").status_code == 401


def test_ac_f1_12_logout_without_valid_access_still_clears_cookies(client):
    """access_token 이 없거나 만료돼도 로그아웃은 되고 남은 쿠키(refresh·csrf)를 지운다."""
    client.cookies.set(CSRF_COOKIE, "x")
    res = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "x"})
    assert res.status_code == 204
    deleted = " ".join(res.headers.get_list("set-cookie")).lower()
    for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        assert f'{name}=""' in deleted or f"{name}=;" in deleted


# ---------- refresh ----------

def test_refresh_issues_new_access(client, db):
    """access 가 만료돼 쿠키에 없고 refresh 만 남은 상태 → refresh 하면 다시 로그인 상태."""
    user = make_user(db)
    client.cookies.set(REFRESH_COOKIE, issue_refresh_token(user.id))
    client.cookies.set(CSRF_COOKIE, "x")
    assert client.get("/api/v1/me").status_code == 401
    res = client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": "x"})
    assert res.status_code == 204
    assert read_access_token(res.cookies.get(ACCESS_COOKIE)) == user.id
    assert client.get("/api/v1/me").json()["id"] == user.id


def test_refresh_needs_csrf_header(client, db):
    user = make_user(db)
    client.cookies.set(REFRESH_COOKIE, issue_refresh_token(user.id))
    client.cookies.set(CSRF_COOKIE, "x")
    assert client.post("/api/v1/auth/refresh").status_code == 403


@pytest.mark.parametrize("token_kind", ["none", "access", "expired", "withdrawn", "suspended"])
def test_refresh_rejects_bad_token(client, db, token_kind):
    status = {"withdrawn": "WITHDRAWN", "suspended": "SUSPENDED"}.get(token_kind, "ACTIVE")
    user = make_user(db, status=status)
    client.cookies.set(CSRF_COOKIE, "x")
    if token_kind == "access":
        client.cookies.set(REFRESH_COOKIE, issue_access_token(user.id))  # access 를 refresh 자리에
    elif token_kind == "expired":
        old = datetime.now(timezone.utc) - timedelta(days=get_settings().refresh_token_days, seconds=1)
        client.cookies.set(REFRESH_COOKIE, issue_refresh_token(user.id, now=old))
    elif token_kind in ("withdrawn", "suspended"):
        client.cookies.set(REFRESH_COOKIE, issue_refresh_token(user.id))
    res = client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": "x"})
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHENTICATED"
