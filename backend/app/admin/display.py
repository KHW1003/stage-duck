"""관리자 화면 표시 규칙 (11/24 디자인 검수 반영).

- 날짜: 2026.11.23 10:16 (마이크로초 없이), 빈 값은 "—"
- 상태값: 영어 코드 대신 한글 + 점 배지 (색만으로 구분하지 않게 글자를 함께)
- 분류·종류 코드: 한글 글자만
- SQLAdmin 기본 문구(Actions·Export·Search…)를 한국어로 (ko_gettext)
"""
from collections.abc import Callable
from datetime import date, datetime, time
from typing import Any

from markupsafe import Markup, escape
from sqladmin import ModelView
from sqladmin.formatters import BASE_FORMATTERS


def _dt(value: datetime) -> str:
    return value.strftime("%Y.%m.%d %H:%M")


def _d(value: date) -> str:
    return value.strftime("%Y.%m.%d")


NONE = Markup('<span class="sd-none">—</span>')

TYPE_FORMATTERS = {
    **BASE_FORMATTERS, type(None): lambda v: NONE, datetime: _dt, date: _d,
    time: lambda v: v.strftime("%H:%M"), bool: lambda v: "예" if v else "아니요",  # 11/25: 체크 아이콘 대신 글자
}

# 상태값 → (글자, 톤). 톤: wait(처리 대기) · ok(정상·완료) · off(반려·정지·숨김) · info(진행 중)
STATUS: dict[str, tuple[str, str]] = {
    "PENDING": ("심사 대기", "wait"), "APPROVED": ("승인", "ok"), "REJECTED": ("반려", "off"),
    "SUSPENDED": ("정지", "off"), "ACTIVE": ("정상", "ok"), "WITHDRAWN": ("탈퇴", "off"),
    "OPEN": ("처리 대기", "wait"), "WARNED": ("경고 처리", "ok"), "DISMISSED": ("기각", "ok"),
    "WAITING": ("답변 대기", "wait"), "ANSWERED": ("답변 완료", "ok"),
    "BLINDED": ("블라인드", "off"), "HIDDEN": ("숨김", "off"), "DELETED": ("삭제", "off"),
    "DRAFT": ("임시 저장", "info"), "PUBLISHED": ("공고 중", "info"), "ASSIGNING": ("배정 중", "info"),
    "AWAITING_PAYMENT": ("결제 대기", "wait"), "CONFIRMED": ("확정", "ok"), "COMPLETED": ("완료", "ok"),
    "CANCELLED": ("취소", "off"),
}
# 게시 글은 ACTIVE 를 "게시 중"으로
POST_STATUS = {**STATUS, "ACTIVE": ("게시 중", "ok")}

CODES: dict[str, str] = {
    # 역할 · 사업자 유형
    "USER": "사용자", "SUPPLIER": "업체", "ADMIN": "관리자",
    "INDIVIDUAL": "개인", "SOLE_PROPRIETOR": "개인사업자", "CORPORATION": "법인",
    # 공연 형태 (11/25)
    "BAND": "밴드", "THEATER": "연극", "TALK_EVENT": "강연·행사", "RELIGIOUS": "종교 행사",
    # 업체 분야
    "VENUE": "공연장", "EQUIPMENT": "장비", "INSTALL": "설치", "ENGINEER": "엔지니어",
    # 커뮤니티 말머리
    "FREE": "자유", "QUESTION": "질문", "INFO": "정보", "NEWS": "소식",
    # 공지 · 문의 분류
    "GUIDE": "안내", "MAINTENANCE": "점검", "POLICY": "정책",
    "PAYMENT": "결제·환불", "QUOTE": "견적·확정", "ACCOUNT": "계정", "ETC": "기타",
    # 제재 · 신고 대상
    "WARNING": "경고", "SUSPENSION": "정지", "BLIND": "블라인드", "UNSUSPEND": "정지 해제",
    "CHAT_ROOM": "채팅방", "PR_POST": "업체 소개 글", "FREE_POST": "커뮤니티 글", "FREE_COMMENT": "커뮤니티 댓글",
    # 상태 이력 대상
    "inquiry": "1:1 문의", "order": "청구서", "performance": "공연", "pr_post": "업체 소개 글", "quote": "견적서",
    "report": "신고", "stage": "단계", "supplier": "업체", "user": "회원",
}
# 신고 대상의 USER 는 "회원" (역할 표시와 다르게)
REPORT_CODES = {**CODES, "USER": "회원"}
# 문의 분류의 SUPPLIER 는 "업체 이용"
INQUIRY_CODES = {**CODES, "SUPPLIER": "업체 이용"}


