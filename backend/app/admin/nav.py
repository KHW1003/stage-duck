"""관리자 화면 뼈대 (11/25 해원: 구조 개편) — 왼쪽 메뉴 묶음과 첫 화면 "처리할 일" 집계.

- 메뉴는 할 일 단위로 묶는다: 회원·업체 / 신고·제재 / 콘텐츠 / 거래 / 고객지원 / 도구.
- 첫 화면은 지금 처리해야 할 것(심사 대기·미처리 신고·답변 대기 문의)의 수와 최근 항목만 보여 준다.
  읽기만 하고 아무것도 바꾸지 않는다. 컨펌·결제는 관리자가 대신 처리하지 않는다.
템플릿(sqladmin/layout.html·index.html)이 jinja 전역 sd_nav·sd_dashboard 로 부른다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from starlette.requests import Request

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Performance, Supplier, User
from app.models.policy import Report
from app.models.support import Inquiry

# (묶음 이름, [(메뉴 이름, 화면 identity, Font Awesome 아이콘)])  — identity 는 views.py 의 ModelView/BaseView
NAV_GROUPS: list[tuple[str, list[tuple[str, str, str]]]] = [
    ("회원·업체", [("업체 심사", "supplier", "fa-store"), ("회원", "user", "fa-user")]),
    ("신고·제재", [("신고", "report", "fa-flag"), ("제재 이력", "sanction", "fa-gavel")]),
    ("콘텐츠", [
        ("커뮤니티 글", "free-post", "fa-comments"),
        ("커뮤니티 댓글", "free-comment", "fa-comment"),
        ("업체 소개 글", "pr-post", "fa-bullhorn"),
        ("공지사항", "notice", "fa-thumbtack"),
    ]),
    ("거래", [("공연", "performance", "fa-music"), ("상태 변경 이력", "status-history", "fa-clock-rotate-left")]),
    ("고객지원", [("1:1 문의", "inquiry", "fa-circle-question")]),
]
ACTIVE_PERFORMANCE = ("PUBLISHED", "ASSIGNING", "AWAITING_PAYMENT")


@dataclass
class NavItem:
    label: str
    url: str
    icon: str
    active: bool
    badge: int = 0


@dataclass
class NavGroup:
    title: str
    items: list[NavItem] = field(default_factory=list)


def _counts() -> dict[str, int]:
    with SessionLocal() as db:
        return {
            "supplier": db.scalar(select(func.count()).select_from(Supplier).where(Supplier.review_status == "PENDING")) or 0,
            "report": db.scalar(select(func.count()).select_from(Report).where(Report.status == "OPEN")) or 0,
            "inquiry": db.scalar(select(func.count()).select_from(Inquiry).where(Inquiry.status == "WAITING")) or 0,
            "performance": db.scalar(
                select(func.count()).select_from(Performance).where(Performance.status.in_(ACTIVE_PERFORMANCE))
            ) or 0,
            "users": db.scalar(select(func.count()).select_from(User).where(User.role == "USER")) or 0,
            "suppliers": db.scalar(select(func.count()).select_from(Supplier).where(Supplier.review_status == "APPROVED")) or 0,
        }


def sd_nav(request: Request) -> list[NavGroup]:
    """왼쪽 메뉴. 처리할 일이 있는 메뉴(심사·신고·문의)에는 숫자 배지."""
    path = request.url.path
    counts = _counts()
    groups = []
    for title, items in NAV_GROUPS:
        group = NavGroup(title)
        for label, identity, icon in items:
            url = str(request.url_for("admin:list", identity=identity))
            active = path.startswith(f"/admin/{identity}/")
            group.items.append(NavItem(label, url, icon, active, counts.get(identity, 0) if identity != "performance" else 0))
        groups.append(group)
    if get_settings().is_test_env:
        demo = str(request.url_for("admin:view-demo"))
        groups.append(NavGroup("도구", [NavItem("시연 도구", demo, "fa-rotate", path.rstrip("/").endswith("/demo"))]))
    return groups


def sd_dashboard(request: Request) -> dict:
    """첫 화면: 처리할 일 수 + 최근 항목 (각 5건)."""
    counts = _counts()
    link = lambda identity: str(request.url_for("admin:list", identity=identity))  # noqa: E731
    detail = lambda identity, pk: str(request.url_for("admin:details", identity=identity, pk=pk))  # noqa: E731
    with SessionLocal() as db:
        pending = db.execute(
            select(Supplier.id, Supplier.company_name, Supplier.created_at)
            .where(Supplier.review_status == "PENDING").order_by(Supplier.created_at.desc()).limit(5)
        ).all()
        reports = db.execute(
            select(Report.id, Report.reason, Report.created_at)
            .where(Report.status == "OPEN").order_by(Report.created_at.desc()).limit(5)
        ).all()
        inquiries = db.execute(
            select(Inquiry.id, Inquiry.title, Inquiry.created_at)
            .where(Inquiry.status == "WAITING").order_by(Inquiry.created_at.desc()).limit(5)
        ).all()
    return {
        "todo": [
            {"label": "심사 대기 업체", "count": counts["supplier"], "url": link("supplier"), "hot": counts["supplier"] > 0},
            {"label": "미처리 신고", "count": counts["report"], "url": link("report"), "hot": counts["report"] > 0},
            {"label": "답변 대기 문의", "count": counts["inquiry"], "url": link("inquiry"), "hot": counts["inquiry"] > 0},
            {"label": "진행 중 공연", "count": counts["performance"], "url": link("performance"), "hot": False},
        ],
        "totals": [("회원(사용자)", counts["users"]), ("승인된 업체", counts["suppliers"])],
        "lists": [
            {"title": "심사 대기 업체", "more": link("supplier"), "empty": "심사를 기다리는 업체가 없어요.",
             "rows": [(r.company_name, r.created_at, detail("supplier", r.id)) for r in pending]},
            {"title": "미처리 신고", "more": link("report"), "empty": "처리할 신고가 없어요.",
             "rows": [(r.reason, r.created_at, detail("report", r.id)) for r in reports]},
            {"title": "답변 대기 문의", "more": link("inquiry"), "empty": "답변할 문의가 없어요.",
             "rows": [(r.title, r.created_at, detail("inquiry", r.id)) for r in inquiries]},
        ],
    }
