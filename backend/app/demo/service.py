"""시연 데이터 넣기·초기화 (FR-DEMO-01~02). 관리자 화면의 시연 도구 액션이 reset_demo()만 부른다."""
from datetime import datetime, time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import Base
from app.core.errors import not_found
from app.demo.seed import DEMO_PHONE, HOST, PAST_REVIEWS, SUPPLIERS, VENUES
from app.models import Supplier, SupplierCategory, User, Venue, VenueEquipment
from app.models.request import Performance, Stage
from app.models.review import Review
from app.models.terms import SupplierTermsReview
from app.supplier.terms import TERMS_VERSION


def is_seeded(db: Session) -> bool:
    return db.scalar(select(User.id).where(User.email == HOST["email"])) is not None


def _seed(db: Session, now: datetime) -> None:
    db.add(User(role="USER", phone=DEMO_PHONE, **HOST))
    supplier_ids: dict[str, int] = {}
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
        db.flush()
        supplier_ids[key] = supplier.id
        # 시연 업체는 거래 약관을 이미 확인한 상태로 시작한다 (바로 견적서를 보낼 수 있게)
        db.add(SupplierTermsReview(user_id=user.id, version=TERMS_VERSION, reviewed_at=now))
        if key in VENUES:
            db.flush()
            spec = dict(VENUES[key])
            gear = spec.pop("equipment")
            venue = Venue(supplier_id=supplier.id, **spec)
            venue.equipment = [VenueEquipment(category=c, name=n, quantity=q) for c, n, q in gear]
            db.add(venue)
    _seed_past_reviews(db, supplier_ids, now)


def _seed_past_reviews(db: Session, suppliers: dict[str, int], now: datetime) -> None:
    """지난 공연과 그 후기 (specs/reviews.md) — 업체 프로필·목록에 별점이 보이게. 공고·청구서는 만들지 않는다."""
    for i, (nickname, title, show_date, reviews) in enumerate(PAST_REVIEWS, start=1):
        user = User(role="USER", email=f"reviewer-{i}@stageduck.test", name=f"후기작성자{i}", nickname=nickname, phone=DEMO_PHONE)
        db.add(user)
        db.flush()
        perf = Performance(
            user_id=user.id, status="COMPLETED", title=title, form="BAND", show_date=show_date,
            rehearsal_start=time(17, 0), show_start=time(19, 0), show_end=time(21, 0), audience=80,
            sido="광주광역시", sigungu="동구", needs={},
        )
        db.add(perf)
        db.flush()
        for seq, (key, stage_type, rating, content) in enumerate(reviews, start=1):
            stage = Stage(performance_id=perf.id, stage_type=stage_type, seq=seq, status="CONFIRMED", confirmed_at=now)
            db.add(stage)
            db.flush()
            db.add(Review(
                performance_id=perf.id, stage_id=stage.id, supplier_id=suppliers[key], user_id=user.id,
                rating=rating, content=content, created_at=datetime.combine(show_date, time(23, 0)),
            ))


def seed_demo(db: Session, now: datetime) -> None:
    """FR-DEMO-01: 사용자·업체 A~G·공간 A~C·지난 공연 후기 시드를 넣는다. 이미 있으면 그대로 둔다."""
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
