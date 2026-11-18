"""업체 찾기 소개 글 (data-model.md 9장 pr_posts, FR-BOARD-01~03). 화면 이름은 "업체 찾기"·"소개 글".

- active_guard: 활성·가린 글이면 1, 아니면 NULL. UNIQUE(supplier_id, category, active_guard) 로 부문당 1개 (AC-F4-02·10).
  NULL 은 유니크 검사에서 빠진다. SQLite 테스트에서도 돌도록 CASE WHEN 으로 쓴다 (해원 승인 2026-11-18, A안).
- title 100자, body 5,000자(schemas 에서 검사), price_range 50자 (해원 승인 2026-11-18).
"""
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, Computed, ForeignKey, Index, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.supplier import Supplier
from app.models.user import _in

PR_CATEGORIES = ("VENUE", "EQUIPMENT", "ENGINEER")
PR_STATUSES = ("ACTIVE", "HIDDEN", "BLINDED", "DELETED")
ACTIVE_GUARD_EXPR = "CASE WHEN status IN ('ACTIVE', 'BLINDED') THEN 1 ELSE NULL END"


class PrPost(Base):
    __tablename__ = "pr_posts"
    __table_args__ = (
        CheckConstraint(_in("category", PR_CATEGORIES), name="ck_pr_posts_category"),
        CheckConstraint(_in("status", PR_STATUSES), name="ck_pr_posts_status"),
        Index("ix_pr_posts_status_bumped_at", "status", "bumped_at"),
        Index("ix_pr_posts_category_bumped_at", "category", "bumped_at"),
        UniqueConstraint("supplier_id", "category", "active_guard", name="uq_pr_posts_active_guard"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    photos: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)  # [file_id] 보여 주는 순서, 최대 10
    sido: Mapped[str] = mapped_column(String(20), nullable=False)
    price_range: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="ACTIVE", server_default="ACTIVE")
    blind_reason: Mapped[str | None] = mapped_column(String(500))
    bumped_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
    active_guard: Mapped[int | None] = mapped_column(SmallInteger, Computed(ACTIVE_GUARD_EXPR, persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now(), onupdate=func.now())

    supplier: Mapped[Supplier] = relationship()

    def __str__(self) -> str:
        return f"[{self.category}] {self.title}"
