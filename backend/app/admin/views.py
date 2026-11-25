"""SQLAdmin 뷰와 액션 (plan.md 6.5).

원칙: 관리자 화면은 모델을 직접 고치지 않는다 (can_edit=False).
모든 업무는 액션 버튼 → 서비스 함수로 처리해 상태 전이 검사와 이력 기록을 거친다.
관리자가 확정·결제를 대신 처리하는 액션은 두지 않는다.
"""
from collections.abc import Callable
from datetime import datetime
from urllib.parse import urlencode
from uuid import uuid4

from markupsafe import Markup
from sqladmin import BaseView, action, expose
from sqladmin.flash import flash
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response
from wtforms import SelectField
from wtforms.validators import Optional

from app.admin.auth import current_admin_id
from app.admin.display import INQUIRY_CODES, NONE, POST_STATUS, SdModelView, badge, code, history_badge
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import AppError
from app.community import service as community_service
from app.demo import service as demo_service
from app.admin import service as admin_service
from app.models import FreeComment, FreePost, Performance, PrPost, Report, Sanction, StatusHistory, Supplier, User
from app.models.support import Inquiry, Notice
from app.policy import service as policy_service
from app.supplier import service as supplier_service
from app.support import service as support_service


def _pks(request: Request) -> list[int]:
    raw = request.query_params.get("pks", "")
    return list(dict.fromkeys(int(pk) for pk in raw.split(",") if pk.strip().isdigit()))  # 같은 행이 두 번 오면 한 번만


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


def _reason_button(label: str, op: str, identity: str, pk: int) -> str:
    """행마다 붙는 버튼: 누르면 그 행 하나로 사유(답변) 입력 화면이 열린다 (체크박스 → 작업 메뉴를 안 거친다)."""
    query = urlencode({"op": op, "pks": pk, "back": identity})
    return f'<a class="sd-row-action sd-row-action--main" href="/admin/reason?{query}">{label}</a>'


def _action_button(label: str, identity: str, name: str, pk: int, confirm: str) -> str:
    """사유가 필요 없는 액션을 그 행 하나에 바로 (확인 창을 한 번 띄운다)."""
    return (f'<a class="sd-row-action" href="/admin/{identity}/action/{name}?pks={pk}" '
            f'onclick="return confirm(\'{confirm}\')">{label}</a>')


