"""네이버·카카오 로그인 호출 (FR-AUTH-02·03, plan.md 4장 OAuth 2.0 Authorization Code).

- 요청을 처리하는 중에 외부 API 를 부르는 유일한 곳이다 (CLAUDE.md 28 예외: 소셜 로그인 콜백).
- 테스트는 fetch_profile 을 목업으로 바꾼다. 실제 네이버·카카오를 부르지 않는다.
- 새 라이브러리를 더하지 않으려고 표준 라이브러리(urllib)로 부른다 (CLAUDE.md 31).
- 키 값·토큰을 로그에 남기지 않는다 (CLAUDE.md 22·23).
"""
import json
import re
from dataclasses import dataclass
from datetime import date
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import get_settings

NAVER, KAKAO = "NAVER", "KAKAO"
NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize"
NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token"
NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me"
KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_PROFILE_URL = "https://kapi.kakao.com/v2/user/me"
TIMEOUT_SECONDS = 5


class SocialError(Exception):
    """네이버·카카오가 실패를 돌려줬거나, 응답에 회원 고유 식별값이 없을 때."""


@dataclass(frozen=True)
class SocialProfile:
    """소셜에서 받아 온 값. 고유 식별값 말고는 모두 없을 수 있다 (선택 동의 해제, 카카오 승인 전 — AC-F1-05·09)."""

    provider: str
    provider_user_id: str
    email: str | None = None
    name: str | None = None
    phone: str | None = None
    birth_date: date | None = None
    nickname: str | None = None


def is_enabled(provider: str) -> bool:
    """FR-AUTH-03: 카카오는 KAKAO_LOGIN_ENABLED 로 켜고 끈다 (기본 꺼짐). 네이버는 언제나 켜져 있다."""
    return provider == NAVER or get_settings().kakao_login_enabled


def authorize_url(provider: str, state: str, redirect_uri: str) -> str:
    """AC-F1-04: 로그인 동의 화면 주소. state 는 콜백에서 쿠키와 비교한다 (NFR-SEC-10)."""
    settings = get_settings()
    base, client_id = (
        (NAVER_AUTHORIZE_URL, settings.naver_client_id)
        if provider == NAVER
        else (KAKAO_AUTHORIZE_URL, settings.kakao_client_id)
    )
    query = {"response_type": "code", "client_id": client_id, "redirect_uri": redirect_uri, "state": state}
    return f"{base}?{urlencode(query)}"


def fetch_profile(provider: str, code: str, *, state: str, redirect_uri: str) -> SocialProfile:
    """콜백에서 받은 code 로 토큰을 받고 회원 정보를 읽는다. 실패하면 SocialError."""
    settings = get_settings()
    if provider == NAVER:
        token = _post_form(
            NAVER_TOKEN_URL,
            {
                "grant_type": "authorization_code",
                "client_id": settings.naver_client_id,
                "client_secret": settings.naver_client_secret,
                "code": code,
                "state": state,
            },
        )
        return parse_naver(_get_json(NAVER_PROFILE_URL, _access_token(token)))
    token = _post_form(
        KAKAO_TOKEN_URL,
        {
            "grant_type": "authorization_code",
            "client_id": settings.kakao_client_id,
            "redirect_uri": redirect_uri,
            "code": code,
        },
    )
    return parse_kakao(_get_json(KAKAO_PROFILE_URL, _access_token(token)))


def parse_naver(data: dict) -> SocialProfile:
    """네이버 회원 프로필 응답 → SocialProfile. 생일·별명은 선택 동의라 없을 수 있다 (AC-F1-05)."""
    body = data.get("response") if data.get("resultcode") == "00" else None
    if not isinstance(body, dict) or not body.get("id"):
        raise SocialError("네이버 회원 정보를 받지 못했어요")
    return SocialProfile(
        provider=NAVER,
        provider_user_id=str(body["id"]),
        email=_text(body.get("email")),
        name=_text(body.get("name")),
        phone=_digits(body.get("mobile")),
        birth_date=_birth_date(body.get("birthyear"), body.get("birthday")),
        nickname=_text(body.get("nickname")),
    )


def parse_kakao(data: dict) -> SocialProfile:
    """카카오 회원 정보 응답 → SocialProfile. 비즈 앱 승인 전에는 닉네임만 온다 (FR-AUTH-03).

    이메일은 카카오가 인증했다고 알려 준 것만 쓴다.
    """
    if not data.get("id"):
        raise SocialError("카카오 회원 정보를 받지 못했어요")
    account = data.get("kakao_account") or {}
    profile = account.get("profile") or {}
    properties = data.get("properties") or {}
    verified = account.get("is_email_valid") and account.get("is_email_verified")
    return SocialProfile(
        provider=KAKAO,
        provider_user_id=str(data["id"]),
        email=_text(account.get("email")) if verified else None,
        nickname=_text(profile.get("nickname") or properties.get("nickname")),
    )


def to_claims(profile: SocialProfile) -> dict:
    """signup_token 에 넣을 값 (camelCase, 날짜는 ISO 글자)."""
    return {
        "provider": profile.provider,
        "providerUserId": profile.provider_user_id,
        "email": profile.email,
        "name": profile.name,
        "phone": profile.phone,
        "birthDate": profile.birth_date.isoformat() if profile.birth_date else None,
        "nickname": profile.nickname,
    }


def from_claims(claims: dict) -> SocialProfile:
    birth = claims.get("birthDate")
    return SocialProfile(
        provider=claims["provider"],
        provider_user_id=claims["providerUserId"],
        email=claims.get("email"),
        name=claims.get("name"),
        phone=claims.get("phone"),
        birth_date=date.fromisoformat(birth) if birth else None,
        nickname=claims.get("nickname"),
    )


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _digits(value: object) -> str | None:
    """'010-0000-0000' → '01000000000' (data-model: 전화번호는 숫자만 저장)."""
    return re.sub(r"\D", "", value) or None if isinstance(value, str) else None


def _birth_date(year: object, month_day: object) -> date | None:
    """출생연도 '1999' + 생일 '03-02' → date. 하나라도 없거나 틀리면 None (화면에서 직접 입력)."""
    if not isinstance(year, str) or not isinstance(month_day, str):
        return None
    try:
        return date.fromisoformat(f"{year.strip()}-{month_day.strip()}")
    except ValueError:
        return None


def _access_token(token_response: dict) -> str:
    token = token_response.get("access_token")
    if not isinstance(token, str) or not token:
        raise SocialError("로그인 토큰을 받지 못했어요")
    return token


def _post_form(url: str, form: dict) -> dict:
    request = Request(url, data=urlencode(form).encode("utf-8"), method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
    return _send(request)


def _get_json(url: str, access_token: str) -> dict:
    request = Request(url, method="GET")
    request.add_header("Authorization", f"Bearer {access_token}")
    return _send(request)


def _send(request: Request) -> dict:
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 — 주소는 위 상수(https)뿐
            data = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, ValueError) as exc:
        raise SocialError("소셜 로그인 서버와 연결하지 못했어요") from exc
    if not isinstance(data, dict):
        raise SocialError("소셜 로그인 응답을 읽지 못했어요")
    return data
