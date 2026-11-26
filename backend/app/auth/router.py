"""회원 가입·로그인·로그아웃·내 정보·소셜 로그인 (api-contract.md 2장, FR-AUTH-01~06)."""
import secrets
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import calc, reset, service, social
from app.auth.deps import current_member, unauthenticated
from app.auth.schemas import (
    AuthOut,
    AvailabilityIn,
    AvailabilityOut,
    LoginIn,
    MeOut,
    PasswordResetConfirmIn,
    PasswordResetIn,
    PasswordResetOut,
    SignupIn,
    SocialCompleteIn,
    SocialPendingOut,
    SupplierSignupIn,
)
from app.auth.tokens import (
    SIGNUP_COOKIE,
    STATE_COOKIE,
    clear_login_cookies,
    clear_social_cookie,
    issue_signup_token,
    read_refresh_claims,
    read_signup_token,
    set_login_cookies,
    set_signup_cookie,
    set_state_cookie,
    state_matches,
)
from app.core.db import get_db
from app.core.errors import AppError, not_found
from app.models.user import User

SOCIAL_EXTRA_PAGE = "/signup/extra"  # 추가 정보 화면 (user-flow.md, plan.md 8장)
SOCIAL_FAILED_PAGE = "/login?social=failed"  # state 불일치·소셜 서버 실패·탈퇴 (정지 계정은 로그인된다, AC-F5-18)

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


def get_now() -> datetime:
    """지금 시각. 테스트는 dependency_overrides 로 바꾼다."""
    return datetime.now()


def _auth_out(db: Session, user: User) -> AuthOut:
    return AuthOut(id=user.id, role=user.role, nickname=user.nickname, landing=service.landing(db, user))


@router.post("/check-available", response_model=AvailabilityOut)
def check_available(body: AvailabilityIn, db: Session = Depends(get_db)) -> AvailabilityOut:
    """가입 화면 [중복 확인] — 누르는 즉시 이메일·닉네임을 쓸 수 있는지 알려 준다."""
    available, message = service.check_available(db, body.field, body.value)
    return AvailabilityOut(available=available, message=message)


