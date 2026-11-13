"""로그인 쿠키 토큰 (plan.md 4장, api-contract.md 1장).

- access_token: 서명한 사용자 id. httpOnly 쿠키라 화면 코드에서 읽을 수 없다 (CLAUDE.md 25).
- csrf_token: double submit 용 값. 화면이 읽어서 X-CSRF-Token 헤더에 넣는다 (검사는 #24).

임시 구현: 지금은 이미 설치된 itsdangerous 로 서명한다. 진짜 로그인(#24)에서 JWT 로 바꾼다.
바꿀 때는 이 파일 안쪽만 고치고, issue_access_token / read_access_token / set_login_cookies 의 모양은 그대로 둔다.
"""
import secrets

from fastapi import Response
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app.core.config import get_settings

ACCESS_COOKIE = "access_token"
CSRF_COOKIE = "csrf_token"
_SALT = "stageduck-access-token"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().jwt_secret, salt=_SALT)


def issue_access_token(user_id: int) -> str:
    return _serializer().dumps({"uid": user_id})


def read_access_token(token: str | None) -> int | None:
    """서명이 맞고 만료되지 않았으면 사용자 id, 아니면 None. 만료(SignatureExpired)도 BadSignature 에 들어간다."""
    if not token:
        return None
    try:
        data = _serializer().loads(token, max_age=get_settings().access_token_minutes * 60)
    except BadSignature:
        return None
    uid = data.get("uid") if isinstance(data, dict) else None
    return uid if isinstance(uid, int) and not isinstance(uid, bool) else None


def set_login_cookies(response: Response, user_id: int) -> None:
    """로그인 쿠키 두 개를 붙인다. Secure 는 운영(https)에서만 — 로컬·테스트는 http 라서 켜면 쿠키가 안 돌아온다."""
    settings = get_settings()
    secure = settings.app_env == "prod"
    max_age = settings.access_token_minutes * 60
    response.set_cookie(
        ACCESS_COOKIE, issue_access_token(user_id), max_age=max_age, httponly=True, secure=secure, samesite="lax"
    )
    response.set_cookie(
        CSRF_COOKIE, secrets.token_urlsafe(32), max_age=max_age, httponly=False, secure=secure, samesite="lax"
    )
