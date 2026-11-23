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
os.environ.setdefault("UPLOAD_DIR", (_tmp / "uploads").as_posix())  # 업로드 파일은 임시 폴더에
# 내 backend/.env 가 MAIL_BACKEND=smtp 여도 테스트는 진짜 메일을 보내지 않는다 (smtp 는 test_mail.py 가 가짜로 켠다)
os.environ["MAIL_BACKEND"] = "console"
os.environ["SCHEDULER_ENABLED"] = "false"  # 테스트는 run_due 를 직접 부른다

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.auth.tokens import ACCESS_COOKIE, CSRF_COOKIE, issue_access_token  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Supplier, SupplierCategory, User  # noqa: E402
from app.supplier.terms import TERMS_VERSION, confirm_review  # noqa: E402

ADMIN_PASSWORD = "admin-pass-1234"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    """테스트마다 모든 테이블을 비운다 (FK 역순).

    stages ↔ quote_versions 처럼 서로를 가리키는 FK(#131)는 어떤 순서로도 지울 수 없어서,
    MariaDB 에서는 비우는 동안만 FK 검사를 끈다 (같은 연결 안에서만, 끝나면 다시 켠다). SQLite 는 FK 를 검사하지 않는다.
    """
    yield
    with engine.begin() as conn:
        mysql = conn.dialect.name in ("mysql", "mariadb")
        if mysql:
            conn.exec_driver_sql("SET FOREIGN_KEY_CHECKS = 0")
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
        if mysql:
            conn.exec_driver_sql("SET FOREIGN_KEY_CHECKS = 1")


@pytest.fixture
def db() -> Session:
    """테스트가 직접 쓰는 세션. MariaDB 에서는 READ COMMITTED 로 읽는다.

    MariaDB 기본값(REPEATABLE READ)이면 이 세션의 트랜잭션이 처음 읽은 순간의 스냅숏만 보여서,
    테스트 중에 API(다른 연결)가 저장한 값이 안 보인다 (CI 에서만 실패하던 원인). SQLite 는 그대로.
    """
    mysql = engine.dialect.name in ("mysql", "mariadb")
    bind = engine.execution_options(isolation_level="READ COMMITTED") if mysql else engine
    with SessionLocal(bind=bind) as session:
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


def make_supplier(
    db: Session, *, review_status: str = "PENDING", categories=("EQUIPMENT",), terms_reviewed: bool = True, **kw,
) -> Supplier:
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
    if review_status == "APPROVED" and terms_reviewed:
        confirm_review(db, user, TERMS_VERSION)
    return supplier


TEST_CSRF_TOKEN = "test-csrf-token"


def login_as(client: TestClient, user: User) -> TestClient:
    """user 로 로그인한 쿠키를 넣는다 (#22). 사용: login_as(client, make_user(db)).post("/api/v1/...")

    #24부터 POST·PUT·PATCH·DELETE 는 CSRF 검사를 하므로, csrf_token 쿠키와 X-CSRF-Token 헤더도 같이 넣는다.
    """
    client.cookies.set(ACCESS_COOKIE, issue_access_token(user.id))
    client.cookies.set(CSRF_COOKIE, TEST_CSRF_TOKEN)
    client.headers["X-CSRF-Token"] = TEST_CSRF_TOKEN
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
