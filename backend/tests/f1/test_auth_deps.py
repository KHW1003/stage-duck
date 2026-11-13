"""current_user · require_role 권한 테스트 (FR-AUTH-07, 이슈 #22).

실제 API 가 아직 없어서, 의존성만 붙인 시험용 앱을 만들어 확인한다.
"""
import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient
from itsdangerous import URLSafeTimedSerializer

from app.auth.deps import current_user, require_role
from app.auth.tokens import ACCESS_COOKIE, issue_access_token
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.models import User
from tests.conftest import login_as, make_supplier, make_user


@pytest.fixture
def probe() -> TestClient:
    app = FastAPI()
    register_error_handlers(app)
    r = APIRouter()

    @r.get("/me")
    def me(user: User = Depends(current_user)) -> dict:
        return {"id": user.id, "role": user.role}

    @r.get("/admin-only")
    def admin_only(user: User = Depends(require_role("ADMIN"))) -> dict:
        return {"id": user.id}

    @r.get("/user-or-supplier")
    def user_or_supplier(user: User = Depends(require_role("USER", "SUPPLIER"))) -> dict:
        return {"id": user.id}

    app.include_router(r)
    return TestClient(app)


def _assert_error(res, status: int, code: str) -> None:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    assert set(body) == {"code", "message", "fieldErrors", "traceId"}


def test_current_user_returns_logged_in_user(probe, db):
    user = make_user(db)
    assert login_as(probe, user).get("/me").json() == {"id": user.id, "role": "USER"}


def test_current_user_other_user_cookie_is_other_user(probe, db):
    """다른 사용자의 쿠키로는 그 사람으로만 보인다 — 쿠키를 바꾸면 결과도 바뀐다."""
    a, b = make_user(db), make_user(db)
    assert login_as(probe, a).get("/me").json()["id"] == a.id
    assert login_as(probe, b).get("/me").json()["id"] == b.id


@pytest.mark.parametrize(
    "token",
    [
        None,  # 쿠키 없음
        "",  # 빈 값
        "not-a-token",  # 형식이 틀림
        URLSafeTimedSerializer("other-secret", salt="stageduck-access-token").dumps({"uid": 1}),  # 다른 키로 서명
        URLSafeTimedSerializer(get_settings().jwt_secret, salt="wrong-salt").dumps({"uid": 1}),  # 다른 용도로 서명
        URLSafeTimedSerializer(get_settings().jwt_secret, salt="stageduck-access-token").dumps({"uid": "1"}),  # id 가 글자
        URLSafeTimedSerializer(get_settings().jwt_secret, salt="stageduck-access-token").dumps([1]),  # 모양이 틀림
    ],
)
def test_current_user_rejects_missing_or_forged_cookie(probe, db, token):
    make_user(db)
    if token is not None:
        probe.cookies.set(ACCESS_COOKIE, token)
    _assert_error(probe.get("/me"), 401, "UNAUTHENTICATED")


def test_current_user_tampered_cookie_is_401(probe, db):
    """내 쿠키의 사용자 id 부분만 남의 것으로 바꾸면(서명은 내 것) 거부된다."""
    me, other = make_user(db), make_user(db)
    mine = issue_access_token(me.id).split(".")
    others = issue_access_token(other.id).split(".")
    probe.cookies.set(ACCESS_COOKIE, ".".join([others[0], *mine[1:]]))
    _assert_error(probe.get("/me"), 401, "UNAUTHENTICATED")


def test_current_user_expired_cookie_is_401(probe, db, monkeypatch):
    user = make_user(db)
    login_as(probe, user)
    monkeypatch.setattr(get_settings(), "access_token_minutes", -1)  # 이미 지난 만료 시간
    _assert_error(probe.get("/me"), 401, "UNAUTHENTICATED")


def test_current_user_withdrawn_or_deleted_is_401(probe, db):
    withdrawn = make_user(db, status="WITHDRAWN")
    _assert_error(login_as(probe, withdrawn).get("/me"), 401, "UNAUTHENTICATED")
    probe.cookies.set(ACCESS_COOKIE, issue_access_token(999_999))  # 없는 계정
    _assert_error(probe.get("/me"), 401, "UNAUTHENTICATED")


@pytest.mark.parametrize(
    ("role", "path", "allowed"),
    [
        ("USER", "/admin-only", False),
        ("SUPPLIER", "/admin-only", False),
        ("ADMIN", "/admin-only", True),
        ("USER", "/user-or-supplier", True),
        ("SUPPLIER", "/user-or-supplier", True),
        ("ADMIN", "/user-or-supplier", False),
    ],
)
def test_require_role_other_role_is_404(probe, db, role, path, allowed):
    """CLAUDE.md 10: 역할이 다르면 403 이 아니라 404 로 숨긴다."""
    user = make_supplier(db).user if role == "SUPPLIER" else make_user(db, role=role)
    res = login_as(probe, user).get(path)
    if allowed:
        assert res.status_code == 200
        assert res.json() == {"id": user.id}
    else:
        _assert_error(res, 404, "NOT_FOUND")


def test_require_role_without_login_is_401(probe):
    _assert_error(probe.get("/admin-only"), 401, "UNAUTHENTICATED")


@pytest.mark.parametrize("roles", [(), ("HOST",), ("USER", "admin")])
def test_require_role_unknown_role_fails_fast(roles):
    """오타 난 역할 이름은 서버가 뜰 때 바로 오류로 알려 준다."""
    with pytest.raises(ValueError):
        require_role(*roles)
