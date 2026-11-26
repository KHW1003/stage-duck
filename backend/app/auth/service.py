"""회원 가입·로그인 (FR-AUTH-01, FR-AUTH-06). 시간·날짜는 인자로 받는다 (CLAUDE.md 6.1)."""
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import calc
from app.auth.schemas import AgreementsIn, SignupIn, SocialCompleteIn, SupplierSignupIn
from app.auth.social import SocialProfile
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.models.social import SocialAccount
from app.models.supplier import Supplier
from app.models.terms import TermsAgreement
from app.models.user import User
from app.policy import service as policy_service

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


def suspension(db: Session, user: User):
    """AC-F5-18: 정지 계정이면 정지일·사유·마지막 경고 (4번 policy.service), 아니면 None."""
    if user.status != "SUSPENDED":
        return None
    return policy_service.suspension_summary(db, user.id)


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
        elif len(value) > calc.NICKNAME_MAX:
            reason = f"닉네임은 {calc.NICKNAME_MAX}자까지 입력할 수 있어요"
        else:
            taken = db.scalar(select(User.id).where(User.nickname == value)) is not None
            return (False, _nickname_taken().message) if taken else (True, "쓸 수 있는 닉네임이에요.")
    raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": field, "reason": reason}])


def signup(db: Session, body: SignupIn, *, now: datetime) -> User:
    """AC-F1-01·02·03: 칸 검사 → 만 14세 → 필수 약관 → 중복 → 저장 (약관 4종을 버전·일시와 함께)."""
    user = _add_user(db, body, password=body.password, social=False, now=now)
    db.commit()
    return user


def social_user(db: Session, profile: SocialProfile) -> User | None:
    """AC-F1-04·10: 소셜 연결은 (provider, 고유 식별값)으로만 찾는다. 같은 이메일 계정이 있어도 합치지 않는다.

    연결이 없으면 None (→ 추가 정보 화면). 탈퇴 계정은 이메일 로그인과 같은 401. 정지 계정도 로그인된다 (AC-F5-18).
    연결이 없는데 같은 이메일로 가입한 계정이 있으면 EMAIL_TAKEN — 콜백은 /login?social=failed 로 보낸다 (계약서 2.1).
    """
    user = db.scalar(
        select(User)
        .join(SocialAccount, SocialAccount.user_id == User.id)
        .where(SocialAccount.provider == profile.provider, SocialAccount.provider_user_id == profile.provider_user_id)
    )
    if user is None:
        if profile.email and db.scalar(select(User.id).where(User.email == normalize_email(profile.email))) is not None:
            raise _email_taken()
        return None
    if user.status == "WITHDRAWN":
        raise _bad_login()
    return user  # 정지 계정도 로그인은 된다 — 화면이 /me 의 status 로 정지 안내를 띄운다 (AC-F5-18)


def social_complete(db: Session, profile: SocialProfile, body: SocialCompleteIn, *, now: datetime) -> User:
    """AC-F1-05·06·07·10: 추가 정보(화면에서 고친 값) + 우리 약관 동의 → 사용자 가입 + 소셜 연결.

    비밀번호는 받지 않는다(FR-AUTH-04). 업체는 소셜로 가입하지 않으므로 역할은 언제나 USER (Q-37).
    같은 이메일 계정이 있으면 EMAIL_TAKEN — 기존 계정에 붙이지 않는다 (AC-F1-10).
    """
    linked = select(SocialAccount.id).where(
        SocialAccount.provider == profile.provider, SocialAccount.provider_user_id == profile.provider_user_id
    )
    if db.scalar(linked) is not None:
        raise _already_linked()
    user = _add_user(db, body, password=None, social=True, now=now)
    db.add(
        SocialAccount(
            user_id=user.id, provider=profile.provider, provider_user_id=profile.provider_user_id, connected_at=now
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()  # 같은 소셜 계정으로 두 번 동시에 완료한 경우 — UNIQUE(provider, provider_user_id)
        raise _already_linked() from None
    db.commit()
    return user


def _already_linked() -> AppError:
    return AppError(409, "SOCIAL_ALREADY_LINKED", "이미 가입된 소셜 계정이에요. 다시 로그인해 주세요.")


def _add_user(db: Session, body: SocialCompleteIn, *, password: str | None, social: bool, now: datetime) -> User:
    """이메일 가입·소셜 가입이 같이 쓰는 칸 검사·저장 (커밋하지 않는다). 소셜 가입은 비밀번호 없이 저장한다."""
    data = calc.SignupInput(
        name=body.name,
        phone=body.phone,
        email=body.email,
        birth_date=body.birth_date,
        nickname=body.nickname,
        password=password,
        signup_purpose=body.signup_purpose,
        musician_type=body.musician_type,
        signup_channel=body.signup_channel,
    )
    today: date = now.date()
    errors = calc.signup_field_errors(data, today, password_required=not social)
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
        password_hash=None if social else hash_password(password),
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
    정지(SUSPENDED) 계정도 로그인은 된다 (api-contract.md 6.1, D-48, AC-F5-18). /me·1:1 문의 말고는 쓸 수 없고,
    화면이 정지 안내를 띄운다. 비밀번호가 틀리면 다른 계정과 같은 답이라 정지 여부를 알 수 없다.
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
    return user


def active_user(db: Session, user_id: int | None) -> User | None:
    """refresh 토큰의 사용자가 아직 쓸 수 있는 계정인지 (탈퇴·정지면 아님)."""
    user = db.get(User, user_id) if user_id is not None else None
    if user is None or user.status in ("WITHDRAWN", "SUSPENDED"):
        return None
    return user
