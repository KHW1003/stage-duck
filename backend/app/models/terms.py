"""약관 동의 (data-model.md 2장 terms_agreements, FR-AUTH-01: 약관 버전과 동의 일시를 함께 저장)."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

TERMS_TYPES = ("SERVICE", "PRIVACY_REQUIRED", "PRIVACY_OPTIONAL", "MARKETING")


class TermsAgreement(Base):
    __tablename__ = "terms_agreements"
    __table_args__ = (CheckConstraint(_in("terms_type", TERMS_TYPES), name="ck_terms_agreements_terms_type"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    terms_type: Mapped[str] = mapped_column(String(20), nullable=False)
    terms_version: Mapped[str] = mapped_column(String(10), nullable=False)
    agreed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    agreed_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)

    def __str__(self) -> str:
        return f"{self.terms_type} {self.terms_version} {'동의' if self.agreed else '미동의'}"
