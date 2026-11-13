"""관리자 화면 (SQLAdmin, /admin). React 화면 없음 — plan.md 6.5.

테마: templates/sqladmin/ 의 base·login·index 가 원본(sqladmin_original/)을 덮어쓰고,
static/ 의 admin.css·logo.webp 를 /admin-static 에서 준다.
"""
import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqladmin import Admin

from app.admin.auth import AdminAuth
from app.admin.views import DemoToolView, ReasonView, SanctionAdmin, StatusHistoryAdmin, SupplierAdmin, UserAdmin
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
        logo_url=f"{STATIC_URL}/logo.webp",
        logo_width=56,
        logo_height=56,
        favicon_url=f"{STATIC_URL}/logo.webp",
        authentication_backend=AdminAuth(secret_key=get_settings().admin_session_secret),
        templates_dir=TEMPLATES_DIR,
    )
    for view in (SupplierAdmin, UserAdmin, SanctionAdmin, StatusHistoryAdmin):
        admin.add_view(view)
    admin.add_base_view(ReasonView)
    admin.add_base_view(DemoToolView)
    return admin
