"""시연 데이터 넣기·초기화 (FR-DEMO-01~02). 관리자 화면의 시연 도구 액션이 reset_demo()만 부른다."""
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import Base
from app.core.errors import not_found
from app.demo.seed import DEMO_PHONE, HOST, SUPPLIERS
from app.models import Supplier, SupplierCategory, User


def is_seeded(db: Session) -> bool:
    return db.scalar(select(User.id).where(User.email == HOST["email"])) is not None


def _seed(db: Session, now: datetime) -> None:
    db.add(User(role="USER", phone=DEMO_PHONE, **HOST))
    for key, categories, intro, setup_minutes in SUPPLIERS:
        upper = key.upper()
        user = User(role="SUPPLIER", email=f"supplier-{key}@stageduck.test", name=f"업체{upper}담당", phone=DEMO_PHONE)
        db.add(user)
        db.flush()
        supplier = Supplier(
            user_id=user.id,
            business_type="SOLE_PROPRIETOR",
            company_name=f"업체 {upper}",
            representative_name=f"가상대표{upper}",
            main_phone=DEMO_PHONE,
            intro=intro,
            setup_minutes=setup_minutes,
            review_status="APPROVED",
            approved_at=now,
        )
        supplier.categories = [SupplierCategory(category=c) for c in categories]
        db.add(supplier)


def seed_demo(db: Session, now: datetime) -> None:
    """FR-DEMO-01: 사용자·업체 A~G 시드를 넣는다. 이미 있으면 그대로 둔다."""
    if is_seeded(db):
        return
    _seed(db, now)
    db.commit()


def reset_demo(db: Session, now: datetime) -> None:
    """AC-F5-14: 테스트 환경에서만 모든 데이터를 지우고 시드를 다시 넣는다. 관리자 계정은 남긴다."""
    if not get_settings().is_test_env:
        raise not_found()
    for table in reversed(Base.metadata.sorted_tables):
        stmt = delete(table)
        if table is User.__table__:
            stmt = stmt.where(User.role != "ADMIN")
        db.execute(stmt)
    _seed(db, now)
    db.commit()
