"""업로드 파일 메타 (uploads.md 5장, data-model.md files, D-51). 파일 자체는 디스크(UPLOAD_DIR)에, DB에는 메타만."""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, SmallInteger, String, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

FILE_PURPOSES = ("PROFILE", "SUPPLIER_IMAGE", "VENUE", "PR_POST", "COMMUNITY", "INQUIRY", "CHAT", "BUSINESS_DOC")
FILE_VISIBILITIES = ("PUBLIC", "PRIVATE")
FILE_STATUSES = ("TEMP", "ATTACHED", "DELETED")

UInt = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")


class StoredFile(Base):
    __tablename__ = "files"
    __table_args__ = (
        CheckConstraint(_in("purpose", FILE_PURPOSES), name="ck_files_purpose"),
        CheckConstraint(_in("visibility", FILE_VISIBILITIES), name="ck_files_visibility"),
        CheckConstraint(_in("status", FILE_STATUSES), name="ck_files_status"),
        Index("ix_files_status_created_at", "status", "created_at"),  # TEMP 정리용
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    owner_user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    visibility: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="TEMP", server_default="TEMP")
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)  # UPLOAD_DIR 아래 상대 경로
    thumb_key: Mapped[str | None] = mapped_column(String(255))
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 서버가 확인한 값
    size_bytes: Mapped[int] = mapped_column(UInt, nullable=False)
    width: Mapped[int | None] = mapped_column(USmallInt)
    height: Mapped[int | None] = mapped_column(USmallInt)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    attached_at: Mapped[datetime | None] = mapped_column(DateTime3)

    def __str__(self) -> str:
        return f"{self.purpose} #{self.id} [{self.status}]"
