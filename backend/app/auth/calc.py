"""가입·로그인 규칙 중 DB 를 모르는 순수 함수 (CLAUDE.md 6.1). 오늘 날짜는 인자로 받는다."""
import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime

MIN_AGE = 14  # FR-AUTH-01, D-15
PHONE_RE = re.compile(r"^0\d{8,10}$")  # 숫자만, 0으로 시작, 9~11자리 (data-model: 숫자만 저장)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN, PASSWORD_MAX = 8, 72  # bcrypt 는 72바이트까지만 본다
NICKNAME_MAX = 15  # 11/26 목산: 커뮤니티 목록에서 글자가 밀려서 30 → 15 (DB 칸은 VARCHAR(30) 그대로)

LANDING_USER = "/me/performances"
LANDING_SUPPLIER_APPROVED = "/supplier/postings"
LANDING_SUPPLIER_ONBOARDING = "/supplier/onboarding"
LANDING_ADMIN = "/admin"


@dataclass(frozen=True)
class SignupInput:
    name: str | None
    phone: str | None
    email: str | None
    birth_date: date | None
    nickname: str | None
    password: str | None
    signup_purpose: str | None
    musician_type: str | None
    signup_channel: str | None


def age_on(birth: date, today: date) -> int:
    """만 나이. 생일 당일부터 한 살 더한다."""
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def is_under_age(birth: date, today: date) -> bool:
    """AC-F1-03: 만 14세 미만이면 True."""
    return age_on(birth, today) < MIN_AGE


def _blank(value: str | None) -> bool:
    return value is None or not value.strip()


def password_ok(pw: str) -> bool:
    """가입 규칙과 같은 비밀번호 규칙 (8~72자, 영문+숫자). 비밀번호 찾기(AC-F1-22)도 쓴다."""
    return _password_ok(pw)


def _password_ok(pw: str) -> bool:
    return (
        PASSWORD_MIN <= len(pw) <= PASSWORD_MAX
        and len(pw.encode("utf-8")) <= PASSWORD_MAX
        and any(c.isascii() and c.isalpha() for c in pw)
        and any(c.isdigit() for c in pw)
    )


def signup_field_errors(data: SignupInput, today: date, *, password_required: bool = True) -> list[dict]:
    """AC-F1-01: 비었거나 형식이 틀린 칸마다 이유를 하나씩 돌려준다 (필드 이름은 API 의 camelCase).

    소셜 추가 정보(FR-AUTH-04)는 비밀번호를 받지 않으므로 password_required=False 로 부른다.
    """
    errors: list[dict] = []

    def add(field: str, reason: str) -> None:
        errors.append({"field": field, "reason": reason})

    required = [
        ("name", data.name, "이름을 입력해 주세요"),
        ("phone", data.phone, "전화번호를 입력해 주세요"),
        ("email", data.email, "이메일을 입력해 주세요"),
        ("nickname", data.nickname, "닉네임을 입력해 주세요"),
        ("signupPurpose", data.signup_purpose, "가입 목적을 골라 주세요"),
    ]
    if password_required:
        required.append(("password", data.password, "비밀번호를 입력해 주세요"))
    for field, value, reason in required:
        if _blank(value):
            add(field, reason)
    if data.birth_date is None:
        add("birthDate", "생년월일을 입력해 주세요")

    if not _blank(data.name) and len(data.name.strip()) > 50:
        add("name", "이름은 50자까지 입력할 수 있어요")
    if not _blank(data.phone) and not PHONE_RE.fullmatch(data.phone.strip()):
        add("phone", "전화번호는 숫자만 9~11자리로 입력해 주세요 (예: 01012345678)")
    if not _blank(data.email):
        email = data.email.strip()
        if len(email) > 255 or not EMAIL_RE.fullmatch(email):
            add("email", "이메일 형식을 확인해 주세요")
    if not _blank(data.nickname) and len(data.nickname.strip()) > NICKNAME_MAX:
        add("nickname", f"닉네임은 {NICKNAME_MAX}자까지 입력할 수 있어요")
    if not _blank(data.password) and not _password_ok(data.password):
        add("password", "비밀번호는 8~72자, 영문과 숫자를 함께 넣어 주세요")
    if not _blank(data.signup_purpose) and len(data.signup_purpose.strip()) > 30:
        add("signupPurpose", "가입 목적을 다시 골라 주세요")
    if data.musician_type is not None and len(data.musician_type.strip()) > 20:
        add("musicianType", "뮤지션 유형을 다시 골라 주세요")
    if data.signup_channel is not None and len(data.signup_channel.strip()) > 30:
        add("signupChannel", "가입 경로를 다시 골라 주세요")
    if data.birth_date is not None and data.birth_date > today:
        add("birthDate", "생년월일을 확인해 주세요")
    return errors


