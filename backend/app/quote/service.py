"""견적서 보내기·고치기·보기 (T3-01 #41, AC-F2-14~20, api-contract.md 3.3).

다른 묶음의 테이블은 고치지 않는다. 단계·공연(stages·performances, 2번)은 견적서가 어느 단계·공연에
속하는지 알기 위해 **읽기 전용으로 참조**만 한다 (Quote.stage → Stage.performance 관계).
"""
from dataclasses import asdict
from datetime import time
from typing import Any

from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.quote import Quote, QuoteVersion
from app.models.request import Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.quote import calc
from app.quote.schemas import QuoteBody, QuoteIn, QuoteUpdateIn
from app.request import service as request_service
from app.supplier import service as supplier_service

VENUE_FIELDS = ("venue_id", "checkin_time", "setup_available_time")


def _stage_not_open() -> AppError:
    return AppError(409, "STAGE_NOT_OPEN", "이 단계는 지금 견적서를 받고 있지 않아요.")


def _sender(db: Session, user: User) -> Supplier:
    """견적서를 보낼 수 있는 내 업체 (AC-F1-15, AC-F4-08). 업체 정지 → 403 ACCOUNT_SUSPENDED, 미승인 → 403 SUPPLIER_NOT_APPROVED.

    계정(users.status) 정지는 로그인 단계(current_user)에서 이미 401로 막힌다.
    """
    supplier = supplier_service.get_application(db, user)
    if not supplier_service.can_send_quotes(supplier):
        if supplier.review_status == "SUSPENDED":
            raise AppError(403, "ACCOUNT_SUSPENDED", "이용이 정지된 계정이라 견적서를 보낼 수 없어요.")
        raise AppError(403, "SUPPLIER_NOT_APPROVED", "관리자 확인이 끝나면 견적서를 보낼 수 있어요. 결과는 알림으로 알려 드려요.")
    return supplier


def _venue_fields(stage_type: str, body: QuoteBody) -> None:
    """AC-F2-18: 공간 견적서는 공연장 단계에만, 공연장 단계 견적서는 venueId·checkinTime·setupAvailableTime 필수."""
    if stage_type != "VENUE":
        if body.venue_id is not None:
            raise _stage_not_open()
        return
    missing = [f for f in VENUE_FIELDS if getattr(body, f) is None]
    if missing:
        raise AppError(
            400,
            "VALIDATION_FAILED",
            "입력값을 확인해 주세요.",
            [{"field": to_camel(f), "reason": "공연장 견적서에는 꼭 입력해 주세요."} for f in missing],
        )


def _snapshot_dict(db: Session, venue_id: int) -> dict[str, Any]:
    """공간 조건을 견적서 버전에 복사해 둔다 (quote_versions.venue_snapshot). 시각은 "14:00" 모양."""
    snap = supplier_service.get_venue_snapshot(db, venue_id)
    data = {to_camel(k): (v.strftime("%H:%M") if isinstance(v, time) else v) for k, v in asdict(snap).items()}
    data["conditions"] = dict(snap.conditions)
    return data


def _version_row(quote: Quote, version: int, perf_version: int, body: QuoteBody, stage_type: str, db: Session) -> QuoteVersion:
    """견적서 버전 한 줄. 이전 버전은 고치지 않고 새로 더하기만 한다 (AC-F2-20, CLAUDE.md 3장 5)."""
    is_venue = stage_type == "VENUE"
    return QuoteVersion(
        quote_id=quote.id,
        version=version,
        based_on_perf_version=perf_version,
        venue_id=body.venue_id if is_venue else None,
        venue_snapshot=_snapshot_dict(db, body.venue_id) if is_venue else None,
        checkin_time=body.checkin_time if is_venue else None,
        setup_available_time=body.setup_available_time if is_venue else None,
        setup_start=body.setup_start,
        setup_minutes=body.setup_minutes,
        teardown_minutes=body.teardown_minutes,
        staff=[s.model_dump(mode="json") | {"start": s.start.strftime("%H:%M"), "end": s.end.strftime("%H:%M")}
               for s in body.staff],
        items=[i.model_dump(mode="json", by_alias=True) for i in body.items],
        includes_equipment=body.includes.equipment,
        includes_engineer=body.includes.engineer,
        includes_install=body.includes.install,
        includes_transport=body.includes.transport,
        amount_items=body.amounts.items,
        amount_transport=body.amounts.transport,
        amount_install=body.amounts.install,
        amount_labor=body.amounts.labor,
        amount_etc=body.amounts.etc,
        discount_amount=body.discount_amount,
        total_amount=body.total_amount,
        extra_cost_note=body.extra_cost_note,
        valid_until=body.valid_until,
        tech_note=body.tech_note,
    )


def _checks(quote: Quote, row: QuoteVersion) -> list[dict]:
    """자동 검사 결과 (api-contract.md 4.1 checks[]).

    check.calc.run_checks 는 있지만 요청서 값(PerformanceInput: 관객 수·리허설·공연 시각·예산)을 주는
    2번 묶음 함수가 아직 없어 지금은 빈 배열이다. 그 함수가 생기면 여기서 run_checks 를 부른다.
    """
    return []


