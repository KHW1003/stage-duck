"""로그인 쿠키 토큰 (plan.md 4장, api-contract.md 1장).

- access_token: JWT(HS256), 30분. httpOnly 라 화면 코드에서 읽을 수 없다 (CLAUDE.md 25).
- refresh_token: JWT(HS256), 14일. /api/v1/auth 아래로만 보낸다.
- csrf_token: double submit 용 값. 화면이 읽어서 X-CSRF-Token 헤더에 넣는다 (app/auth/csrf.py 가 검사).

access 와 refresh 는 typ 로 구분해서, 한쪽을 다른 쪽 자리에 쓸 수 없다.
"""
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Response

from app.core.config import get_settings

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"
REFRESH_PATH = "/api/v1/auth"
ALGORITHM = "HS256"
ACCESS, REFRESH = "access", "refresh"


def _encode(user_id: int, typ: str, lifetime: timedelta, now: datetime | None) -> str:
    issued = now or datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "typ": typ, "iat": issued, "exp": issued + lifetime}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=ALGORITHM)


def _decode(token: str | None, typ: str) -> int | None:
    """서명이 맞고, 만료되지 않았고, 종류(typ)가 맞으면 사용자 id. 아니면 None."""
    if not token:
        return None
    try:
        data = jwt.decode(
            token, get_settings().jwt_secret, algorithms=[ALGORITHM], options={"require": ["exp", "sub", "typ"]}
        )
    except jwt.InvalidTokenError:
        return None
    sub = data.get("sub")
    if data.get("typ") != typ or not isinstance(sub, str) or not sub.isdigit():
        return None
    return int(sub)


def issue_access_token(user_id: int, *, now: datetime | None = None) -> str:
    return _encode(user_id, ACCESS, timedelta(minutes=get_settings().access_token_minutes), now)


def issue_refresh_token(user_id: int, *, now: datetime | None = None) -> str:
    return _encode(user_id, REFRESH, timedelta(days=get_settings().refresh_token_days), now)


def read_access_token(token: str | None) -> int | None:
    return _decode(token, ACCESS)


def read_refresh_token(token: str | None) -> int | None:
    return _decode(token, REFRESH)


def set_login_cookies(response: Response, user_id: int) -> None:
    """로그인 쿠키 세 개를 붙인다. Secure 는 운영(https)에서만 — 로컬·테스트는 http 라서 켜면 쿠키가 안 돌아온다.

    csrf_token 은 refresh 와 같은 기간을 둔다 — access 가 만료된 뒤에도 /auth/refresh 를 CSRF 헤더와 함께 부를 수 있게.
    """
    settings = get_settings()
    secure = settings.app_env == "prod"
    access_age = settings.access_token_minutes * 60
    refresh_age = settings.refresh_token_days * 24 * 60 * 60
    response.set_cookie(
        ACCESS_COOKIE, issue_access_token(user_id), max_age=access_age, httponly=True, secure=secure, samesite="lax"
    )
    response.set_cookie(
        REFRESH_COOKIE,
        issue_refresh_token(user_id),
        max_age=refresh_age,
        path=REFRESH_PATH,
        httponly=True,
        secure=secure,
        samesite="lax",
    )
    response.set_cookie(
        CSRF_COOKIE, secrets.token_urlsafe(32), max_age=refresh_age, httponly=False, secure=secure, samesite="lax"
    )


def clear_login_cookies(response: Response) -> None:
    """FR-AUTH-06 로그아웃: 세 쿠키를 지운다 (붙일 때와 같은 path 로)."""
    settings = get_settings()
    secure = settings.app_env == "prod"
    response.delete_cookie(ACCESS_COOKIE, httponly=True, secure=secure, samesite="lax")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH, httponly=True, secure=secure, samesite="lax")
    response.delete_cookie(CSRF_COOKIE, httponly=False, secure=secure, samesite="lax")
