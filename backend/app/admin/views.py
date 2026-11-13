"""SQLAdmin 뷰와 액션 (plan.md 6.5).

원칙: 관리자 화면은 모델을 직접 고치지 않는다 (can_edit=False).
모든 업무는 액션 버튼 → 서비스 함수로 처리해 상태 전이 검사와 이력 기록을 거친다.
관리자가 확정·결제를 대신 처리하는 액션은 두지 않는다.
"""
from collections.abc import Callable
from urllib.parse import urlencode

from sqladmin import BaseView, ModelView, action, expose
from sqladmin.flash import flash
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response

from app.admin.auth import current_admin_id
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.models import Sanction, StatusHistory, Supplier, User
from app.policy import service as policy_service
from app.supplier import service as supplier_service


def _pks(request: Request) -> list[int]:
    raw = request.query_params.get("pks", "")
    return [int(pk) for pk in raw.split(",") if pk.strip().isdigit()]


def _run_for_each(pks: list[int], fn: Callable, **kwargs) -> tuple[int, list[str]]:
    """선택한 행마다 서비스 함수를 부른다. 하나가 실패해도 나머지는 처리한다."""
    done, errors = 0, []
    for pk in pks:
        with SessionLocal() as db:
            try:
                fn(db, pk, **kwargs)
                done += 1
            except AppError as exc:
                db.rollback()
                errors.append(f"#{pk}: {exc.message}")
    return done, errors


def _report(request: Request, label: str, done: int, errors: list[str]) -> None:
    if done:
        flash(request, f"{label}: {done}건 처리했어요.", "success")
    for msg in errors:
        flash(request, f"{label} 실패 — {msg}", "danger")


def _back(request: Request, identity: str) -> RedirectResponse:
    return RedirectResponse(request.url_for("admin:list", identity=identity), status_code=302)


def _to_reason_form(request: Request, op: str, identity: str) -> RedirectResponse:
    query = urlencode({"op": op, "pks": request.query_params.get("pks", ""), "back": identity})
    return RedirectResponse(f"{request.url_for('admin:view-reason')}?{query}", status_code=302)


class SupplierAdmin(ModelView, model=Supplier):
    """업체 심사 — AC-F1-19, AC-F1-20."""

    name = "업체"
    name_plural = "업체 심사"
    icon = "fa-solid fa-store"
    can_create = can_edit = can_delete = False
    column_list = [
        Supplier.id, Supplier.company_name, Supplier.business_type,
        Supplier.review_status, Supplier.reject_reason, Supplier.created_at,
    ]
    column_searchable_list = [Supplier.company_name]
    column_sortable_list = [Supplier.id, Supplier.review_status, Supplier.created_at]
    column_default_sort = [(Supplier.created_at, True)]
    column_labels = {
        Supplier.company_name: "상호", Supplier.business_type: "사업자 유형",
        Supplier.review_status: "심사 상태", Supplier.reject_reason: "반려·정지 사유",
        Supplier.created_at: "신청일",
    }

    @action(name="approve", label="승인", confirmation_message="선택한 업체를 승인할까요?")
    async def approve(self, request: Request) -> Response:
        done, errors = await run_in_threadpool(
            _run_for_each, _pks(request), supplier_service.approve, actor_id=current_admin_id(request)
        )
        _report(request, "승인", done, errors)
        return _back(request, self.identity)

    @action(name="reject", label="반려 (사유 입력)")
    async def reject(self, request: Request) -> Response:
        return _to_reason_form(request, "supplier_reject", self.identity)

    @action(name="suspend", label="정지 (사유 입력)")
    async def suspend(self, request: Request) -> Response:
        return _to_reason_form(request, "supplier_suspend", self.identity)

    @action(name="unsuspend", label="정지 해제", confirmation_message="선택한 업체의 정지를 풀까요?")
    async def unsuspend(self, request: Request) -> Response:
        done, errors = await run_in_threadpool(
            _run_for_each, _pks(request), supplier_service.unsuspend, actor_id=current_admin_id(request)
        )
        _report(request, "정지 해제", done, errors)
        return _back(request, self.identity)


class UserAdmin(ModelView, model=User):
    """회원 — 경고 3회면 정지 (AC-F4-08)."""

    name = "회원"
    name_plural = "회원"
    icon = "fa-solid fa-user"
    can_create = can_edit = can_delete = False
    column_list = [User.id, User.email, User.role, User.nickname, User.status, User.warning_count, User.created_at]
    column_details_exclude_list = [User.password_hash]
    column_searchable_list = [User.email, User.nickname]
    column_labels = {User.role: "역할", User.status: "상태", User.warning_count: "경고 수", User.created_at: "가입일"}

    @action(name="warn", label="경고 (사유 입력)")
    async def warn(self, request: Request) -> Response:
        return _to_reason_form(request, "user_warn", self.identity)


class SanctionAdmin(ModelView, model=Sanction):
    name = "제재 이력"
    name_plural = "제재 이력"
    icon = "fa-solid fa-gavel"
    can_create = can_edit = can_delete = False
    column_list = [Sanction.id, Sanction.user_id, Sanction.type, Sanction.reason, Sanction.created_by, Sanction.created_at]
    column_default_sort = [(Sanction.created_at, True)]


class StatusHistoryAdmin(ModelView, model=StatusHistory):
    """상태 변경 이력 (NFR-HIST-01, AC-F5-13) — 읽기 전용."""

    name = "상태 변경 이력"
    name_plural = "상태 변경 이력"
    icon = "fa-solid fa-clock-rotate-left"
    can_create = can_edit = can_delete = False
    column_list = [
        StatusHistory.created_at, StatusHistory.entity_type, StatusHistory.entity_id,
        StatusHistory.from_status, StatusHistory.to_status, StatusHistory.actor_user_id, StatusHistory.reason,
    ]
    column_searchable_list = [StatusHistory.entity_type]
    column_default_sort = [(StatusHistory.created_at, True)]


# 사유가 필요한 액션: 액션 이름 → (화면 제목, 서비스 함수)
REASON_ACTIONS: dict[str, tuple[str, Callable]] = {
    "supplier_reject": ("업체 반려", supplier_service.reject),
    "supplier_suspend": ("업체 정지", supplier_service.suspend),
    "user_warn": ("회원 경고 (3회면 정지)", policy_service.warn),
}


class ReasonView(BaseView):
    """반려·정지·경고 사유 입력 화면. 메뉴에는 보이지 않는다."""

    name = "사유 입력"

    def is_visible(self, request: Request) -> bool:
        return False

    @expose("/reason", methods=["GET", "POST"], identity="reason")
    async def reason(self, request: Request) -> Response:
        op = request.query_params.get("op", "")
        back = request.query_params.get("back", "")
        if op not in REASON_ACTIONS:
            flash(request, "알 수 없는 작업이에요.", "danger")
            return RedirectResponse(request.url_for("admin:index"), status_code=302)
        title, fn = REASON_ACTIONS[op]
        pks = _pks(request)

        if request.method == "POST":
            form = await request.form()
            reason = str(form.get("reason", ""))
            done, errors = await run_in_threadpool(
                _run_for_each, pks, fn, actor_id=current_admin_id(request), reason=reason
            )
            _report(request, title, done, errors)
            return _back(request, back) if back else RedirectResponse(request.url_for("admin:index"), status_code=302)

        return await self.templates.TemplateResponse(
            request, "reason.html", {"title": title, "pks": pks}
        )
