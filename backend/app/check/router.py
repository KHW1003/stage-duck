"""단계별 견적 비교 (T4-03 #48, AC-F3-20~24, api-contract.md 4.1 GET /stages/{stageId}/quotes)."""
from datetime import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.check.calc import overall
from app.core.db import get_db
from app.models.chat import ChatRoom
from app.models.quote import Quote
from app.models.request import Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.quote import service as quote_service

router = APIRouter(prefix="/stages", tags=["check"])


def _hm(t: time | None) -> str | None:
    return t.strftime("%H:%M") if t else None


def _shown_status(quote: Quote, confirmed_version_id: int | None) -> str:
    """업체 사정 취소 뒤 다시 확정한 단계: 취소된 옛 견적서는 CONFIRMED 로 남으므로(data-model 11장) 화면에는 마감으로 준다."""
    stale = quote.status == "CONFIRMED" and confirmed_version_id is not None and confirmed_version_id not in {v.id for v in quote.versions}
    return "CLOSED" if stale else quote.status


class CompareQuoteOut(BaseModel):
    """비교 화면 견적서 한 칸: 견적서 + 자동 검사 + 풀스펙 배지 + 오퍼 여부."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    quote_id: int
    supplier_id: int
    company_name: str  # 비교 카드 맨 위 "누구" (11/23 디자인 검수)
    room_id: int | None  # 그 단계 × 업체 채팅방 — 카드의 [채팅] 이 연다. 견적서를 보내면 생기니 보통 있다
    chat_started: bool  # 사용자가 채팅을 시작했는지 (방이 있어도 시작 전이면 "견적 받음", 11/24)
    label: str
    status: str  # 견적서 상태 (SENT · CONFIRMED …). 지금 확정된 견적서만 CONFIRMED (_shown_status)
    version: int
    based_on_perf_version: int
    total_amount: int
    venue_id: int | None  # 공연장 견적서만 (공간 스냅샷) — 화면이 공간 사진을 고른다
    venue_type: str | None
    venue_name: str | None
    max_capacity: int | None
    checkin_time: str | None
    setup_available_time: str | None
    checkout_time: str | None
    includes_equipment: bool
    includes_engineer: bool
    is_full_spec: bool
    offered: bool
    overall: str
    checks: list[dict]


@router.get("/{stage_id}/quotes", response_model=list[CompareQuoteOut])
def compare_quotes(
    stage_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> list[CompareQuoteOut]:
    """AC-F3-20~24: 그 단계에 받은 견적서를 검사 결과와 함께 나란히. 남의 공연은 404."""
    out = []
    rows = quote_service.stage_quotes_with_checks(db, user, stage_id)
    confirmed_version_id = db.get(Stage, stage_id).confirmed_quote_version_id  # 읽기 전용 참조 (2번 stages)
    ids = {q.supplier_id for q, _, _ in rows}
    names = dict(db.execute(select(Supplier.id, Supplier.company_name).where(Supplier.id.in_(ids))).all()) if ids else {}
    room_rows = db.execute(
        select(ChatRoom.supplier_id, ChatRoom.id, ChatRoom.started_at)
        .where(ChatRoom.stage_id == stage_id, ChatRoom.supplier_id.in_(ids))
    ).all() if ids else []
    rooms = {sid: rid for sid, rid, _ in room_rows}
    started = {sid for sid, _, at in room_rows if at is not None}
    for quote, row, checks in rows:
        snap = row.venue_snapshot or {}
        out.append(CompareQuoteOut(
            quote_id=quote.id, supplier_id=quote.supplier_id, company_name=names.get(quote.supplier_id, ""),
            room_id=rooms.get(quote.supplier_id), chat_started=quote.supplier_id in started, label=quote.label, status=_shown_status(quote, confirmed_version_id),
            version=row.version, based_on_perf_version=row.based_on_perf_version, total_amount=row.total_amount,
            venue_id=snap.get("venueId"), venue_type=snap.get("venueType"), venue_name=snap.get("name"), max_capacity=snap.get("maxCapacity"), checkout_time=snap.get("checkoutTime"),
            checkin_time=_hm(row.checkin_time), setup_available_time=_hm(row.setup_available_time),
            includes_equipment=row.includes_equipment, includes_engineer=row.includes_engineer,
            is_full_spec=quote.is_full_spec, offered=quote.offer_id is not None,
            overall=overall([c["result"] for c in checks]), checks=checks,
        ))
    return out
