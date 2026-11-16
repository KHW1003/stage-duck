"""회원 가입·로그인·로그아웃·내 정보 (api-contract.md 2장, FR-AUTH-01·06)."""
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth import service
from app.auth.deps import current_user, unauthenticated
from app.auth.schemas import AuthOut, LoginIn, MeOut, SignupIn
from app.auth.tokens import clear_login_cookies, read_refresh_token, set_login_cookies
from app.core.db import get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


def _auth_out(db: Session, user: User) -> AuthOut:
    return AuthOut(id=user.id, role=user.role, nickname=user.nickname, landing=service.landing(db, user))


@router.post("/signup", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, response: Response, db: Session = Depends(get_db)) -> AuthOut:
    """AC-F1-01·02·03: 가입되면 바로 로그인 쿠키를 붙인다."""
    user = service.signup(db, body, now=datetime.now())
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
    """refresh_token 이 유효하면 쿠키를 새로 붙인다 (access 30분 → 다시 30분)."""
    user = service.active_user(db, read_refresh_token(refresh_token))
    if user is None:
        raise unauthenticated()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_login_cookies(response, user.id)
    return response


@me_router.get("/me", response_model=MeOut)
def me(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)) -> MeOut:
    """AC-F1-11: 내 정보·역할·업체 심사 상태. 개인 정보라 브라우저가 저장하지 않게 한다 (AC-F1-12)."""
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
    )