@router.post("/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, response: Response, db: Session = Depends(get_db)) -> AuthOut:
    """AC-F1-01·02·03: 가입되면 바로 로그인 쿠키를 붙인다."""
    user = service.signup(db, body, now=datetime.now())
    set_login_cookies(response, user.id)
    return _auth_out(db, user)


@router.post("/signup/supplier", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup_supplier(body: SupplierSignupIn, response: Response, db: Session = Depends(get_db)) -> AuthOut:
    """FR-SUP-01 업체 1단계: 가입되면 바로 로그인 쿠키를 붙이고, 첫 화면은 입점 신청(2단계)."""
    user = service.signup_supplier(db, body, now=datetime.now())
    set_login_cookies(response, user.id)
    return _auth_out(db, user)


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)) -> AuthOut:
    """AC-F1-11: 역할별 첫 화면(landing)을 함께 돌려준다."""
    user = service.login(db, body.email, body.password, now=datetime.now())
    set_login_cookies(response, user.id)
    return _auth_out(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout() -> Response:
    """AC-F1-12(서버 부분): 쿠키를 지운다. 화면의 캐시 삭제는 프론트 PR.

    로그인 여부를 묻지 않는다 — access_token(30분)이 만료된 뒤에도 로그아웃하면 남은 쿠키가 지워져야 한다.
    """
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_login_cookies(response)
    return response


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
def refresh(refresh_token: str | None = Cookie(default=None), db: Session = Depends(get_db)) -> Response:
    """refresh_token 이 유효하면 쿠키를 새로 붙인다 (access 30분 → 다시 30분).

    비밀번호를 찾아 바꾼 뒤에는 그 전에 발급된 refresh 를 받지 않는다 (AC-F1-22).
    """
    claims = read_refresh_claims(refresh_token)
    user = service.active_user(db, claims[0] if claims else None)
    if user is None or calc.refresh_revoked(claims[1], reset.last_reset_at(db, user.id)):
        raise unauthenticated()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_login_cookies(response, user.id)
    return response


@router.post("/password-reset", response_model=PasswordResetOut, status_code=status.HTTP_202_ACCEPTED)
def password_reset(body: PasswordResetIn, db: Session = Depends(get_db), now: datetime = Depends(get_now)) -> PasswordResetOut:
    """AC-F1-21·23: 가입 여부와 상관없이 항상 202. 같은 이메일 10분 3회 넘으면 429.

    demoLink 는 시연 서버(APP_ENV=test, MAIL_BACKEND=console)에서만 채운다 (D-55).
    """
    return PasswordResetOut(demo_link=reset.request_reset(db, body.email, now=now))


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def password_reset_confirm(
    body: PasswordResetConfirmIn, db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> Response:
    """AC-F1-22: 새 비밀번호 저장. 이 브라우저의 로그인 쿠키도 지워 새 비밀번호로 다시 로그인하게 한다."""
    reset.confirm_reset(db, body.token, body.password, now=now)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_login_cookies(response)
    return response


# ---------- 소셜 로그인 (FR-AUTH-02~05, AC-F1-04~10) ----------


def _start(request: Request, provider: str, callback: str) -> RedirectResponse:
    """AC-F1-04: 동의 화면으로 보낸다. state 를 쿠키에 넣어 콜백에서 비교한다 (NFR-SEC-10)."""
    if not social.is_enabled(provider):
        raise not_found()
    state = secrets.token_urlsafe(32)
    url = social.authorize_url(provider, state, str(request.url_for(callback)))
    response = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    set_state_cookie(response, state)
    return response


def _callback(
    request: Request, db: Session, provider: str, callback: str, code: str | None, state: str | None, saved: str | None
) -> RedirectResponse:
    """AC-F1-04·10: 연결된 계정이면 로그인 → 역할별 첫 화면, 처음이면 signup_token → 추가 정보 화면.

    같은 이메일 계정이 있어도 로그인시키지 않는다 (연결은 고유 식별값으로만).
    """
    if not social.is_enabled(provider):
        raise not_found()
    if not code or not state_matches(state, saved):
        return _social_failed()
    try:
        profile = social.fetch_profile(provider, code, state=state, redirect_uri=str(request.url_for(callback)))
        user = service.social_user(db, profile)
    except (social.SocialError, AppError):
        return _social_failed()
    if user is not None:
        response = RedirectResponse(service.landing(db, user), status_code=status.HTTP_302_FOUND)
        set_login_cookies(response, user.id)
    else:
        response = RedirectResponse(SOCIAL_EXTRA_PAGE, status_code=status.HTTP_302_FOUND)
        set_signup_cookie(response, issue_signup_token(social.to_claims(profile)))
    clear_social_cookie(response, STATE_COOKIE)
    return response


def _signup_expired() -> AppError:
    """계약서 2.1: signup_token 쿠키가 없거나 10분이 지남."""
    return AppError(401, "SOCIAL_SIGNUP_EXPIRED", "간편 가입 시간이 지났어요. 다시 로그인해 주세요.")


def _social_failed() -> RedirectResponse:
    response = RedirectResponse(SOCIAL_FAILED_PAGE, status_code=status.HTTP_302_FOUND)
    clear_social_cookie(response, STATE_COOKIE)
    return response


@router.get("/naver/start")
def naver_start(request: Request) -> RedirectResponse:
    return _start(request, social.NAVER, "naver_callback")


@router.get("/naver/callback")
def naver_callback(
    request: Request,
    code: str | None = Query(default=None, max_length=500),
    state: str | None = Query(default=None, max_length=200),
    oauth_state: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    return _callback(request, db, social.NAVER, "naver_callback", code, state, oauth_state)


@router.get("/kakao/start")
def kakao_start(request: Request) -> RedirectResponse:
    """AC-F1-08: KAKAO_LOGIN_ENABLED=false 면 404."""
    return _start(request, social.KAKAO, "kakao_callback")


@router.get("/kakao/callback")
def kakao_callback(
    request: Request,
    code: str | None = Query(default=None, max_length=500),
    state: str | None = Query(default=None, max_length=200),
    oauth_state: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """AC-F1-08·09: 꺼져 있으면 404, 켜져 있으면 네이버와 같은 흐름."""
    return _callback(request, db, social.KAKAO, "kakao_callback", code, state, oauth_state)


@router.get("/social/pending", response_model=SocialPendingOut)
def social_pending(response: Response, signup_token: str | None = Cookie(default=None)) -> SocialPendingOut:
    """AC-F1-06: 추가 정보 화면에 미리 채울 값. signup_token 쿠키가 없거나 만료되면 401 SOCIAL_SIGNUP_EXPIRED. 브라우저에 저장하지 않게 한다."""
    claims = read_signup_token(signup_token)
    if claims is None:
        raise _signup_expired()
    response.headers["Cache-Control"] = "no-store"
    profile = social.from_claims(claims)
    return SocialPendingOut(
        provider=profile.provider,
        email=profile.email,
        name=profile.name,
        phone=profile.phone,
        birth_date=profile.birth_date,
        nickname=profile.nickname,
    )


@router.post("/social/complete", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def social_complete(
    body: SocialCompleteIn,
    response: Response,
    signup_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> AuthOut:
    """AC-F1-05·06·07·10: 추가 정보 + 우리 약관 동의 → 가입. 끝나면 signup_token 을 지우고 로그인 쿠키를 붙인다."""
    claims = read_signup_token(signup_token)
    if claims is None:
        raise _signup_expired()
    user = service.social_complete(db, social.from_claims(claims), body, now=now)
    clear_social_cookie(response, SIGNUP_COOKIE)
    set_login_cookies(response, user.id)
    return _auth_out(db, user)


@me_router.get("/me", response_model=MeOut)
def me(response: Response, user: User = Depends(current_member), db: Session = Depends(get_db)) -> MeOut:
    """AC-F1-11: 내 정보·역할·업체 심사 상태. 개인 정보라 브라우저가 저장하지 않게 한다 (AC-F1-12).

    정지 계정도 본다 — 화면이 status 로 정지 안내를 띄운다 (AC-F5-18).
    """
    response.headers["Cache-Control"] = "no-store"
    review = service.supplier_review_status(db, user)
    return MeOut(
        id=user.id,
        role=user.role,
        status=user.status,
        email=user.email,
        name=user.name,
        phone=user.phone,
        nickname=user.nickname,
        supplier_review_status=review,
        landing=service.landing(db, user),
        suspension=service.suspension(db, user),
        avatar_url=_avatar(db, user),
        duck=_duck(db, user),
    )


def _duck(db: Session, user: User):
    from app.profile.duck import duck_of  # 1번 profile — 함수 안 import (순환 방지)

    return duck_of(db, user.id)


def _avatar(db: Session, user: User) -> str | None:
    """사용자는 프로필 사진, 업체는 업체 대표 이미지(없으면 계정 프로필 사진)."""
    from app.files.service import avatar_url
    from app.models.supplier import Supplier

    if user.role == "SUPPLIER":
        image = db.scalar(select(Supplier.image_file_id).where(Supplier.user_id == user.id))
        if image:
            return avatar_url(db, image)
    return avatar_url(db, user.profile_file_id)
