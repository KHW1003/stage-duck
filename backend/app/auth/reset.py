"""비밀번호 찾기 (FR-AUTH-09, D-55 · AC-F1-21·22·23). 시간은 인자로 받는다 (CLAUDE.md 6.1).

- 요청: 가입 여부·소셜 계정 여부와 상관없이 같은 응답. 링크는 이메일로 가입한(비밀번호가 있는) 계정만 만든다.
- 메일: MAIL_BACKEND=console 이면 링크를 서버 로그에 남긴다. 테스트 환경이면 화면에 시연용 링크도 돌려준다.
- 확인: 30분 안·처음 쓰는 링크만. 바꾸면 그 계정의 다른 링크도 모두 쓴 것으로 하고, 이전 Refresh 를 끊는다.
"""
import logging
import secrets
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import calc
from app.auth.service import normalize_email
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import hash_password
from app.models.password_reset import PasswordResetRequest, PasswordResetToken
from app.models.user import User

log = logging.getLogger("stageduck.mail")
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
    if user is None or user.password_hash is None or user.status == "WITHDRAWN":
        db.commit()  # 가입 안 함·소셜 전용·탈퇴: 링크 없이 같은 응답 (AC-F1-23)
        return None

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


def _send(email: str, token: str) -> str | None:
    settings = get_settings()
    path = f"{RESET_PATH}?token={token}"
    if settings.mail_backend == "console":
        log.warning("[메일 대신 로그] 비밀번호 재설정 링크 → %s : %s%s", email, settings.public_base_url, path)
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
