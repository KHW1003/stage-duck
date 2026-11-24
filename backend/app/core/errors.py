"""공통 오류 형식 (api-contract.md 1.1, NFR-OPS-02).

{ "code": "...", "message": "...", "fieldErrors": [...], "traceId": "..." }
"""
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, field_errors: list[dict] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field_errors = field_errors or []


def invalid_state(message: str = "지금 상태에서는 할 수 없는 작업이에요.") -> AppError:
    return AppError(409, "INVALID_STATE", message)


def not_found() -> AppError:
    # 남의 리소스도 같은 응답 — 존재 여부를 숨긴다 (FR-AUTH-07)
    return AppError(404, "NOT_FOUND", "찾을 수 없어요.")


def _body(code: str, message: str, field_errors: list[dict]) -> dict:
    return {"code": code, "message": message, "fieldErrors": field_errors, "traceId": uuid.uuid4().hex[:8]}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status, content=_body(exc.code, exc.message, exc.field_errors))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        fields = [
            {"field": ".".join(str(p) for p in err["loc"] if p != "body"), "reason": err["msg"]}
            for err in exc.errors()
        ]
        return JSONResponse(status_code=400, content=_body("VALIDATION_FAILED", "입력값을 확인해 주세요.", fields))
