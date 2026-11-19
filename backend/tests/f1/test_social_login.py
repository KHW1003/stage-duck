"""네이버 로그인·카카오(기본 꺼짐)·소셜 추가 정보 — AC-F1-04~10 (FR-AUTH-02~05, 이슈 #25).

- 네이버·카카오 호출은 app.auth.social.fetch_profile 을 목업으로 바꾼다. 실제 외부 API 를 부르지 않는다 (CLAUDE.md 28).
- 처음 로그인하면 10분짜리 signup_token 쿠키(httpOnly)를 붙이고 /signup/extra 로 보낸다.
  화면은 GET /auth/social/pending 으로 미리 채울 값을 받고, POST /auth/social/complete 로 가입을 끝낸다.
- 이메일·전화는 가짜 값만 쓴다 (@stageduck.test, 01000000000).
"""
from datetime import date, datetime
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth import social
from app.auth.router import get_now
from app.auth.tokens import ACCESS_COOKIE, SIGNUP_COOKIE, STATE_COOKIE, read_access_token
from app.core.config import get_settings
from app.demo.service import reset_demo
from app.main import app
from app.models import SocialAccount, TermsAgreement, User
from tests.conftest import make_user

NOW = datetime(2026, 11, 19, 10, 0)
NAVER_ID = "naver-test-0001"
KAKAO_ID = "4000000001"
LANDING_USER = "/me/performances"
EXTRA = "/signup/extra"
PENDING = "/api/v1/auth/social/pending"
COMPLETE = "/api/v1/auth/social/complete"


def _profile(provider: str = "NAVER", provider_user_id: str = NAVER_ID, **over) -> social.SocialProfile:
    data = {
        "email": "naver1@stageduck.test",
        "name": "김덕구",
        "phone": "01000000000",
        "birth_date": date(1999, 3, 2),
        "nickname": "덕구밴드",
    }
    data.update(over)
    return social.SocialProfile(provider=provider, provider_user_id=provider_user_id, **data)


def _extra(**over) -> dict:
    body = {
        "name": "김덕구",
        "phone": "01000000000",
        "email": "naver1@stageduck.test",
        "birthDate": "1999-03-02",
        "nickname": "덕구밴드",
        "signupPurpose": "PERFORMANCE",
        "musicianType": "BAND",
        "signupChannel": "SNS",
        "agreements": {"service": True, "privacyRequired": True, "privacyOptional": False, "marketing": False},
    }
    body.update(over)
    return body


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    """.env 의 실제 키를 쓰지 않게 가짜 값으로 바꾼다. 카카오는 기본 꺼짐."""
    settings = get_settings()
    monkeypatch.setattr(settings, "naver_client_id", "test-naver-id")
    monkeypatch.setattr(settings, "naver_client_secret", "test-naver-secret")
    monkeypatch.setattr(settings, "kakao_client_id", "test-kakao-id")
    monkeypatch.setattr(settings, "kakao_login_enabled", False)


@pytest.fixture(autouse=True)
def _clock():
    app.dependency_overrides[get_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_now, None)


@pytest.fixture
def provider_returns(monkeypatch):
    """콜백에서 네이버·카카오가 돌려줄 프로필을 정한다. 부른 기록(provider, code)을 돌려준다."""

    def _set(profile: social.SocialProfile) -> list:
        calls: list = []

        def fake(provider: str, code: str, *, state: str, redirect_uri: str) -> social.SocialProfile:
            calls.append((provider, code))
            return profile

        monkeypatch.setattr(social, "fetch_profile", fake)
        return calls

    return _set


def _callback(client, provider: str = "naver", *, state: str = "state-1", cookie_state: str | None = "state-1"):
    if cookie_state is not None:
        client.cookies.set(STATE_COOKIE, cookie_state)
    return client.get(
        f"/api/v1/auth/{provider}/callback", params={"code": "code-1", "state": state}, follow_redirects=False
    )


def _count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


