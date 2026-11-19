"""회원 가입·로그인 (FR-AUTH-01, FR-AUTH-06). 시간·날짜는 인자로 받는다 (CLAUDE.md 6.1)."""
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import calc
from app.auth.schemas import AgreementsIn, SignupIn, SupplierSignupIn
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.models.supplier import Supplier
from app.models.terms import TermsAgreement
from app.models.user import User

TERMS_VERSION = "v1"
_BAD_LOGIN = "이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요."


def _taken(field: str, code: str, message: str) -> AppError:
    return AppError(409, code, message, [{"field": field, "reason": message}])


def _email_taken() -> AppError:
    return _taken("email", "EMAIL_TAKEN", "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.")


def _nickname_taken() -> AppError:
    return _taken("nickname", "NICKNAME_TAKEN", "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.")


def _bad_login() -> AppError:
    return AppError(401, "UNAUTHENTICATED", _BAD_LOGIN)


def _locked(until: datetime) -> AppError:
    return AppError(
        401, "LOGIN_LOCKED", f"로그인을 여러 번 잘못해서 잠시 막혔어요. {until:%H:%M} 이후에 다시 시도해 주세요."
    )


def normalize_email(email: str) -> str:
    return email.strip().lower()


def supplier_review_status(db: Session, user: User) -> str | None:
    if user.role != "SUPPLIER":
        return None
    return db.scalar(select(Supplier.review_status).where(Supplier.user_id == user.id))


def landing(db: Session, user: User) -> str:
    return calc.landing_for(user.role, supplier_review_status(db, user))


def check_available(db: Session, field: str, value: str) -> tuple[bool, str]:
    """가입 화면 [중복 확인]: 모양이 틀리면 400, 이미 있으면 (False, 이유), 쓸 수 있으면 (True, 안내).
    가입할 때도 같은 검사를 다시 한다 (확인과 가입 사이에 다른 사람이 먼저 가입할 수 있어서)."""
    value = (value or "").strip()
    if field == "email":
        if not value:
            reason = "이메일을 입력해 주세요"
        elif len(value) > 255 or not calc.EMAIL_RE.fullmatch(value):
            reason = "이메일 형식을 확인해 주세요"
        else:
            taken = db.scalar(select(User.id).where(User.email == normalize_email(value))) is not None
            return (False, _email_taken().message) if taken else (True, "쓸 수 있는 이메일이에요.")
    else:
        if not value:
            reason = "닉네임을 입력해 주세요"
        elif len(value) > 30:
            reason = "닉네임은 30자까지 입력할 수 있어요"
        else:
            taken = db.scalar(select(User.id).where(User.nickname == value)) is not None
            return (False, _nickname_taken().message) if taken else (True, "쓸 수 있는 닉네임이에요.")
    raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": field, "reason": reason}])