class SupplierAdmin(SdModelView, model=Supplier):
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
        "id": "번호", Supplier.company_name: "상호", Supplier.business_type: "사업자 유형",
        Supplier.review_status: "심사 상태", Supplier.reject_reason: "반려·정지 사유",
        Supplier.created_at: "신청일", Supplier.user: "계정", Supplier.categories: "분야",
        Supplier.representative_name: "대표자", Supplier.business_reg_no: "사업자등록번호",
        Supplier.business_doc_file_id: "사업자등록증", Supplier.business_address: "사업장 주소",
        Supplier.main_phone: "대표 전화", Supplier.mail_order_no: "통신판매업 번호", Supplier.intro: "소개",
        Supplier.engineer_years: "엔지니어 경력(년)", Supplier.has_liability_insurance: "배상책임보험",
        Supplier.approved_at: "승인일",
    }
    # 상세: 심사에 필요한 것만 (내부 번호·파일 번호·수정일 등은 뺀다)
    column_details_list = [
        Supplier.company_name, Supplier.review_status, Supplier.reject_reason, Supplier.user, Supplier.categories,
        Supplier.business_type, Supplier.representative_name, Supplier.business_reg_no, Supplier.business_doc_file_id,
        Supplier.business_address, Supplier.main_phone, Supplier.mail_order_no, Supplier.intro,
        Supplier.engineer_years, Supplier.has_liability_insurance, Supplier.created_at, Supplier.approved_at,
    ]
    column_formatters = {Supplier.review_status: badge(), Supplier.business_type: code()}
    column_formatters_detail = {
        **column_formatters,
        Supplier.categories: code(),
        Supplier.business_doc_file_id: lambda m, a: Markup(
            f'<a href="/api/v1/files/{m.business_doc_file_id}" target="_blank" rel="noopener">서류 보기</a>'
        ) if m.business_doc_file_id else NONE,
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


class UserAdmin(SdModelView, model=User):
    """회원 — 경고 3회면 정지 (AC-F4-08)."""

    name = "회원"
    name_plural = "회원"
    icon = "fa-solid fa-user"
    can_create = can_edit = can_delete = False
    column_list = [User.id, User.email, User.role, User.nickname, User.status, User.warning_count, User.created_at]
    column_details_exclude_list = [User.password_hash]
    column_searchable_list = [User.email, User.nickname]
    column_labels = {"id": "번호", User.email: "이메일", User.nickname: "닉네임", User.name: "이름", User.phone: "전화",
                     User.role: "역할", User.status: "상태", User.warning_count: "경고 수", User.created_at: "가입일"}
    column_formatters = {User.role: code(), User.status: badge()}
    column_formatters_detail = column_formatters

    @action(name="warn", label="경고 (사유 입력)")
    async def warn(self, request: Request) -> Response:
        return _to_reason_form(request, "user_warn", self.identity)


class SanctionAdmin(SdModelView, model=Sanction):
    name = "제재 이력"
    name_plural = "제재 이력"
    icon = "fa-solid fa-gavel"
    can_create = can_edit = can_delete = False
    column_list = [Sanction.id, Sanction.user_id, Sanction.type, Sanction.reason, Sanction.created_by, Sanction.created_at]
    column_default_sort = [(Sanction.created_at, True)]
    column_labels = {"id": "번호", Sanction.user_id: "회원 번호", Sanction.type: "종류", Sanction.reason: "사유",
                     Sanction.created_by: "처리자", Sanction.created_at: "처리일"}
    column_formatters = {Sanction.type: code()}
    column_formatters_detail = column_formatters


class ReportAdmin(SdModelView, model=Report):
    """신고 — 회원 신고는 [경고]로 경고 1회(3회면 정지), 아니면 [기각] (FR-POL-04)."""

    name = "신고"
    name_plural = "신고"
    icon = "fa-solid fa-flag"
    can_create = can_edit = can_delete = False
    column_list = [Report.id, Report.target_type, Report.target_id, Report.reporter_user_id, Report.reason,
                   Report.status, Report.handled_by, Report.created_at, "buttons"]
    column_formatters = {Report.target_type: code(), Report.status: badge(), "buttons": lambda m, a: Markup(
        _reason_button("경고", "report_warn", "report", m.id) + _reason_button("기각", "report_dismiss", "report", m.id)
        if m.status == "OPEN" else "")}
    column_formatters_detail = column_formatters
    column_sortable_list = [Report.id, Report.status, Report.created_at]
    column_default_sort = [(Report.created_at, True)]
    column_labels = {"id": "번호", Report.target_type: "대상 종류", Report.target_id: "대상 번호", Report.reporter_user_id: "신고자",
                     Report.reason: "사유", Report.status: "상태", Report.handled_by: "처리자", Report.created_at: "신고일",
                     "buttons": "처리"}

    @action(name="warn", label="경고 (사유 입력)")
    async def warn(self, request: Request) -> Response:
        return _to_reason_form(request, "report_warn", self.identity)

    @action(name="dismiss", label="기각 (사유 입력)")
    async def dismiss(self, request: Request) -> Response:
        return _to_reason_form(request, "report_dismiss", self.identity)


class StatusHistoryAdmin(SdModelView, model=StatusHistory):
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
    column_labels = {StatusHistory.created_at: "시각", StatusHistory.entity_type: "대상", StatusHistory.entity_id: "대상 번호",
                     StatusHistory.from_status: "이전 상태", StatusHistory.to_status: "바뀐 상태",
                     StatusHistory.actor_user_id: "처리한 회원", StatusHistory.reason: "사유", "id": "번호"}
    column_formatters = {StatusHistory.entity_type: code(), StatusHistory.from_status: history_badge,
                         StatusHistory.to_status: history_badge}
    column_formatters_detail = column_formatters
    column_default_sort = [(StatusHistory.created_at, True)]


class PrPostAdmin(SdModelView, model=PrPost):
    """업체 찾기 소개 글 — [블라인드]하면 업체 경고 1회, [블라인드 해제]하면 다시 활성 (AC-F4-03·10). 4번 액션."""

    name = "업체 소개 글"
    name_plural = "업체 소개 글"
    icon = "fa-solid fa-bullhorn"
    can_create = can_edit = can_delete = False
    column_list = [PrPost.id, PrPost.category, PrPost.title, PrPost.supplier_id, PrPost.status, PrPost.blind_reason,
                   PrPost.created_at, "buttons"]
    column_labels = {"id": "번호", PrPost.category: "분야", PrPost.title: "제목", PrPost.supplier_id: "업체 번호",
                     PrPost.status: "상태", PrPost.blind_reason: "블라인드 사유", PrPost.created_at: "작성일",
                     "buttons": "처리"}
    column_formatters = {PrPost.category: code(), PrPost.status: badge(POST_STATUS), "buttons": lambda m, a: Markup(
        _reason_button("블라인드", "pr_post_blind", "pr-post", m.id) if m.status == "ACTIVE"
        else _action_button("블라인드 해제", "pr-post", "unblind", m.id, "이 글의 블라인드를 풀까요?") if m.status == "BLINDED"
        else "")}
    column_searchable_list = [PrPost.title]
    column_default_sort = [(PrPost.created_at, True)]

    @action(name="blind", label="블라인드 (사유 입력)")
    async def blind(self, request: Request) -> Response:
        return _to_reason_form(request, "pr_post_blind", self.identity)

    @action(name="unblind", label="블라인드 해제", confirmation_message="선택한 글의 블라인드를 풀까요?")
    async def unblind(self, request: Request) -> Response:
        done, errors = await run_in_threadpool(
            _run_for_each, _pks(request), policy_service.unblind_post, actor_id=current_admin_id(request)
        )
        _report(request, "블라인드 해제", done, errors)
        return _back(request, self.identity)


class PerformanceAdmin(SdModelView, model=Performance):
    """공연 — 읽기 전용. [거래 이력]으로 모든 상태 변경을 시간순으로 본다 (AC-F5-13)."""

    name = "공연"
    name_plural = "공연"
    icon = "fa-solid fa-music"
    can_create = can_edit = can_delete = False
    column_list = [Performance.id, Performance.title, Performance.user_id, Performance.status, Performance.show_date, "history"]
    column_labels = {"id": "번호", Performance.title: "공연명", Performance.user_id: "회원 번호",
                     Performance.status: "상태", Performance.show_date: "공연일", "history": "거래 이력"}
    # 목록·상세에서 한 번 눌러 이력 화면으로 (체크박스 → 작업 메뉴를 안 거치게)
    column_formatters = {Performance.status: badge(), "history": lambda m, a: Markup(f'<a href="/admin/performance-history?pk={m.id}">이력 보기</a>')}
    column_formatters_detail = column_formatters
    column_searchable_list = [Performance.title]
    column_default_sort = [(Performance.id, True)]

    @action(name="history", label="거래 이력 보기", add_in_detail=True, add_in_list=True)
    async def history(self, request: Request) -> Response:
        pks = _pks(request)
        return RedirectResponse(f"{request.url_for('admin:view-performance-history')}?pk={pks[0] if pks else ''}", status_code=302)


class PerformanceHistoryView(BaseView):
    """공연 한 건의 거래 이력 화면. 메뉴에는 보이지 않는다."""

    name = "거래 이력"

    def is_visible(self, request: Request) -> bool:
        return False

    @expose("/performance-history", methods=["GET"], identity="performance-history")
    async def performance_history(self, request: Request) -> Response:
        pk = request.query_params.get("pk", "")
        if not pk.isdigit():
            flash(request, "공연을 하나 골라 주세요.", "danger")
            return _back(request, "performance")

        def _load() -> list[dict]:
            with SessionLocal() as db:
                return [
                    {"created_at": r.created_at, "entity_type": r.entity_type, "entity_id": r.entity_id,
                     "from_status": r.from_status, "to_status": r.to_status, "actor_user_id": r.actor_user_id,
                     "reason": r.reason}
                    for r in admin_service.performance_history(db, int(pk))
                ]

        try:
            rows = await run_in_threadpool(_load)
        except AppError as exc:
            flash(request, exc.message, "danger")
            return _back(request, "performance")
        return await self.templates.TemplateResponse(
            request, "performance_history.html", {"performance_id": int(pk), "rows": rows}
        )


class FreePostAdmin(SdModelView, model=FreePost):
    """커뮤니티 글 — 신고된 글은 [블라인드]로 숨기고 작성자에게 경고 1회 (FR-COMM-04). 2번 묶음."""

    name = "커뮤니티 글"
    name_plural = "커뮤니티 글"
    icon = "fa-solid fa-comments"
    can_create = can_edit = can_delete = False
    column_list = [FreePost.id, FreePost.category, FreePost.title, FreePost.author_user_id, FreePost.status,
                   FreePost.blind_reason, FreePost.created_at]
    column_searchable_list = [FreePost.title]
    column_default_sort = [(FreePost.created_at, True)]
    column_formatters = {FreePost.category: code(), FreePost.status: badge(POST_STATUS)}
    column_formatters_detail = column_formatters
    column_labels = {"id": "번호", FreePost.category: "말머리", FreePost.title: "제목", FreePost.author_user_id: "작성자",
                     FreePost.status: "상태", FreePost.blind_reason: "블라인드 사유", FreePost.created_at: "작성일"}

    @action(name="blind", label="블라인드 (사유 입력)")
    async def blind(self, request: Request) -> Response:
        return _to_reason_form(request, "free_post_blind", self.identity)


class FreeCommentAdmin(SdModelView, model=FreeComment):
    """커뮤니티 댓글 — [블라인드]하면 다른 사람에게 안 보이고 작성자 경고 1회 (AC-F4-15). 2번 묶음."""

    name = "커뮤니티 댓글"
    name_plural = "커뮤니티 댓글"
    icon = "fa-solid fa-comment"
    can_create = can_edit = can_delete = False
    column_list = [FreeComment.id, FreeComment.post_id, FreeComment.parent_id, FreeComment.body,
                   FreeComment.author_user_id, FreeComment.status, FreeComment.blind_reason, FreeComment.created_at]
    column_default_sort = [(FreeComment.created_at, True)]
    column_formatters = {FreeComment.status: badge(POST_STATUS)}
    column_formatters_detail = column_formatters
    column_labels = {"id": "번호", FreeComment.post_id: "글", FreeComment.parent_id: "답글 대상", FreeComment.body: "내용",
                     FreeComment.author_user_id: "작성자", FreeComment.status: "상태",
                     FreeComment.blind_reason: "블라인드 사유", FreeComment.created_at: "작성일"}

    @action(name="blind", label="블라인드 (사유 입력)")
    async def blind(self, request: Request) -> Response:
        return _to_reason_form(request, "free_comment_blind", self.identity)


# 사유가 필요한 액션: 액션 이름 → (화면 제목, 서비스 함수)
REASON_ACTIONS: dict[str, tuple[str, Callable]] = {
    "supplier_reject": ("업체 반려", supplier_service.reject),
    "supplier_suspend": ("업체 정지", supplier_service.suspend),
    "user_warn": ("회원 경고 (3회면 정지)", policy_service.warn),
    "report_warn": ("신고 경고 (3회면 정지)", policy_service.warn_report),
    "report_dismiss": ("신고 기각", policy_service.dismiss_report),
    "pr_post_blind": ("업체 소개 글 블라인드 (업체 경고 1회)", policy_service.blind_post),
    "free_post_blind": ("커뮤니티 글 블라인드 (작성자 경고 1회)", community_service.blind_post),
    "free_comment_blind": ("커뮤니티 댓글 블라인드 (작성자 경고 1회)", community_service.blind_comment),
    "inquiry_answer": ("1:1 문의 답변 (아래 칸에 답변 글)", support_service.answer_inquiry),
}


class InquiryAdmin(SdModelView, model=Inquiry):
    """1:1 문의 — [답변]하면 답변 완료, 그 뒤 회원은 고치거나 지울 수 없다 (FR-CS-01, FR-ADMIN-06, AC-F5-19). #102."""

    name = "1:1 문의"
    name_plural = "1:1 문의"
    icon = "fa-solid fa-circle-question"
    can_create = can_edit = can_delete = False
    column_list = [Inquiry.id, Inquiry.category, Inquiry.title, Inquiry.user_id, Inquiry.status, Inquiry.created_at,
                   Inquiry.answered_at, "buttons"]
    column_labels = {"id": "번호", Inquiry.category: "분류", Inquiry.title: "제목", Inquiry.user_id: "회원 번호",
                     Inquiry.performance_id: "공연 번호", Inquiry.body: "문의 내용", Inquiry.attachments: "첨부",
                     Inquiry.status: "상태", Inquiry.answer: "답변", Inquiry.answered_at: "답변일",
                     Inquiry.created_at: "문의일", "buttons": "처리"}
    column_formatters = {Inquiry.category: code(INQUIRY_CODES), Inquiry.status: badge(), "buttons": lambda m, a: Markup(
        _reason_button("답변", "inquiry_answer", "inquiry", m.id) if m.status == "WAITING" else "")}
    column_formatters_detail = {
        **column_formatters,
        Inquiry.attachments: lambda m, a: Markup(" ").join(
            Markup('<a href="/api/v1/files/{}" target="_blank" rel="noopener">첨부 {}</a>').format(fid, i + 1)
            for i, fid in enumerate(m.attachments)) if m.attachments else Markup("없음"),
    }
    column_details_list = [Inquiry.category, Inquiry.user_id, Inquiry.performance_id, Inquiry.title,
                           Inquiry.body, Inquiry.attachments, Inquiry.status, Inquiry.answer, Inquiry.answered_at,
                           Inquiry.created_at, "buttons"]
    column_searchable_list = [Inquiry.title]
    column_default_sort = [(Inquiry.created_at, True)]

    @action(name="answer", label="답변 (답변 글 입력)")
    async def answer(self, request: Request) -> Response:
        return _to_reason_form(request, "inquiry_answer", self.identity)


# 이미 처리한 사유 화면의 번호. shortcut: 서버 프로세스 하나의 메모리 (--workers 1), 워커를 늘리면 DB 로 옮긴다
_USED_FORMS: set[str] = set()


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
            # [처리]를 두 번 누르면 같은 번호가 또 온다 → 경고가 두 번 쌓이지 않게 한 번만 (CLAUDE.md 13)
            form_id = str(form.get("formId", ""))
            if form_id and form_id in _USED_FORMS:
                flash(request, "이미 처리한 요청이라 다시 처리하지 않았어요.", "info")
                return _back(request, back) if back else RedirectResponse(request.url_for("admin:index"), status_code=302)
            _USED_FORMS.add(form_id)
            reason = str(form.get("reason", ""))
            done, errors = await run_in_threadpool(
                _run_for_each, pks, fn, actor_id=current_admin_id(request), reason=reason
            )
            _report(request, title, done, errors)
            return _back(request, back) if back else RedirectResponse(request.url_for("admin:index"), status_code=302)

        return await self.templates.TemplateResponse(
            request, "reason.html", {"title": title, "pks": pks, "form_id": uuid4().hex}
        )


def _reset_demo() -> None:
    with SessionLocal() as db:
        demo_service.reset_demo(db, datetime.now())


class DemoToolView(BaseView):
    """시연 도구 — 테스트 환경(APP_ENV=test)에서만 보이고 동작한다 (AC-F5-14)."""

    name = "시연 도구"
    icon = "fa-solid fa-rotate"

    def is_visible(self, request: Request) -> bool:
        return get_settings().is_test_env

    def is_accessible(self, request: Request) -> bool:
        return get_settings().is_test_env

    @expose("/demo", methods=["GET", "POST"], identity="demo")
    async def demo(self, request: Request) -> Response:
        if request.method == "POST":
            try:
                await run_in_threadpool(_reset_demo)
                flash(request, "시연 데이터를 처음 상태로 되돌렸어요.", "success")
            except AppError as exc:
                flash(request, f"초기화 실패 — {exc.message}", "danger")
            return RedirectResponse(request.url_for("admin:view-demo"), status_code=302)
        return await self.templates.TemplateResponse(request, "demo.html", {})

class NoticeAdmin(SdModelView, model=Notice):
    """공지사항 — 관리자가 쓰고·고치고·지운다 (FR-CS-02, FR-ADMIN-06, AC-F5-21). 2번 묶음.

    상태 전이가 없는 단순 글이라 다른 뷰와 달리 직접 편집한다. [상단 고정]을 켜면 공지사항 목록 맨 위에 보인다.
    게시일을 비우면 지금 시각, 미래로 두면 그때부터 보인다. 작성자는 로그인한 관리자로 채운다.
    """

    name = "공지사항"
    name_plural = "공지사항"
    icon = "fa-solid fa-bullhorn"
    can_create = can_edit = can_delete = True
    column_list = [Notice.id, Notice.category, Notice.title, Notice.is_pinned, Notice.published_at]
    column_searchable_list = [Notice.title]
    column_default_sort = [(Notice.is_pinned, True), (Notice.published_at, True)]
    form_columns = [Notice.category, Notice.title, Notice.body, Notice.is_pinned, Notice.published_at]
    form_overrides = {"category": SelectField}
    form_args = {
        "category": {"choices": [("GUIDE", "안내"), ("MAINTENANCE", "점검"), ("POLICY", "정책")], "label": "분류"},
        "published_at": {"validators": [Optional()]},
    }
    column_formatters = {Notice.category: code()}
    column_labels = {"id": "번호", Notice.category: "분류", Notice.title: "제목", Notice.body: "본문 (빈 줄로 문단, - 로 목록)",
                     Notice.is_pinned: "상단 고정", Notice.published_at: "게시일"}

    async def on_model_change(self, data: dict, model: Notice, is_created: bool, request: Request) -> None:
        if not data.get("published_at"):
            data["published_at"] = datetime.now()
        if is_created:
            data["created_by"] = current_admin_id(request)
