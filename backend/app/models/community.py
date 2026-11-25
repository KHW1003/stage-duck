"""커뮤니티 글·댓글·도움 돼요·저장 (data-model.md 9장 free_posts·free_comments·free_helpfuls·free_bookmarks, D-47)."""
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.user import User, _in

UInt = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")

FREE_POST_CATEGORIES = ("FREE", "QUESTION", "INFO", "NEWS")
FREE_POST_STATUSES = ("ACTIVE", "BLINDED", "DELETED")
TITLE_MAX = 100
BODY_MAX = 5000
COMMENT_MAX = 500
HELPFUL_TARGETS = ("POST", "COMMENT")


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


class FreeComment(Base):
    """댓글·답글. 답글은 한 단계만 (parent 의 parent_id 가 NULL 일 때만, 서비스 검사). 지우면 DELETED 로 남긴다."""

    __tablename__ = "free_comments"
    __table_args__ = (
        CheckConstraint(_in("status", FREE_POST_STATUSES), name="ck_free_comments_status"),
        Index("ix_free_comments_post_created", "post_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(BigID, ForeignKey("free_posts.id"), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("free_comments.id"))
    author_user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(String(COMMENT_MAX), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ACTIVE")
    blind_reason: Mapped[str | None] = mapped_column(String(500))
    helpful_count: Mapped[int] = mapped_column(UInt, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime3)  # 고쳤으면 "(수정됨)"

    author: Mapped[User] = relationship()


class FreeHelpful(Base):
    """도움 돼요. 한 사람이 한 대상에 한 번 (다시 누르면 행을 지운다)."""

    __tablename__ = "free_helpfuls"
    __table_args__ = (
        CheckConstraint(_in("target_type", HELPFUL_TARGETS), name="ck_free_helpfuls_target_type"),
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_free_helpfuls_user_target"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[int] = mapped_column(BigID, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


class FreeBookmark(Base):
    """저장한 글 (마이페이지 저장 글, AC-F4-17)."""

    __tablename__ = "free_bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_free_bookmarks_user_post"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    post_id: Mapped[int] = mapped_column(BigID, ForeignKey("free_posts.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
