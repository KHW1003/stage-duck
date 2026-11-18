"""견적서 API (api-contract.md 3.3): 보내기·고치기·보기."""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.models.user import User
from app.quote import service
from app.quote.schemas import QuoteIn, QuoteOut, QuoteSentOut, QuoteUpdateIn

router = APIRouter(prefix="/quotes", tags=["quote"])
stage_quote_router = APIRouter(prefix="/stages", tags=["quote"])


@stage_quote_router.post("/{stage_id}/quotes", response_model=QuoteSentOut, status_code=status.HTTP_201_CREATED)
def send_quote(
    stage_id: int,
    body: QuoteIn,
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
) -> QuoteSentOut:
    """AC-F2-15~19: 견적서 보내기 (v1)."""
    quote, row, checks = service.send_quote(db, user, stage_id, body)
    return QuoteSentOut(quote_id=quote.id, version=row.version, chat_room_id=None, checks=checks)


@router.put("/{quote_id}", response_model=QuoteSentOut)
def update_quote(
    quote_id: int,
    body: QuoteUpdateIn,
    user: User = Depends(require_role("SUPPLIER")),
    db: Session = Depends(get_db),
) -> QuoteSentOut:
    """AC-F2-20: 견적서 고치기 → 새 버전."""
    quote, row, checks = service.update_quote(db, user, quote_id, body)
    return QuoteSentOut(quote_id=quote.id, version=row.version, chat_room_id=None, checks=checks)


@router.get("/{quote_id}", response_model=QuoteOut)
def get_quote(
    quote_id: int,
    user: User = Depends(require_role("USER", "SUPPLIER")),
    db: Session = Depends(get_db),
) -> QuoteOut:
    """AC-F2-14: 견적서 보기 (현재 버전 + 이력). 다른 업체·다른 사용자는 404."""
    quote = service.get_quote(db, user, quote_id)
    current = next(v for v in quote.versions if v.version == quote.current_version)
    return QuoteOut(
        quote_id=quote.id, stage_id=quote.stage_id, supplier_id=quote.supplier_id, label=quote.label,
        status=quote.status, is_full_spec=quote.is_full_spec, current_version=quote.current_version,
        current=current, versions=quote.versions,
    )
