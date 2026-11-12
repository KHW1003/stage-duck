"""DB 엔진·세션. SQLAlchemy 2.0 동기 세션 (ADR 0002)."""
from collections.abc import Iterator

from sqlalchemy import BigInteger, DateTime, Integer, create_engine
from sqlalchemy.dialects import mysql
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

# MariaDB에서는 밀리초까지 저장 (data-model.md 공통 규칙)
DateTime3 = DateTime().with_variant(mysql.DATETIME(fsp=3), "mysql", "mariadb")

# PK·FK 공용 타입: MariaDB BIGINT UNSIGNED / SQLite INTEGER (자동 증가가 되려면 INTEGER여야 함)
BigID = BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql", "mariadb").with_variant(Integer, "sqlite")


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        # 로컬 테스트용. 운영·CI는 MariaDB.
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True)


engine: Engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI 의존성: 요청마다 세션 하나."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
