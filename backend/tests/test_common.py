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