def supplier_signup_field_errors(name: str | None, phone: str | None, email: str | None, password: str | None) -> list[dict]:
    """FR-SUP-01: 업체 1단계(이메일·비밀번호·담당자 이름·담당자 전화). 칸 규칙은 사용자 가입과 같다."""
    errors: list[dict] = []
    for field, value, reason in (
        ("email", email, "이메일을 입력해 주세요"),
        ("password", password, "비밀번호를 입력해 주세요"),
        ("name", name, "담당자 이름을 입력해 주세요"),
        ("phone", phone, "담당자 전화번호를 입력해 주세요"),
    ):
        if _blank(value):
            errors.append({"field": field, "reason": reason})
    if not _blank(email) and (len(email.strip()) > 255 or not EMAIL_RE.fullmatch(email.strip())):
        errors.append({"field": "email", "reason": "이메일 형식을 확인해 주세요"})
    if not _blank(password) and not _password_ok(password):
        errors.append({"field": "password", "reason": "비밀번호는 8~72자, 영문과 숫자를 함께 넣어 주세요"})
    if not _blank(name) and len(name.strip()) > 50:
        errors.append({"field": "name", "reason": "이름은 50자까지 입력할 수 있어요"})
    if not _blank(phone) and not PHONE_RE.fullmatch(phone.strip()):
        errors.append({"field": "phone", "reason": "전화번호는 숫자만 9~11자리로 입력해 주세요 (예: 01012345678)"})
    return errors


def landing_for(role: str, supplier_review_status: str | None) -> str:
    """AC-F1-11: 사용자 = 내 공연 / 업체 = 공고 목록(승인 전에는 입점·심사 상태) / 관리자 = 심사 대기(SQLAdmin)."""
    if role == "USER":
        return LANDING_USER
    if role == "SUPPLIER":
        return LANDING_SUPPLIER_APPROVED if supplier_review_status == "APPROVED" else LANDING_SUPPLIER_ONBOARDING
    if role == "ADMIN":
        return LANDING_ADMIN
    raise ValueError(f"알 수 없는 역할: {role}")


# ---------- 비밀번호 찾기 (D-55, AC-F1-21·22) ----------
RESET_TOKEN_MINUTES = 30
RESET_WINDOW_MINUTES = 10
RESET_MAX_PER_WINDOW = 3


def sha256_hex(value: str) -> str:
    """토큰·이메일은 원문 대신 SHA-256 으로 저장한다."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def reset_rate_limited(recent_requests: int) -> bool:
    """같은 이메일 10분 안 요청이 이미 3번이면 더 받지 않는다."""
    return recent_requests >= RESET_MAX_PER_WINDOW


def refresh_revoked(issued_at: int, last_reset_at: datetime | None) -> bool:
    """비밀번호를 바꾼 시각보다 먼저 발급된 Refresh 는 끊는다. issued_at 은 JWT iat(초)."""
    return last_reset_at is not None and issued_at < int(last_reset_at.timestamp())
