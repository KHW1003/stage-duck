"""관리자 화면 (SQLAdmin, /admin). React 화면 없음 — plan.md 6.5.

테마: templates/sqladmin/ 의 base·login·index 가 원본(sqladmin_original/)을 덮어쓰고,
static/ 의 admin.css·logo.webp 를 /admin-static 에서 준다.
"""
import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import sqladmin.application as sqladmin_app
from sqladmin import Admin

from app.admin.display import ko_gettext, ko_ngettext

from app.admin.auth import AdminAuth
from app.admin.nav import sd_dashboard, sd_nav
from app.auth.tokens import secure_cookies
from app.admin.views import (
    DemoToolView,
    FreeCommentAdmin,
    NoticeAdmin,
    FreePostAdmin,
    InquiryAdmin,
    PerformanceAdmin,
    PerformanceHistoryView,
    PrPostAdmin,
    ReasonView,
    ReportAdmin,
    SanctionAdmin,
    StatusHistoryAdmin,
    SupplierAdmin,
    UserAdmin,
)
from app.core.config import get_settings
from app.core.db import engine

ADMIN_DIR = Path(__file__).parent
TEMPLATES_DIR = str(ADMIN_DIR / "templates")
STATIC_URL = "/admin-static"

# Windows의 Python은 .webp 형식을 몰라 application/octet-stream 으로 준다 → 로고·파비콘이 안 보일 수 있다
mimetypes.add_type("image/webp", ".webp")


def setup_admin(app: FastAPI) -> Admin:
    app.mount(STATIC_URL, StaticFiles(directory=ADMIN_DIR / "static"), name="admin-static")
    admin = Admin(
        app,
        engine,
        title="STAGE DUCK 관리자",
        logo_url=f"{STATIC_URL}/logo-on-dark.svg",
        logo_width=132,
        logo_height=18,
        favicon_url=f"{STATIC_URL}/logo.webp",
        authentication_backend=AdminAuth(secret_key=get_settings().admin_session_secret, https_only=secure_cookies()),
        templates_dir=TEMPLATES_DIR,
    )
    # SQLAdmin 기본 문구를 한국어로. 저장 버튼은 눌린 값(번역된 글자)을 application.gettext 로 비교하므로 같이 바꾼다
    admin.templates.env.install_gettext_callables(ko_gettext, ko_ngettext, newstyle=True)
    # 구조 개편 (11/25): 왼쪽 메뉴 묶음·첫 화면 처리할 일 (nav.py)
    admin.templates.env.globals.update(sd_nav=sd_nav, sd_dashboard=sd_dashboard)
    sqladmin_app.gettext = ko_gettext
    for view in (SupplierAdmin, UserAdmin, ReportAdmin, SanctionAdmin, StatusHistoryAdmin, FreePostAdmin, FreeCommentAdmin, PrPostAdmin, PerformanceAdmin, NoticeAdmin, InquiryAdmin):
        admin.add_view(view)
    admin.add_base_view(ReasonView)
    admin.add_base_view(PerformanceHistoryView)
    admin.add_base_view(DemoToolView)
    return admin