# ---------- AC-F1-04 처음이면 추가 정보 화면으로, 가입되어 있으면 내 공연 화면으로 ----------


def test_ac_f1_04_start_redirects_to_naver_with_state_cookie(client):
    res = client.get("/api/v1/auth/naver/start", follow_redirects=False)
    assert res.status_code == 302, res.text
    url = urlparse(res.headers["location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "https://nid.naver.com/oauth2.0/authorize"
    query = parse_qs(url.query)
    assert query["response_type"] == ["code"]
    assert query["client_id"] == ["test-naver-id"]
    assert query["state"] == [res.cookies[STATE_COOKIE]]  # NFR-SEC-10: 콜백에서 비교할 값
    assert len(query["state"][0]) >= 20


def test_ac_f1_04_first_login_goes_to_extra_info(client, db, provider_returns):
    calls = provider_returns(_profile())
    res = _callback(client)
    assert res.status_code == 302, res.text
    assert res.headers["location"] == EXTRA
    assert SIGNUP_COOKIE in res.cookies
    assert ACCESS_COOKIE not in res.cookies  # 아직 로그인 아님
    assert calls == [("NAVER", "code-1")]
    assert _count(db, User) == 0 and _count(db, SocialAccount) == 0


def test_ac_f1_04_linked_account_logs_in_to_my_performances(client, db, provider_returns):
    user = make_user(db)
    db.add(SocialAccount(user_id=user.id, provider="NAVER", provider_user_id=NAVER_ID, connected_at=NOW))
    db.commit()
    provider_returns(_profile(email="changed@stageduck.test"))

    res = _callback(client)
    assert res.status_code == 302, res.text
    assert res.headers["location"] == LANDING_USER
    assert read_access_token(res.cookies[ACCESS_COOKIE]) == user.id
    assert SIGNUP_COOKIE not in res.cookies


@pytest.mark.parametrize(("state", "cookie_state"), [("other-state", "state-1"), ("state-1", None)])
def test_ac_f1_04_state_mismatch_is_refused(client, db, provider_returns, state, cookie_state):
    """NFR-SEC-10: state 가 쿠키와 다르거나 쿠키가 없으면 네이버를 부르지 않고 로그인 화면으로 돌려보낸다."""
    calls = provider_returns(_profile())
    res = _callback(client, state=state, cookie_state=cookie_state)
    assert res.status_code == 302, res.text
    assert res.headers["location"].startswith("/login")
    assert ACCESS_COOKIE not in res.cookies and SIGNUP_COOKIE not in res.cookies
    assert calls == []


def test_ac_f1_04_complete_creates_user_then_next_login_goes_in(client, db, provider_returns):
    provider_returns(_profile())
    _callback(client)

    res = client.post(COMPLETE, json=_extra())
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "USER" and body["landing"] == LANDING_USER
    assert "email" not in body and "phone" not in body  # CLAUDE.md 20
    user = db.scalar(select(User))
    assert read_access_token(res.cookies[ACCESS_COOKIE]) == user.id
    assert user.password_hash is None  # FR-AUTH-04: 비밀번호를 받지 않는다
    link = db.scalar(select(SocialAccount))
    assert (link.user_id, link.provider, link.provider_user_id) == (user.id, "NAVER", NAVER_ID)
    assert _count(db, TermsAgreement) == 4
    assert SIGNUP_COOKIE not in client.cookies  # 한 번 쓰면 지운다

    assert client.post(COMPLETE, json=_extra()).status_code == 401  # 같은 토큰으로 두 번 가입되지 않는다
    res = _callback(client)
    assert res.headers["location"] == LANDING_USER
    assert read_access_token(res.cookies[ACCESS_COOKIE]) == user.id
    assert _count(db, User) == 1


# ---------- AC-F1-05 선택 항목(생일 등)을 해제해도 직접 입력하면 가입된다 ----------


def test_ac_f1_05_parse_naver_without_optional_consent():
    full = social.parse_naver(
        {
            "resultcode": "00",
            "response": {
                "id": NAVER_ID,
                "email": "naver1@stageduck.test",
                "name": "김덕구",
                "mobile": "010-0000-0000",
                "birthyear": "1999",
                "birthday": "03-02",
                "nickname": "덕구밴드",
            },
        }
    )
    assert (full.provider, full.provider_user_id, full.phone, full.birth_date) == (
        "NAVER",
        NAVER_ID,
        "01000000000",
        date(1999, 3, 2),
    )
    bare = social.parse_naver(
        {"resultcode": "00", "response": {"id": NAVER_ID, "email": "naver1@stageduck.test", "name": "김덕구", "mobile": "010-0000-0000"}}
    )
    assert bare.birth_date is None and bare.nickname is None


def test_ac_f1_05_optional_items_typed_in_extra_info(client, db, provider_returns):
    provider_returns(_profile(birth_date=None, nickname=None))
    _callback(client)
    pending = client.get(PENDING).json()
    assert pending["birthDate"] is None and pending["nickname"] is None

    res = client.post(COMPLETE, json=_extra(birthDate=None))
    assert res.status_code == 400, res.text
    assert {e["field"] for e in res.json()["fieldErrors"]} == {"birthDate"}

    res = client.post(COMPLETE, json=_extra(birthDate="1999-03-02", nickname="직접쓴닉네임"))
    assert res.status_code == 201, res.text
    user = db.scalar(select(User))
    assert (user.birth_date, user.nickname) == (date(1999, 3, 2), "직접쓴닉네임")


# ---------- AC-F1-06 소셜에서 받은 값이 미리 채워진다 (서버 부분: pending 응답) ----------


def test_ac_f1_06_pending_returns_prefill_only_to_token_holder(client, provider_returns):
    assert client.get(PENDING).status_code == 401  # 토큰 없으면 아무것도 주지 않는다

    provider_returns(_profile())
    _callback(client)
    res = client.get(PENDING)
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    assert res.json() == {
        "provider": "NAVER",
        "email": "naver1@stageduck.test",
        "name": "김덕구",
        "phone": "01000000000",
        "birthDate": "1999-03-02",
        "nickname": "덕구밴드",
    }


def test_ac_f1_06_edited_values_are_saved(client, db, provider_returns):
    provider_returns(_profile())
    _callback(client)
    res = client.post(COMPLETE, json=_extra(name="김덕구수정", email="edited@stageduck.test"))
    assert res.status_code == 201, res.text
    user = db.scalar(select(User))
    assert (user.name, user.email) == ("김덕구수정", "edited@stageduck.test")


# ---------- AC-F1-07 우리 약관에 동의하지 않으면 가입이 끝나지 않는다 ----------


@pytest.mark.parametrize("missing", ["service", "privacyRequired"])
def test_ac_f1_07_without_our_terms_not_completed(client, db, provider_returns, missing):
    provider_returns(_profile())
    _callback(client)
    agreements = {"service": True, "privacyRequired": True, "privacyOptional": False, "marketing": False}
    agreements[missing] = False

    res = client.post(COMPLETE, json=_extra(agreements=agreements))
    assert res.status_code == 400, res.text
    assert res.json()["code"] == "TERMS_REQUIRED"
    assert _count(db, User) == 0 and _count(db, SocialAccount) == 0
    assert ACCESS_COOKIE not in res.cookies

    assert client.post(COMPLETE, json=_extra()).status_code == 201  # 동의하면 같은 토큰으로 끝낼 수 있다


@pytest.mark.parametrize("token", [None, "forged-token"])
def test_ac_f1_07_complete_needs_valid_signup_token(client, db, token):
    if token is not None:
        client.cookies.set(SIGNUP_COOKIE, token)
    res = client.post(COMPLETE, json=_extra())
    assert res.status_code == 401, res.text
    assert res.json()["code"] == "UNAUTHENTICATED"
    assert _count(db, User) == 0


# ---------- AC-F1-08 카카오가 꺼져 있으면 직접 요청도 거부 ----------


@pytest.mark.parametrize("path", ["/api/v1/auth/kakao/start", "/api/v1/auth/kakao/callback?code=c&state=s"])
def test_ac_f1_08_kakao_disabled_is_404(client, path):
    res = client.get(path, follow_redirects=False)
    assert res.status_code == 404, res.text
    assert res.json()["code"] == "NOT_FOUND"


# ---------- AC-F1-09 카카오를 켜면 가입·로그인된다 ----------


def test_ac_f1_09_parse_kakao_nickname_only():
    profile = social.parse_kakao({"id": int(KAKAO_ID), "properties": {"nickname": "덕구"}})
    assert (profile.provider, profile.provider_user_id, profile.nickname) == ("KAKAO", KAKAO_ID, "덕구")
    assert profile.email is None and profile.phone is None and profile.birth_date is None


def test_ac_f1_09_kakao_enabled_signup_then_login(client, db, provider_returns, monkeypatch):
    monkeypatch.setattr(get_settings(), "kakao_login_enabled", True)
    res = client.get("/api/v1/auth/kakao/start", follow_redirects=False)
    assert res.status_code == 302, res.text
    assert res.headers["location"].startswith("https://kauth.kakao.com/oauth/authorize?")

    provider_returns(
        social.SocialProfile(provider="KAKAO", provider_user_id=KAKAO_ID, email=None, name=None, phone=None, birth_date=None, nickname="덕구")
    )
    assert _callback(client, "kakao").headers["location"] == EXTRA
    res = client.post(COMPLETE, json=_extra(email="kakao1@stageduck.test"))
    assert res.status_code == 201, res.text
    user = db.scalar(select(User))
    assert db.scalar(select(SocialAccount.provider).where(SocialAccount.user_id == user.id)) == "KAKAO"

    res = _callback(client, "kakao")
    assert res.headers["location"] == LANDING_USER
    assert read_access_token(res.cookies[ACCESS_COOKIE]) == user.id


# ---------- AC-F1-10 같은 이메일이라도 기존 계정에 자동으로 들어가지 않는다 ----------


def test_ac_f1_10_same_email_is_not_merged(client, db, provider_returns):
    existing = make_user(db, email="same@stageduck.test", password="duck1234")
    provider_returns(_profile(email="same@stageduck.test"))

    res = _callback(client)
    assert res.headers["location"] == EXTRA  # 기존 계정으로 로그인하지 않는다
    assert ACCESS_COOKIE not in res.cookies
    assert _count(db, SocialAccount) == 0

    res = client.post(COMPLETE, json=_extra(email="same@stageduck.test"))
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "EMAIL_TAKEN"
    assert _count(db, SocialAccount) == 0

    res = client.post(COMPLETE, json=_extra(email="same2@stageduck.test", nickname="새닉네임"))
    assert res.status_code == 201, res.text
    assert res.json()["id"] != existing.id
    assert db.scalar(select(SocialAccount.user_id)) == res.json()["id"]


def test_ac_f1_10_provider_user_id_is_unique(db):
    a, b = make_user(db), make_user(db)
    db.add(SocialAccount(user_id=a.id, provider="NAVER", provider_user_id=NAVER_ID, connected_at=NOW))
    db.commit()
    db.add(SocialAccount(user_id=b.id, provider="NAVER", provider_user_id=NAVER_ID, connected_at=NOW))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


# ---------- 시연 초기화가 social_accounts(FK → users) 때문에 막히지 않는다 (AC-F5-14, MariaDB 는 CI) ----------


def test_ac_f5_14_demo_reset_clears_social_accounts(db, monkeypatch):
    monkeypatch.setattr(get_settings(), "app_env", "test")
    user = make_user(db)
    db.add(SocialAccount(user_id=user.id, provider="NAVER", provider_user_id=NAVER_ID, connected_at=NOW))
    db.commit()
    reset_demo(db, NOW)
    assert _count(db, SocialAccount) == 0
