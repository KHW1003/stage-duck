"""상태 변경 이력 (data-model.md 10장 status_histories). 추가만 하고 수정·삭제하지 않는다."""
from datetime import datetime

from sqlalchemy import Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3


class StatusHistory(Base):
    __tablename__ = "status_histories"
    __table_args__ = (Index("ix_status_histories_entity", "entity_type", "entity_id"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[int] = mapped_column(BigID, nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(25))
    to_status: Mapped[str] = mapped_column(String(25), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(BigID)
    reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
