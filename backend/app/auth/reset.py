"""비밀번호 찾기 (FR-AUTH-09, D-55 · AC-F1-21·22·23). 시간은 인자로 받는다 (CLAUDE.md 6.1).

- 요청: 이메일로 가입한(비밀번호가 있는) 계정만 링크를 만든다. 가입 안 함·탈퇴는 404 EMAIL_NOT_REGISTERED,
  네이버 전용은 409 SOCIAL_ACCOUNT 로 알려 준다 (11/19 팀 결정 — 가입 화면이 이미 EMAIL_TAKEN 으로 알려 줌).
- 메일: MAIL_BACKEND=smtp 면 실제로 보낸다 (app/core/mail.py). console 이면 서버 로그에 남기고,
  테스트 환경(APP_ENV=test)이면 화면에 시연용 링크도 돌려준다 (smtp 일 때는 화면에 링크를 주지 않는다).
- 확인: 30분 안·처음 쓰는 링크만. 바꾸면 그 계정의 다른 링크도 모두 쓴 것으로 하고, 이전 Refresh 를 끊는다.
"""
import secrets
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import calc
from app.auth.service import normalize_email
from app.core import mail
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password
from app.models.password_reset import PasswordResetRequest, PasswordResetToken
from app.models.user import User

RESET_PATH = "/password/reset"


def _rate_limited() -> AppError:
    return AppError(
        429,
        "PASSWORD_RESET_RATE_LIMITED",
        f"같은 이메일은 {calc.RESET_WINDOW_MINUTES}분에 {calc.RESET_MAX_PER_WINDOW}번까지 요청할 수 있어요. 잠시 뒤 다시 시도해 주세요.",
    )


def _token_invalid() -> AppError:
    return AppError(400, "RESET_TOKEN_INVALID", "링크가 만료됐어요. 새 링크를 받아 주세요.")


def request_reset(db: Session, email: str, *, now: datetime) -> str | None:
    """AC-F1-21·23. 시연용 링크(테스트 환경에서만)를 돌려준다. 그 밖에는 None."""
    email = normalize_email(email)
    email_hash = calc.sha256_hex(email)
    since = now - timedelta(minutes=calc.RESET_WINDOW_MINUTES)
    recent = db.scalar(
        select(func.count())
        .select_from(PasswordResetRequest)
        .where(PasswordResetRequest.email_hash == email_hash, PasswordResetRequest.requested_at > since)
    )
    if calc.reset_rate_limited(recent or 0):
        raise _rate_limited()
    db.add(PasswordResetRequest(email_hash=email_hash, requested_at=now))

    user = db.scalar(select(User).where(User.email == email))
    # 11/19 팀 결정: 가입 화면이 이미 "이미 가입된 이메일"을 알려 주므로 여기서도 알려 준다 (AC-F1-21·23 바꿈).
    # 요청 기록은 먼저 남겨 같은 이메일 10분 3회 제한은 그대로 걸린다.
    if user is None or user.status == "WITHDRAWN":
        db.commit()
        raise AppError(404, "EMAIL_NOT_REGISTERED", "가입하지 않은 이메일이에요. 이메일을 확인하거나 회원가입해 주세요.",
                       [{"field": "email", "reason": "가입하지 않은 이메일이에요."}])
    if user.password_hash is None:
        db.commit()
        raise AppError(409, "SOCIAL_ACCOUNT", "네이버로 가입한 계정이라 비밀번호가 없어요. 로그인 화면에서 [네이버로 로그인]을 눌러 주세요.",
                       [{"field": "email", "reason": "네이버로 가입한 계정이에요."}])

    token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=calc.sha256_hex(token),
            expires_at=now + timedelta(minutes=calc.RESET_TOKEN_MINUTES),
            created_at=now,
        )
    )
    db.commit()
    return _send(email, token)


RESET_SUBJECT = "[STAGE DUCK] 비밀번호 재설정 링크"


def reset_mail_text(link: str) -> str:
    lines = [
        "안녕하세요, STAGE DUCK입니다.",
        "",
        f"아래 링크에서 새 비밀번호를 설정해 주십시오. 링크는 {calc.RESET_TOKEN_MINUTES}분 동안 한 번만 사용할 수 있습니다.",
        "",
        link,
        "",
        "비밀번호 찾기를 요청하지 않으셨다면 이 메일은 삭제해 주십시오. 비밀번호는 변경되지 않습니다.",
        "본 메일은 발신 전용입니다.",
    ]
    return chr(10).join(lines)


def _send(email: str, token: str) -> str | None:
    settings = get_settings()
    path = f"{RESET_PATH}?token={token}"
    mail.send_mail(email, RESET_SUBJECT, reset_mail_text(f"{settings.public_base_url}{path}"))
    return path if settings.is_test_env and settings.mail_backend == "console" else None


def confirm_reset(db: Session, token: str, password: str, *, now: datetime) -> None:
    """AC-F1-22. 링크 확인 → 비밀번호 규칙 → 저장 + 이 계정의 남은 링크 모두 사용 처리."""
    row = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == calc.sha256_hex(token)).with_for_update()
    )
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise _token_invalid()
    user = db.get(User, row.user_id)
    if user is None or user.status == "WITHDRAWN":
        raise _token_invalid()
    if not calc.password_ok(password):
        reason = "비밀번호는 8~72자, 영문과 숫자를 함께 넣어 주세요"
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": "password", "reason": reason}])

    user.password_hash = hash_password(password)
    user.failed_login_count = 0
    user.locked_until = None
    for other in db.scalars(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
    ):
        other.used_at = now
    db.commit()


def last_reset_at(db: Session, user_id: int) -> datetime | None:
    """마지막으로 비밀번호를 바꾼 시각 — 이보다 먼저 발급된 Refresh 는 받지 않는다."""
    return db.scalar(
        select(func.max(PasswordResetToken.used_at)).where(PasswordResetToken.user_id == user_id)
    )
