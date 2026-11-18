"""모든 모델을 여기서 불러와야 Alembic·테스트가 테이블을 안다."""
from app.core.db import Base
from app.models.board import PrPost  # noqa: F401  #30 업체 찾기
from app.models.chat import ChatMessage, ChatRead, ChatRoom  # noqa: F401  #42 채팅
from app.models.community import FreeBookmark, FreeComment, FreeHelpful, FreePost
from app.models.file import StoredFile
from app.models.history import StatusHistory
from app.models.policy import Report, Sanction
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, PerformanceVersion, Stage
from app.models.supplier import Supplier, SupplierCategory
from app.models.tech import TechCheck  # noqa: F401  #49 기술 확인
from app.models.terms import TermsAgreement
from app.models.user import User
from app.models.venue import Venue, VenueEquipment

__all__ = ["FreePost", "FreeComment", "FreeHelpful", "FreeBookmark", "Base", "User", "Supplier", "SupplierCategory", "Sanction", "Report", "StatusHistory", "TermsAgreement", "StoredFile", "Performance", "PerformanceVersion", "Stage", "Quote", "QuoteVersion", "Venue", "VenueEquipment", "TechCheck"]