def badge(table: dict[str, tuple[str, str]] = STATUS) -> Callable[[Any, str], Markup]:
    def fmt(model: Any, attr: str) -> Markup:
        value = getattr(model, attr)
        if value is None:
            return NONE
        text, tone = table.get(value, (value, "info"))
        return Markup('<span class="sd-status sd-status--{}">{}</span>').format(tone, text)
    return fmt


def code(table: dict[str, str] = CODES) -> Callable[[Any, str], Markup]:
    def fmt(model: Any, attr: str) -> Markup:
        value = getattr(model, attr)
        if value is None:
            return NONE
        if isinstance(value, (list, tuple)):  # 업체 분야처럼 여러 개
            return Markup(", ").join(escape(table.get(getattr(v, "category", v), v)) for v in value) or NONE
        return escape(table.get(value, value))
    return fmt


# ---------- 번호 대신 이름 (11/25 해원: 관리자 입장에서 알아보게) ----------
def _lookup(fn: Callable[[Any], str | None]) -> Callable[[Any], Markup | str]:
    def get(pk: Any) -> Markup | str:
        if pk is None:
            return NONE
        from app.core.db import SessionLocal  # 순환 import 를 피해 여기서
        with SessionLocal() as db:
            text = fn((db, pk))
        return escape(text) if text else Markup('<span class="sd-none">#{}</span>').format(pk)
    return get


def _user_text(arg: tuple) -> str | None:
    from sqlalchemy import select

    from app.models import Supplier, User
    db, pk = arg
    u = db.get(User, pk)
    if u is None:
        return None
    if u.role == "SUPPLIER":
        company = db.scalar(select(Supplier.company_name).where(Supplier.user_id == u.id))
        return f"{company} (업체)" if company else u.email
    if u.role == "ADMIN":
        return f"{u.name} (관리자)"
    return u.nickname or u.email  # 목록 칸이 넘치지 않게 닉네임만 (없으면 이메일)


def _supplier_text(arg: tuple) -> str | None:
    from app.models import Supplier
    db, pk = arg
    s = db.get(Supplier, pk)
    return s.company_name if s else None


def _post_text(arg: tuple) -> str | None:
    from app.models import FreePost
    db, pk = arg
    p = db.get(FreePost, pk)
    return p.title if p else None


def _performance_text(arg: tuple) -> str | None:
    from app.models import Performance
    db, pk = arg
    p = db.get(Performance, pk)
    return f"{p.title} ({p.show_date:%Y.%m.%d})" if p else None


user_name = _lookup(_user_text)
supplier_name = _lookup(_supplier_text)
post_title = _lookup(_post_text)
performance_name = _lookup(_performance_text)


def ref(get: Callable[[Any], Markup | str], none: str | None = None) -> Callable[[Any, str], Markup | str]:
    """번호 칸을 이름으로. none 을 주면 빈 값일 때 그 글자 (예: 처리자 없음 → "시스템")."""
    def fmt(model: Any, attr: str) -> Markup | str:
        value = getattr(model, attr)
        if value is None and none is not None:
            return none
        return get(value)
    return fmt


