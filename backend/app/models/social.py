"""소셜 연결 (data-model.md 2장 social_accounts, FR-AUTH-05).

회원 정보(users)와 소셜 연결 정보를 나눠 저장한다. 같은 이메일이라도 자동으로 합치지 않으므로
연결의 열쇠는 (provider, provider_user_id) 하나뿐이다 (AC-F1-10).
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

SOCIAL_PROVIDERS = ("NAVER", "KAKAO")


class SocialAccount(Base):
    __tablename__ = "social_accounts"
    __table_args__ = (
        CheckConstraint(_in("provider", SOCIAL_PROVIDERS), name="ck_social_accounts_provider"),
        UniqueConstraint("provider", "provider_user_id", name="uq_social_accounts_provider_user"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(10), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(100), nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)

    def __str__(self) -> str:
        return f"{self.provider} 연결"
