"""업체 (data-model.md 2장 suppliers, supplier_categories)."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.user import User, _in

BUSINESS_TYPES = ("INDIVIDUAL", "SOLE_PROPRIETOR", "CORPORATION")
REVIEW_STATUSES = ("PENDING", "APPROVED", "REJECTED", "SUSPENDED")
CATEGORIES = ("VENUE", "EQUIPMENT", "INSTALL", "ENGINEER")


class Supplier(Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        CheckConstraint(_in("business_type", BUSINESS_TYPES), name="ck_suppliers_business_type"),
        CheckConstraint(_in("review_status", REVIEW_STATUSES), name="ck_suppliers_review_status"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False, unique=True)
    business_type: Mapped[str] = mapped_column(String(20), nullable=False)
    company_name: Mapped[str] = mapped_column(String(100), nullable=False)
    representative_name: Mapped[str] = mapped_column(String(50), nullable=False)
    business_reg_no: Mapped[str | None] = mapped_column(String(10))
    business_reg_file: Mapped[str | None] = mapped_column(String(255))
    business_address: Mapped[str | None] = mapped_column(String(255))
    main_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    mail_order_no: Mapped[str | None] = mapped_column(String(50))
    intro: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String(255))
    setup_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    teardown_minutes: Mapped[int | None] = mapped_column(SmallInteger)
    engineer_years: Mapped[int | None] = mapped_column(SmallInteger)
    band_experience: Mapped[bool | None] = mapped_column(Boolean)
    has_liability_insurance: Mapped[bool | None] = mapped_column(Boolean)
    sound_certification: Mapped[str | None] = mapped_column(String(100))
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING", server_default="PENDING")
    reject_reason: Mapped[str | None] = mapped_column(String(500))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship()
    categories: Mapped[list["SupplierCategory"]] = relationship(cascade="all, delete-orphan")

    def __str__(self) -> str:
        return f"{self.company_name} [{self.review_status}]"


class SupplierCategory(Base):
    __tablename__ = "supplier_categories"
    __table_args__ = (CheckConstraint(_in("category", CATEGORIES), name="ck_supplier_categories_category"),)

    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), primary_key=True)
    category: Mapped[str] = mapped_column(String(20), primary_key=True)

    def __str__(self) -> str:
        return self.category
