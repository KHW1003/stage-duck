"""개발용 가짜 로그인 (FR-AUTH-08, AC-F1-16). main.py 가 APP_ENV=test 일 때만 등록한다."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.auth.tokens import set_login_cookies
from app.core.db import get_db
from app.dev import service
from app.dev.schemas import SwitchAccountIn, SwitchAccountOut

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/switch-account", response_model=SwitchAccountOut)
def switch_account(body: SwitchAccountIn, response: Response, db: Session = Depends(get_db)) -> SwitchAccountOut:
    """AC-F1-16: 고른 시드 계정으로 로그인 쿠키를 발급한다 (테스트 환경만)."""
    user, review_status = service.switch_account(db, body.user_id)
    set_login_cookies(response, user.id)
    return SwitchAccountOut(id=user.id, role=user.role, nickname=user.nickname, supplier_review_status=review_status)