def report_target(model: Any, attr: str) -> Markup | str:
    """신고 대상 번호 → 그 대상의 제목·내용 앞부분·이름."""
    from app.core.db import SessionLocal
    from app.models import FreeComment, FreePost, PrPost
    kind, pk = model.target_type, model.target_id
    if kind == "USER":
        return user_name(pk)
    with SessionLocal() as db:
        if kind == "FREE_POST":
            obj = db.get(FreePost, pk); text = obj.title if obj else None
        elif kind == "FREE_COMMENT":
            obj = db.get(FreeComment, pk); text = (obj.body[:40] + ("…" if len(obj.body) > 40 else "")) if obj else None
        elif kind == "PR_POST":
            obj = db.get(PrPost, pk); text = obj.title if obj else None
        else:
            text = f"채팅방 #{pk}"
    return escape(text) if text else Markup('<span class="sd-none">#{}</span>').format(pk)


# 상태 이력은 대상마다 같은 코드의 뜻이 달라(단계 OPEN = 공고 중, 신고 OPEN = 처리 대기) 대상별로 고른다
HISTORY_STATUS: dict[str, dict[str, tuple[str, str]]] = {
    "stage": {**STATUS, "WAITING": ("대기", "info"), "OPEN": ("공고 중", "info"), "NEGOTIATING": ("조율 중", "info"),
              "SKIPPED": ("건너뜀", "info"), "RECHECK": ("재확인", "wait")},
    "quote": {**STATUS, "SENT": ("발송", "info"), "CLOSED": ("마감", "off"), "WITHDRAWN": ("철회", "off"),
              "EXPIRED": ("만료", "off")},
    "order": {**STATUS, "ISSUED": ("청구", "wait"), "PAID": ("결제 완료", "ok"),
              "SETTLEMENT_SCHEDULED": ("정산 예정", "ok")},
    "pr_post": POST_STATUS,
}


def history_badge(model: Any, attr: str) -> Markup:
    return badge(HISTORY_STATUS.get(model.entity_type, STATUS))(model, attr)


class SdModelView(ModelView):
    """모든 관리자 목록·상세의 공통: 날짜 형식, 빈 값 "—", 25건씩. 내려받기는 CSV 하나 (JSON 은 개발용이라 뺐다, 11/25)."""

    column_type_formatters = TYPE_FORMATTERS
    column_type_formatters_detail = TYPE_FORMATTERS
    export_types = ["csv"]
    page_size = 25
    page_size_options = [25, 50, 100]


# SQLAdmin 기본 문구 → 한국어. 저장 버튼 값은 application.gettext 로도 비교하므로 setup 에서 함께 바꾼다
KO: dict[str, str] = {
    "Actions": "선택한 항목 처리", "Export": "목록 내려받기 (CSV)", "Search": "검색", "Delete": "삭제", "Delete selected items": "선택 항목 삭제",
    "Edit": "수정", "View": "보기", "Cancel": "취소", "Yes": "확인", "Close": "닫기", "Done": "완료",
    "Go Back": "목록으로", "prev": "이전", "next": "다음", "Show": "표시", "%(size)s / Page": "%(size)s개씩",
    "Showing %(start)s to %(end)s of %(count)s items": "전체 %(count)s건 중 %(start)s–%(end)s",
    "New %(name)s": "새 %(name)s", "Edit %(name)s": "%(name)s 수정",
    "Save": "저장", "Save and continue editing": "저장하고 계속 쓰기", "Save and add another": "저장하고 새로 쓰기",
    "Save as new": "새 글로 저장", "Please confirm": "확인해 주세요", "Logout": "로그아웃", "Login": "로그인",
    "Username": "이메일", "Password": "비밀번호", "Filters": "필터", "Apply Filter": "필터 적용", "Clear filter": "필터 지우기",
    "Select all": "전체 선택", "Select item": "항목 선택", "Refresh list": "새로고침",
    "Column": "항목", "Value": "내용", "You are not authorized to view these records.": "이 목록을 볼 권한이 없어요.",
}


def ko_gettext(message: str) -> str:
    return KO.get(message, message)


def ko_ngettext(singular: str, plural: str, n: int) -> str:
    return ko_gettext(singular if n == 1 else plural)
