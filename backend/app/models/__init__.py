"""모든 모델을 여기서 불러와야 Alembic·테스트가 테이블을 안다."""
from app.core.db import Base
from app.models.history import StatusHistory
from app.models.policy import Sanction
from app.models.supplier import Supplier, SupplierCategory
from app.models.user import User

__all__ = ["Base", "User", "Supplier", "SupplierCategory", "Sanction", "StatusHistory"]
