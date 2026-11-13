"""회원 (data-model.md 2장 users)."""
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3

USER_ROLES = ("USER", "SUPPLIER", "ADMIN")
USER_STATUSES = ("ACTIVE", "SUSPENDED", "WITHDRAWN")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in("role", USER_ROLES), name="ck_users_role"),
        CheckConstraint(_in("status", USER_STATUSES), name="ck_users_status"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date)
    nickname: Mapped[str | None] = mapped_column(String(30), unique=True)
    signup_purpose: Mapped[str | None] = mapped_column(String(30))
    musician_type: Mapped[str | None] = mapped_column(String(20))
    signup_channel: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE", server_default="ACTIVE")
    warning_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    failed_login_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now(), onupdate=func.now())

    def __str__(self) -> str:  # SQLAdmin 목록 표시용
        return f"{self.email} ({self.role})"
