"""커뮤니티 글 (data-model.md 9장 free_posts, D-47). 댓글·도움 돼요·저장은 T2-08(#101)에서 더한다."""
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.user import User, _in

UInt = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")

FREE_POST_CATEGORIES = ("FREE", "QUESTION", "INFO", "NEWS")
FREE_POST_STATUSES = ("ACTIVE", "BLINDED", "DELETED")
TITLE_MAX = 100
BODY_MAX = 5000


class FreePost(Base):
    """커뮤니티 글. 삭제는 DELETED 로 남긴다 (댓글이 달릴 수 있어서)."""

    __tablename__ = "free_posts"
    __table_args__ = (
        CheckConstraint(_in("category", FREE_POST_CATEGORIES), name="ck_free_posts_category"),
        CheckConstraint(_in("status", FREE_POST_STATUSES), name="ck_free_posts_status"),
        Index("ix_free_posts_status_created", "status", "created_at"),
        Index("ix_free_posts_category_created", "category", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    author_user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(TITLE_MAX), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # 5,000자까지 (서비스 검사)
    photos: Mapped[list[int]] = mapped_column(JSON, nullable=False)  # [file_id] 최대 5, 순서 = 보여 주는 순서
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ACTIVE")
    blind_reason: Mapped[str | None] = mapped_column(String(500))
    view_count: Mapped[int] = mapped_column(UInt, nullable=False, server_default="0")
    comment_count: Mapped[int] = mapped_column(UInt, nullable=False, server_default="0")
    helpful_count: Mapped[int] = mapped_column(UInt, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime3, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    author: Mapped[User] = relationship()