def signup(db: Session, body: SignupIn, *, now: datetime) -> User:
    """AC-F1-01·02·03: 칸 검사 → 만 14세 → 필수 약관 → 중복 → 저장 (약관 4종을 버전·일시와 함께)."""
    data = calc.SignupInput(
        name=body.name,
        phone=body.phone,
        email=body.email,
        birth_date=body.birth_date,
        nickname=body.nickname,
        password=body.password,
        signup_purpose=body.signup_purpose,
        musician_type=body.musician_type,
        signup_channel=body.signup_channel,
    )
    today: date = now.date()
    errors = calc.signup_field_errors(data, today)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    if calc.is_under_age(body.birth_date, today):
        raise AppError(
            400, "UNDER_AGE", "만 14세 이상만 가입할 수 있어요.", [{"field": "birthDate", "reason": "만 14세 미만"}]
        )
    _require_terms(body.agreements)

    email = normalize_email(body.email)
    nickname = body.nickname.strip()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise _email_taken()
    if db.scalar(select(User.id).where(User.nickname == nickname)) is not None:
        raise _nickname_taken()

    user = User(
        role="USER",
        email=email,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        phone=body.phone.strip(),
        birth_date=body.birth_date,
        nickname=nickname,
        signup_purpose=body.signup_purpose.strip(),
        musician_type=(body.musician_type or "").strip() or None,
        signup_channel=(body.signup_channel or "").strip() or None,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        # 위 검사와 저장 사이에 같은 이메일·닉네임이 먼저 들어온 경우 (동시 가입)
        db.rollback()
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            raise _email_taken() from None
        raise _nickname_taken() from None

    _save_terms(db, user.id, body.agreements, now)
    db.commit()
    return user


def _require_terms(agreements: AgreementsIn) -> None:
    missing_terms = [
        {"field": f"agreements.{field}", "reason": "필수 약관이에요"}
        for field, agreed in (("service", agreements.service), ("privacyRequired", agreements.privacy_required))
        if not agreed
    ]
    if missing_terms:
        raise AppError(400, "TERMS_REQUIRED", "필수 약관에 동의해야 가입할 수 있어요.", missing_terms)


def _save_terms(db: Session, user_id: int, agreements: AgreementsIn, now: datetime) -> None:
    """약관 4종을 버전·동의 일시와 함께 저장한다 (FR-AUTH-01)."""
    for terms_type, agreed in (
        ("SERVICE", agreements.service),
        ("PRIVACY_REQUIRED", agreements.privacy_required),
        ("PRIVACY_OPTIONAL", agreements.privacy_optional),
        ("MARKETING", agreements.marketing),
    ):
        db.add(
            TermsAgreement(
                user_id=user_id, terms_type=terms_type, terms_version=TERMS_VERSION, agreed=agreed, agreed_at=now
            )
        )


def signup_supplier(db: Session, body: SupplierSignupIn, *, now: datetime) -> User:
    """FR-SUP-01: 업체 1단계 가입 → 역할 SUPPLIER, 업체 정보는 아직 없음 → 첫 화면은 입점 신청(/supplier/onboarding)."""
    errors = calc.supplier_signup_field_errors(body.name, body.phone, body.email, body.password)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    _require_terms(body.agreements)

    email = normalize_email(body.email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise _email_taken()
    user = User(
        role="SUPPLIER",
        email=email,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        phone=body.phone.strip(),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()  # 동시에 같은 이메일로 가입한 경우
        raise _email_taken() from None
    _save_terms(db, user.id, body.agreements, now)
    db.commit()
    return user


def login(db: Session, email: str, password: str, *, now: datetime) -> User:
    """FR-AUTH-06: 연속 5회 틀리면 10분 잠금. 맞히면 실패 횟수를 0으로.

    없는 이메일·탈퇴 계정·틀린 비밀번호는 모두 같은 응답이라, 어떤 이메일이 가입됐는지 알 수 없다.
    정지(SUSPENDED) 계정은 로그인하지 못한다 (403 ACCOUNT_SUSPENDED, #24 결정).
    """
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == normalize_email(email)).with_for_update())
    if user is None:
        raise _bad_login()
    if user.locked_until is not None and user.locked_until > now:
        raise _locked(user.locked_until)

    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        locked = user.failed_login_count >= settings.login_max_failures
        if locked:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
            user.failed_login_count = 0
        db.commit()
        raise _locked(user.locked_until) if locked else _bad_login()

    if user.status == "WITHDRAWN":
        raise _bad_login()
    user.failed_login_count = 0
    user.locked_until = None
    db.commit()
    if user.status == "SUSPENDED":
        # 비밀번호가 맞을 때만 알려 준다 — 남이 정지 여부를 알아낼 수 없게
        raise _suspended()
    return user


def _suspended() -> AppError:
    return AppError(403, "ACCOUNT_SUSPENDED", "이용이 정지된 계정이라 로그인할 수 없어요.")


def active_user(db: Session, user_id: int | None) -> User | None:
    """refresh 토큰의 사용자가 아직 쓸 수 있는 계정인지 (탈퇴·정지면 아님)."""
    user = db.get(User, user_id) if user_id is not None else None
    if user is None or user.status in ("WITHDRAWN", "SUSPENDED"):
        return None
    return user
