"""CSRF 검사 미들웨어 (plan.md 4장 double submit, api-contract.md 1장).

/api/v1 아래의 POST·PUT·PATCH·DELETE 는 X-CSRF-Token 헤더가 csrf_token 쿠키와 같아야 한다.
- 예외: 쿠키가 아직 없는 요청(로그인·가입·소셜 가입 완료·비밀번호 찾기·시연 계정 전환).
- 관리자(/admin, SQLAdmin)는 /api/v1 밖이라 검사하지 않는다.
- 프론트는 shared/api/client.ts 의 api() 를 쓰면 헤더가 자동으로 붙는다.
"""
import secrets
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.auth.tokens import CSRF_COOKIE

API_PREFIX = "/api/v1/"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
EXEMPT_PATHS = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/signup",
        "/api/v1/auth/check-available",
        "/api/v1/auth/signup/supplier",
        "/api/v1/auth/social/complete",
        "/api/v1/auth/password-reset",
        "/api/v1/auth/password-reset/confirm",
        "/api/v1/dev/switch-account",
    }
)
HEADER = "X-CSRF-Token"


def needs_check(method: str, path: str) -> bool:
    return method.upper() in UNSAFE_METHODS and path.startswith(API_PREFIX) and path.rstrip("/") not in EXEMPT_PATHS


def tokens_match(cookie: str | None, header: str | None) -> bool:
    return bool(cookie) and bool(header) and secrets.compare_digest(cookie, header)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if needs_check(request.method, request.url.path) and not tokens_match(
            request.cookies.get(CSRF_COOKIE), request.headers.get(HEADER)
        ):
            # 공통 오류 모양 (api-contract.md 1.1)
            return JSONResponse(
                status_code=403,
                content={
                    "code": "CSRF_FAILED",
                    "message": "요청을 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.",
                    "fieldErrors": [],
                    "traceId": uuid.uuid4().hex[:8],
                },
            )
        return await call_next(request)
