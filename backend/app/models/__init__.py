"""모든 모델을 여기서 불러와야 Alembic·테스트가 테이블을 안다."""
from app.core.db import Base
from app.models.board import PrPost  # noqa: F401  #30 업체 찾기
from app.models.chat import ChatMessage, ChatRead, ChatRoom  # noqa: F401  #42 채팅
from app.models.community import FreeBookmark, FreeComment, FreeHelpful, FreePost
from app.models.file import StoredFile
from app.models.history import StatusHistory
from app.models.password_reset import PasswordResetRequest, PasswordResetToken  # noqa: F401  #122 비밀번호 찾기
from app.models.policy import Report, Sanction
from app.models.quote import Quote, QuoteVersion
from app.models.rejection import RejectionEvent  # noqa: F401  #39 반려
from app.models.request import Performance, PerformanceVersion, Stage
from app.models.supplier import Supplier, SupplierCategory
from app.models.support import Inquiry, Notice  # noqa: F401  #103 공지사항, #102 1:1 문의
from app.models.notification import Notification, NotificationSetting  # noqa: F401  #45 사이트 안 알림 · 메일 알림 설정
from app.models.offer import FavoriteSupplier, Offer  # noqa: F401  #32 견적 요청·관심 업체
from app.models.tech import TechCheck  # noqa: F401  #49 기술 확인
from app.models.terms import SupplierTermsReview, TermsAgreement
from app.models.user import User
from app.models.venue import Venue, VenueEquipment
from app.models.payment import Cancellation, LedgerEntry, Order, OrderLine, Payment  # noqa: F401  #50·#51·#52 청구서·결제·장부·취소

__all__ = ["FreePost", "FreeComment", "FreeHelpful", "FreeBookmark", "Base", "User", "Supplier", "SupplierCategory", "Sanction", "Report", "StatusHistory", "TermsAgreement", "SupplierTermsReview", "StoredFile", "Performance", "PerformanceVersion", "Stage", "Quote", "QuoteVersion", "Venue", "VenueEquipment", "TechCheck", "RejectionEvent", "PasswordResetToken", "PasswordResetRequest", "Notice"]
from app.models.review import Review  # noqa: F401  공연 후기·평점
