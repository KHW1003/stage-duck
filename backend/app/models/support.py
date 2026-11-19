"""공지사항 (data-model.md 10장 notices, FR-CS-02 · AC-F5-21 · D-48).

관리자가 SQLAdmin 에서 쓰고 누구나 읽는다. 목록 정렬은 고정 글 먼저, 그다음 게시일 최신순.
created_by 는 비워 둘 수 있다 — 관리자 계정을 지워도 공지는 남는다 (화면에는 "운영팀"으로 보인다).
"""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

NOTICE_CATEGORIES = ("GUIDE", "MAINTENANCE", "POLICY")  # 안내 · 점검 · 정책


class Notice(Base):
    __tablename__ = "notices"
    __table_args__ = (
        CheckConstraint(_in("category", NOTICE_CATEGORIES), name="ck_notices_category"),
        Index("ix_notices_pinned_published", "is_pinned", "published_at"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    published_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
    created_by: Mapped[int | None] = mapped_column(BigID, ForeignKey("users.id"))

    def __str__(self) -> str:  # SQLAdmin 목록 표시용
        return self.title
