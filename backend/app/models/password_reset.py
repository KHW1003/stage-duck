"""비밀번호 찾기 (data-model.md 10장 password_reset_tokens, D-55 · AC-F1-21~23).

- password_reset_tokens: 재설정 링크. 원문 토큰은 저장하지 않고 SHA-256 만. 30분·1회용.
  마지막으로 쓴 시각(used_at)보다 먼저 발급된 Refresh 는 받지 않는다 (AC-F1-22 Refresh 전부 끊기).
- password_reset_requests: 요청 기록 (같은 이메일 10분 3회). 가입 안 한 이메일도 똑같이 세야
  429 로 가입 여부가 드러나지 않아서, 사용자 id 대신 이메일 해시로 센다.
"""
from datetime import datetime

from sqlalchemy import CHAR, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_password_reset_tokens_user_used", "user_id", "used_at"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)


class PasswordResetRequest(Base):
    __tablename__ = "password_reset_requests"
    __table_args__ = (Index("ix_password_reset_requests_email_at", "email_hash", "requested_at"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    email_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
