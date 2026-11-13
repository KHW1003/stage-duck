"""테스트 공통 설정.

- DB: 환경 변수 TEST_DATABASE_URL 이 있으면 그 DB(MariaDB, CI), 없으면 임시 SQLite 파일(로컬 빠른 실행).
- 앱을 import 하기 전에 DATABASE_URL 을 바꿔야 하므로 이 파일 맨 위에서 설정한다.
- 테스트 이름에는 AC ID 를 넣는다 (plan.md 7장): test_ac_f1_19_...
"""
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="stageduck-test-"))
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("ADMIN_SESSION_SECRET", "test-secret")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.auth.tokens import ACCESS_COOKIE, issue_access_token  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Supplier, SupplierCategory, User  # noqa: E402

ADMIN_PASSWORD = "admin-pass-1234"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    """테스트마다 모든 테이블을 비운다 (FK 역순)."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db() -> Session:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


_seq = {"n": 0}


def _next() -> int:
    _seq["n"] += 1
    return _seq["n"]


def make_user(db: Session, *, role: str = "USER", password: str | None = None, **kw) -> User:
    n = _next()
    user = User(
        role=role,
        email=kw.pop("email", f"{role.lower()}{n}@stageduck.test"),
        password_hash=hash_password(password) if password else None,
        name=kw.pop("name", f"테스트{n}"),
        phone=kw.pop("phone", "01000000000"),
        nickname=kw.pop("nickname", f"닉네임{n}" if role == "USER" else None),
        **kw,
    )
    db.add(user)
    db.commit()
    return user


def make_supplier(db: Session, *, review_status: str = "PENDING", categories=("EQUIPMENT",), **kw) -> Supplier:
    user = make_user(db, role="SUPPLIER")
    supplier = Supplier(
        user_id=user.id,
        business_type=kw.pop("business_type", "SOLE_PROPRIETOR"),
        company_name=kw.pop("company_name", f"가상업체{user.id}"),
        representative_name="대표",
        main_phone="0620000000",
        review_status=review_status,
        **kw,
    )
    supplier.categories = [SupplierCategory(category=c) for c in categories]
    db.add(supplier)
    db.commit()
    return supplier


def login_as(client: TestClient, user: User) -> TestClient:
    """user 로 로그인한 쿠키를 넣는다 (#22). 사용: login_as(client, make_user(db)).get("/api/v1/...")"""
    client.cookies.set(ACCESS_COOKIE, issue_access_token(user.id))
    return client


@pytest.fixture
def admin_user(db: Session) -> User:
    return make_user(db, role="ADMIN", password=ADMIN_PASSWORD, email="admin@stageduck.test")


@pytest.fixture
def admin_client(client: TestClient, admin_user: User) -> TestClient:
    """SQLAdmin 에 로그인한 클라이언트."""
    res = client.post("/admin/login", data={"username": admin_user.email, "password": ADMIN_PASSWORD}, follow_redirects=False)
    assert res.status_code == 302, res.text
    return client
