"""공통: 헬스 체크, 관리자 접근 제한, 마이그레이션이 모델과 같은지."""
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.db import Base
from tests.conftest import ADMIN_PASSWORD, make_user

BACKEND = Path(__file__).resolve().parents[1]


def test_health(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["simulation"] is True


def test_validation_error_format(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404


def test_admin_requires_login(client):
    res = client.get("/admin/supplier/list", follow_redirects=False)
    assert res.status_code in (302, 303)
    assert "/admin/login" in res.headers["location"]


def test_non_admin_cannot_login_to_admin(client, db):
    user = make_user(db, role="USER", password=ADMIN_PASSWORD)
    res = client.post("/admin/login", data={"username": user.email, "password": ADMIN_PASSWORD}, follow_redirects=False)
    assert res.status_code != 302 or "/admin/login" in res.headers.get("location", "")
    assert client.get("/admin/supplier/list", follow_redirects=False).status_code in (302, 303)


def test_migrations_match_models(tmp_path):
    """alembic upgrade head 결과가 SQLAlchemy 모델과 같은 테이블·컬럼을 만든다."""
    url = f"sqlite:///{(tmp_path / 'migrate.db').as_posix()}"
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    cwd = os.getcwd()
    try:
        os.chdir(BACKEND)
        command.upgrade(cfg, "head")
    finally:
        os.chdir(cwd)

    insp = inspect(create_engine(url))
    migrated = {t: {c["name"] for c in insp.get_columns(t)} for t in insp.get_table_names() if t != "alembic_version"}
    modeled = {t.name: {c.name for c in t.columns} for t in Base.metadata.sorted_tables}
    assert migrated == modeled


def test_admin_theme_login_page_and_static(client):
    """관리자 테마: 로그인 화면은 한국어·이메일 칸·로고, 테마 파일은 로그인 없이 받을 수 있다."""
    page = client.get("/admin/login")
    assert page.status_code == 200
    assert 'name="username"' in page.text and 'name="password"' in page.text  # SQLAdmin 로그인 필드 이름 유지
    assert "이메일" in page.text and "/admin-static/logo.webp" in page.text
    assert "/admin-static/admin.css" in page.text
    assert client.get("/admin-static/admin.css").status_code == 200
    assert "/admin-static/theme.js" in page.text and client.get("/admin-static/theme.js").status_code == 200
    assert client.get("/admin-static/logo.webp").headers["content-type"] == "image/webp"


def test_admin_theme_wrong_password_message(client, admin_user):
    res = client.post("/admin/login", data={"username": admin_user.email, "password": "wrong-pass-0000"})
    assert res.status_code == 400
    assert "이메일이나 비밀번호가 맞지 않아요." in res.text


def test_admin_home_shows_logo_and_menu_shortcuts(admin_client):
    page = admin_client.get("/admin/")
    assert page.status_code == 200
    for name in ("업체 심사", "회원", "제재 이력", "상태 변경 이력"):
        assert name in page.text
    assert "사유 입력" not in page.text  # 메뉴에 숨긴 화면은 바로가기에도 없다
