"""프로필 서비스 (FR-PROFILE-01·02, AC-F5-15·16·17, #33).

- 업체 프로필: 승인(APPROVED)이고 계정이 살아 있는 업체만. 나머지는 404.
- 개인 프로필: 관리자, 또는 그 사용자와 견적서·채팅으로 엮인 업체만 (2번 request.service.is_related). 나머지는 404.
- 이용·반려 횟수는 2번 request.rejection.user_counts 를 그대로 쓴다.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.board import service as board
from app.core.errors import AppError, not_found
from app.files import service as files
from app.models.file import StoredFile
from app.models.supplier import CATEGORIES, Supplier
from app.models.user import User
from app.profile.schemas import MyProfileIn, SupplierProfileOut, UserProfileOut
from app.request import rejection
from app.request import service as request_service
from app.supplier import service as supplier_service
from app.supplier.schemas import VenueListItem


def _image_url(db: Session, file_id: int | None) -> str | None:
    f = db.get(StoredFile, file_id) if file_id else None
    return files.thumb_url(f) if f is not None and f.status == "ATTACHED" else None


def supplier_profile(db: Session, supplier_id: int) -> SupplierProfileOut:
    """AC-F5-15: 방문자도 본다. 전화번호·사업자 서류는 응답에 없다. 승인 업체가 아니거나 정지 계정이면 404."""
    s = db.get(Supplier, supplier_id)
    if s is None or s.review_status != "APPROVED" or s.user.status != "ACTIVE":
        raise not_found()
    approved = {c.category for c in s.categories}
    fields = [f for f in VenueListItem.model_fields if f != "company_name"]
    venues = [VenueListItem(company_name=s.company_name, **{f: getattr(v, f) for f in fields})
              for v in supplier_service.supplier_public_venues(db, s.id)]
    return SupplierProfileOut(
        id=s.id,
        company_name=s.company_name,
        image_url=_image_url(db, s.image_file_id),
        categories=[c for c in CATEGORIES if c in approved],
        intro=s.intro,
        setup_minutes=s.setup_minutes,
        teardown_minutes=s.teardown_minutes,
        engineer_years=s.engineer_years,
        band_experience=s.band_experience,
        has_liability_insurance=s.has_liability_insurance,
        sound_certification=s.sound_certification,
        joined_at=s.approved_at or s.created_at,
        posts=board.supplier_posts(db, s.id),
        venues=venues,
    )


def my_supplier_profile(db: Session, user: User) -> SupplierProfileOut:
    supplier = supplier_service.get_application(db, user)
    return supplier_profile(db, supplier.id)


def _user_profile(db: Session, user: User, now: datetime) -> UserProfileOut:
    counts = rejection.user_counts(db, {user.id}, now=now)[user.id]
    return UserProfileOut(
        id=user.id,
        nickname=user.nickname,
        profile_image_url=_image_url(db, user.profile_file_id),
        joined_at=user.created_at,
        usage_count=counts["usage_count"],
        rejection_count=counts["rejection_count"],
    )


def user_profile(db: Session, viewer: User, user_id: int, *, now: datetime) -> UserProfileOut:
    """AC-F5-16·17: 관리자 또는 관계있는 업체만. 만난 적 없는 업체·사용자 역할이 아닌 대상은 404."""
    target = db.get(User, user_id)
    if target is None or target.role != "USER":
        raise not_found()
    if viewer.role != "ADMIN":
        supplier = db.scalar(select(Supplier).where(Supplier.user_id == viewer.id))
        if supplier is None or not request_service.is_related(db, target.id, supplier.id):
            raise not_found()
    return _user_profile(db, target, now)


def my_profile(db: Session, user: User, *, now: datetime) -> UserProfileOut:
    """마이페이지 "업체에게 이렇게 보여요" — 업체가 보는 것과 같은 모양 (AC-F5-16)."""
    return _user_profile(db, user, now)


def _nickname_error(status: int, code: str, message: str) -> AppError:
    return AppError(status, code, message, [{"field": "nickname", "reason": message}])


def update_my_profile(db: Session, user: User, body: MyProfileIn, *, now: datetime) -> UserProfileOut:
    """FR-PROFILE-02: 닉네임(빈칸 400, 중복 409 NICKNAME_TAKEN)·프로필 사진(내 TEMP PROFILE 파일만). 보낸 칸만 바꾼다."""
    sent = body.model_fields_set
    old_photo: StoredFile | None = None

    if "nickname" in sent:
        if not body.nickname:
            raise _nickname_error(400, "VALIDATION_FAILED", "닉네임을 입력해 주세요.")
        taken = db.scalar(select(User.id).where(User.nickname == body.nickname, User.id != user.id))
        if taken is not None:
            raise _nickname_error(409, "NICKNAME_TAKEN", "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.")
        user.nickname = body.nickname

    if "profile_file_id" in sent and body.profile_file_id != user.profile_file_id:
        if body.profile_file_id is not None:
            files.attach_files(db, owner_id=user.id, file_ids=[body.profile_file_id], purpose="PROFILE", now=now)
        if user.profile_file_id is not None:
            old_photo = db.get(StoredFile, user.profile_file_id)
            old_photo.status = "DELETED"
        user.profile_file_id = body.profile_file_id

    try:
        db.commit()
    except IntegrityError:  # 같은 닉네임이 동시에 들어온 경우 (users.nickname UNIQUE)
        db.rollback()
        raise _nickname_error(409, "NICKNAME_TAKEN", "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.") from None
    if old_photo is not None:
        files.remove_stored(old_photo)
    return _user_profile(db, user, now)
