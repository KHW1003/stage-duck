"""단계별 견적 비교 (T4-03 #48, AC-F3-20~24, api-contract.md 4.1 GET /stages/{stageId}/quotes)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.check.calc import overall
from app.core.db import get_db
from app.models.user import User
from app.quote import service as quote_service

router = APIRouter(prefix="/stages", tags=["check"])


class CompareQuoteOut(BaseModel):
    """비교 화면 견적서 한 칸: 견적서 + 자동 검사 + 풀스펙 배지 + 오퍼 여부."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    quote_id: int
    supplier_id: int
    label: str
    version: int
    total_amount: int
    is_full_spec: bool
    offered: bool
    overall: str
    checks: list[dict]


@router.get("/{stage_id}/quotes", response_model=list[CompareQuoteOut])
def compare_quotes(
    stage_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> list[CompareQuoteOut]:
    """AC-F3-20~24: 그 단계에 받은 견적서를 검사 결과와 함께 나란히. 남의 공연은 404."""
    return [
        CompareQuoteOut(
            quote_id=quote.id, supplier_id=quote.supplier_id, label=quote.label, version=row.version,
            total_amount=row.total_amount, is_full_spec=quote.is_full_spec, offered=quote.offer_id is not None,
            overall=overall([c["result"] for c in checks]), checks=checks,
        )
        for quote, row, checks in quote_service.stage_quotes_with_checks(db, user, stage_id)
    ]
