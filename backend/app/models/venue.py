"""공간·기본 장비 (data-model.md 3장 venues, venue_equipment). 확정된 공연은 quote_versions.venue_snapshot 을 쓴다."""
from datetime import time

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, Time, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID
from app.models.request import UInt, USmallInt
from app.models.user import _in

VENUE_TYPES = ("CONCERT_HALL", "CULTURE_SPACE", "ROOFTOP", "GARDEN", "WAREHOUSE", "ETC")
VENUE_STATUSES = ("ACTIVE", "HIDDEN")
# 공간 조건 칸 (None = 미확인, CHK-03). VenueSnapshot.conditions 의 키는 이 이름의 대문자.
CONDITION_FIELDS = (
    "band_allowed", "external_equipment_allowed", "external_engineer_allowed",
    "has_waiting_room", "has_stage_platform", "has_parking",
)


class Venue(Base):
    __tablename__ = "venues"
    __table_args__ = (
        CheckConstraint(_in("venue_type", VENUE_TYPES), name="ck_venues_venue_type"),
        CheckConstraint(_in("status", VENUE_STATUSES), name="ck_venues_status"),
        CheckConstraint("max_capacity BETWEEN 1 AND 500", name="ck_venues_max_capacity"),
        CheckConstraint("checkout_time > checkin_time", name="ck_venues_checkout_after_checkin"),
        Index("ix_venues_sido_sigungu", "sido", "sigungu"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sido: Mapped[str] = mapped_column(String(20), nullable=False)
    sigungu: Mapped[str] = mapped_column(String(30), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    venue_type: Mapped[str] = mapped_column(String(20), nullable=False)
    max_capacity: Mapped[int] = mapped_column(USmallInt, nullable=False)
    checkin_time: Mapped[time] = mapped_column(Time, nullable=False)
    checkout_time: Mapped[time] = mapped_column(Time, nullable=False)
    rental_fee: Mapped[int] = mapped_column(UInt, nullable=False)
    has_resident_engineer: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false())
    band_allowed: Mapped[bool | None] = mapped_column(Boolean)
    external_equipment_allowed: Mapped[bool | None] = mapped_column(Boolean)
    external_engineer_allowed: Mapped[bool | None] = mapped_column(Boolean)
    has_waiting_room: Mapped[bool | None] = mapped_column(Boolean)
    has_stage_platform: Mapped[bool | None] = mapped_column(Boolean)
    has_parking: Mapped[bool | None] = mapped_column(Boolean)
    hall_registered: Mapped[bool | None] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ACTIVE")
    # 공간 상세 조회 수 (11/25 해원: 메인 "공간 예시"를 조회수 많은 순으로). 상세 GET 마다 +1
    view_count: Mapped[int] = mapped_column(UInt, nullable=False, server_default="0")

    equipment: Mapped[list["VenueEquipment"]] = relationship(
        cascade="all, delete-orphan", order_by="VenueEquipment.id", lazy="selectin"
    )


class VenueEquipment(Base):
    """공간이 기본으로 주는 장비 (예: 보컬 마이크 2)."""

    __tablename__ = "venue_equipment"

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    venue_id: Mapped[int] = mapped_column(BigID, ForeignKey("venues.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(USmallInt, nullable=False)
