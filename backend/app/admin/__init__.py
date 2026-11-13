"""관리자 화면 (SQLAdmin, /admin). React 화면 없음 — plan.md 6.5."""
from pathlib import Path

from fastapi import FastAPI
from sqladmin import Admin

from app.admin.auth import AdminAuth
from app.admin.views import DemoToolView, ReasonView, SanctionAdmin, StatusHistoryAdmin, SupplierAdmin, UserAdmin
from app.core.config import get_settings
from app.core.db import engine

TEMPLATES_DIR = str(Path(__file__).parent / "templates")


def setup_admin(app: FastAPI) -> Admin:
    admin = Admin(
        app,
        engine,
        title="STAGE DUCK 관리자",
        authentication_backend=AdminAuth(secret_key=get_settings().admin_session_secret),
        templates_dir=TEMPLATES_DIR,
    )
    for view in (SupplierAdmin, UserAdmin, SanctionAdmin, StatusHistoryAdmin):
        admin.add_view(view)
    admin.add_base_view(ReasonView)
    admin.add_base_view(DemoToolView)
    return admin
