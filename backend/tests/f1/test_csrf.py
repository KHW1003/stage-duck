"""CSRF 검사 미들웨어 (plan.md 4장, 이슈 #24 — 해원 승인: PATCH 포함, 로그인·가입·/admin 제외)."""
import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from app.auth.csrf import EXEMPT_PATHS, CSRFMiddleware
from app.auth.tokens import CSRF_COOKIE
from app.core.errors import register_error_handlers
from tests.conftest import ADMIN_PASSWORD, login_as, make_user

METHODS = ["POST", "PUT", "PATCH", "DELETE"]


@pytest.fixture
def probe() -> TestClient:
    """모든 메서드를 받는 시험용 /api/v1 주소 + 같은 미들웨어."""
    app = FastAPI()
    register_error_handlers(app)
    app.add_middleware(CSRFMiddleware)
    r = APIRouter(prefix="/api/v1")

    @r.api_route("/things", methods=["GET", *METHODS])
    def things() -> dict:
        return {"ok": True}

    @r.api_route("/auth/login", methods=["POST"])
    def fake_login() -> dict:
        return {"ok": True}

    app.include_router(r)

    @app.post("/outside")
    def outside() -> dict:
        return {"ok": True}

    return TestClient(app)


def _assert_csrf_failed(res) -> None:
    assert res.status_code == 403, res.text
    body = res.json()
    assert body["code"] == "CSRF_FAILED"
    assert set(body) == {"code", "message", "fieldErrors", "traceId"}


@pytest.mark.parametrize("method", METHODS)
def test_csrf_missing_header_is_403(probe, method):
    probe.cookies.set(CSRF_COOKIE, "abc")
    _assert_csrf_failed(probe.request(method, "/api/v1/things"))


@pytest.mark.parametrize("method", METHODS)
def test_csrf_missing_cookie_is_403(probe, method):
    _assert_csrf_failed(probe.request(method, "/api/v1/things", headers={"X-CSRF-Token": "abc"}))


@pytest.mark.parametrize("method", METHODS)
def test_csrf_mismatch_is_403(probe, method):
    probe.cookies.set(CSRF_COOKIE, "abc")
    _assert_csrf_failed(probe.request(method, "/api/v1/things", headers={"X-CSRF-Token": "abd"}))


@pytest.mark.parametrize("method", METHODS)
def test_csrf_match_passes(probe, method):
    probe.cookies.set(CSRF_COOKIE, "abc")
    res = probe.request(method, "/api/v1/things", headers={"X-CSRF-Token": "abc"})
    assert res.status_code == 200


def test_csrf_get_is_not_checked(probe):
    assert probe.get("/api/v1/things").status_code == 200


def test_csrf_exempt_and_outside_paths(probe):
    """로그인처럼 쿠키가 아직 없는 요청과 /api/v1 밖(/admin 등)은 검사하지 않는다."""
    assert probe.post("/api/v1/auth/login").status_code == 200
    assert probe.post("/outside").status_code == 200


def test_csrf_exempt_list_is_exactly_the_approved_ones():
    assert EXEMPT_PATHS == {
        "/api/v1/auth/login",
        "/api/v1/auth/signup",
        "/api/v1/auth/check-available",  # 가입 화면 [중복 확인] — 쿠키 없는 첫 방문
        "/api/v1/auth/signup/supplier",
        "/api/v1/auth/social/complete",
        "/api/v1/auth/password-reset",
        "/api/v1/auth/password-reset/confirm",
        "/api/v1/dev/switch-account",
    }


def test_csrf_real_app_logout_needs_header(client, db):
    """실제 앱에도 미들웨어가 붙어 있다: 헤더 없는 로그아웃은 403, 헤더가 있으면 204."""
    login_as(client, make_user(db))
    no_header = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": ""})
    _assert_csrf_failed(no_header)
    assert client.post("/api/v1/auth/logout").status_code == 204  # login_as 가 넣은 헤더


def test_csrf_does_not_block_admin_login(client, db):
    admin = make_user(db, role="ADMIN", password=ADMIN_PASSWORD)
    res = client.post("/admin/login", data={"username": admin.email, "password": ADMIN_PASSWORD}, follow_redirects=False)
    assert res.status_code == 302