def send_quote(db: Session, user: User, stage_id: int, body: QuoteIn) -> tuple[Quote, QuoteVersion, list[dict]]:
    """AC-F2-15·16·17·18·19: 열린 단계 공고에 견적서 v1을 보낸다. 같은 단계에 label 이 다른 견적서 여러 개 가능 (D-6).

    검사 순서: 업체 승인·정지(403) → 내 부문 × 열린 단계(409 STAGE_NOT_OPEN) → 공간 견적서 칸(409·400)
    → 합계(api-contract.md 3.3 순서, calc.verify_total).
    """
    supplier = _sender(db, user)
    if not request_service.posting_visible(db, stage_id, supplier):
        raise _stage_not_open()
    stage = db.get(Stage, stage_id)  # 읽기 전용 참조 (2번 stages·performances)
    _venue_fields(stage.stage_type, body)
    calc.verify_total(body.amounts, body.total_amount, body.discount_amount)

    quote = Quote(
        stage_id=stage_id,
        supplier_id=supplier.id,
        label=body.label,
        current_version=1,
        status="SENT",
        is_full_spec=body.includes.equipment and body.includes.engineer,  # AC-F2-19
    )
    db.add(quote)
    db.flush()
    row = _version_row(quote, 1, stage.performance.current_version, body, stage.stage_type, db)
    db.add(row)
    record_transition(
        db, entity_type="quote", entity_id=quote.id, from_status=None, to_status="SENT", actor_user_id=user.id
    )
    db.flush()
    checks = _checks(quote, row)
    # #42에서 채팅방 연결 (견적서를 보내면 채팅방이 생기고 응답 chatRoomId 를 채운다)
    # #45에서 QUOTE_RECEIVED 알림 (사용자 견적함 도착 알림)
    db.commit()
    return quote, row, checks


def update_quote(db: Session, user: User, quote_id: int, body: QuoteUpdateIn) -> tuple[Quote, QuoteVersion, list[dict]]:
    """AC-F2-20: 견적서를 고치면 새 버전을 더한다. 이전 버전은 그대로 남는다. label 은 바꾸지 않는다.

    본인 견적서가 아니면 404, 본문 version 이 지금 버전과 다르면 409 VERSION_CONFLICT (api-contract.md 1장),
    보낸 상태(SENT)가 아니면 409 INVALID_STATE.
    """
    supplier = _sender(db, user)
    quote = db.scalar(select(Quote).where(Quote.id == quote_id).with_for_update())
    if quote is None or quote.supplier_id != supplier.id:
        raise not_found()
    if body.version != quote.current_version:
        raise AppError(409, "VERSION_CONFLICT", "그사이 내용이 바뀌었어요. 새로 고친 뒤 다시 해 주세요.")
    if quote.status != "SENT":
        raise invalid_state("보낸 상태의 견적서만 고칠 수 있어요.")
    stage = quote.stage  # 읽기 전용 참조 (2번 stages·performances)
    _venue_fields(stage.stage_type, body)
    calc.verify_total(body.amounts, body.total_amount, body.discount_amount)

    quote.current_version += 1
    quote.is_full_spec = body.includes.equipment and body.includes.engineer
    row = _version_row(quote, quote.current_version, stage.performance.current_version, body, stage.stage_type, db)
    db.add(row)
    db.flush()
    checks = _checks(quote, row)
    # #43에서 이 단계의 대기 중인 최종 견적 카드를 INVALIDATED 로 (AC-F3-09)
    db.commit()
    db.refresh(quote)
    return quote, row, checks


def get_quote(db: Session, user: User, quote_id: int) -> Quote:
    """AC-F2-14, AC-F1-14: 견적서 (현재 버전 + 이력). 보낸 업체와 그 공연의 사용자만 보고, 나머지는 404."""
    quote = db.get(Quote, quote_id)
    if quote is None:
        raise not_found()
    if user.role == "SUPPLIER":
        allowed = quote.supplier_id == supplier_service.get_application(db, user).id
    elif user.role == "USER":
        allowed = quote.stage.performance.user_id == user.id  # 읽기 전용 참조
    else:
        allowed = False
    if not allowed:
        raise not_found()
    return quote


# ---------------------------------------------------------------------------
# 묶음 사이 약속 (CLAUDE.md 5장) — 3번 → 2번
# 이름·인자·돌려주는 모양을 바꾸려면 쓰는 쪽(2번 해원)과 먼저 합의한다.
# ---------------------------------------------------------------------------


def quote_counts(db: Session, stage_ids: list[int]) -> dict[int, int]:
    """[약속 3 → 2] 단계별 받은 견적서 수. 철회(WITHDRAWN)는 세지 않고, 견적서가 없는 단계는 0.

    쓰는 곳: 2번 해원 #40 "내 공연 현황". stage_ids 가 비면 {}. 쿼리 한 번 (GROUP BY stage_id).
    """
    if not stage_ids:
        return {}
    rows = db.execute(
        select(Quote.stage_id, func.count(Quote.id))
        .where(Quote.stage_id.in_(stage_ids), Quote.status != "WITHDRAWN")
        .group_by(Quote.stage_id)
    ).all()
    counts = dict.fromkeys(stage_ids, 0)
    counts.update({stage_id: n for stage_id, n in rows})
    return counts
