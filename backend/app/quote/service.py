"""견적서 보내기·고치기·보기 (T3-01 #41, AC-F2-14~20, api-contract.md 3.3).

다른 묶음의 테이블은 고치지 않는다. 단계·공연(stages·performances, 2번)은 견적서가 어느 단계·공연에
속하는지 알기 위해 **읽기 전용으로 참조**만 한다 (Quote.stage → Stage.performance 관계).
"""
from dataclasses import asdict
from datetime import datetime, time
from typing import Any

from pydantic.alias_generators import to_camel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.chat import service as chat_service
from app.check import calc as check_calc
from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.notification import service as notification
from app.offer import service as offer_service
from app.quote import calc
from app.quote.schemas import QuoteBody, QuoteIn, QuoteUpdateIn
from app.request import rejection
from app.request import service as request_service
from app.supplier import service as supplier_service
from app.supplier.terms import require_review

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


def _hm(value: Any) -> time | None:
    """"14:00" 또는 time → time (견적서 버전·공간 스냅샷에 문자열로 저장돼 있다)."""
    if value is None or isinstance(value, time):
        return value
    return time.fromisoformat(value)


def _venue_input(snap: dict | None) -> check_calc.VenueSnapshot | None:
    if not snap:
        return None
    return check_calc.VenueSnapshot(
        venue_id=snap["venueId"], name=snap["name"], sido=snap["sido"], sigungu=snap["sigungu"],
        venue_type=snap["venueType"], max_capacity=snap["maxCapacity"],
        checkin_time=_hm(snap["checkinTime"]), checkout_time=_hm(snap["checkoutTime"]),
        has_resident_engineer=snap.get("hasResidentEngineer", False),
        conditions=snap.get("conditions") or {}, equipment=tuple(snap.get("equipment") or ()),
    )


def _quote_input(stage_type: str, row: QuoteVersion) -> check_calc.QuoteInput:
    """견적서 버전 → 검사 입력 (4번 run_checks)."""
    return check_calc.QuoteInput(
        stage_type=stage_type,
        based_on_perf_version=row.based_on_perf_version,
        total_amount=row.total_amount,
        venue=_venue_input(row.venue_snapshot),
        checkin_time=_hm(row.checkin_time),
        setup_available_time=_hm(row.setup_available_time),
        setup_start=_hm(row.setup_start),
        setup_minutes=row.setup_minutes,
        teardown_minutes=row.teardown_minutes,
        staff=tuple(
            check_calc.StaffShift(role=s["role"], count=s["count"], start=_hm(s["start"]), end=_hm(s["end"])) for s in row.staff
        ),
        includes_equipment=row.includes_equipment,
        includes_engineer=row.includes_engineer,
    )


def _checks(db: Session, quote: Quote, row: QuoteVersion) -> list[dict]:
    """자동 검사 결과 (api-contract.md 4.1 checks[]). 4번 check.calc.run_checks 를 부른다.

    요청서 값은 2번 약속 함수 performance_input, 앞 단계는 이 공연에서 이미 확정된(CONFIRMED) 앞 단계의 견적서 버전.
    """
    stage = quote.stage
    perf_input = request_service.performance_input(db, stage.performance_id)
    confirmed_rows = db.execute(
        select(Stage.stage_type, QuoteVersion)
        .join(QuoteVersion, QuoteVersion.id == Stage.confirmed_quote_version_id)
        .where(Stage.performance_id == stage.performance_id, Stage.status == "CONFIRMED", Stage.seq < stage.seq)
        .order_by(Stage.seq)
    ).all()
    confirmed = [_quote_input(st, qv) for st, qv in confirmed_rows]
    results = check_calc.run_checks(perf_input, _quote_input(stage.stage_type, row), confirmed)
    return [asdict(r) for r in results]


def send_quote(db: Session, user: User, stage_id: int, body: QuoteIn) -> tuple[Quote, QuoteVersion, list[dict], int]:
    """AC-F2-15·16·17·18·19: 열린 단계 공고에 견적서 v1을 보낸다. 같은 단계에 label 이 다른 견적서 여러 개 가능 (D-6).

    검사 순서: 업체 승인·정지(403) → 내 부문 × 열린 단계(409 STAGE_NOT_OPEN) → 공간 견적서 칸(409·400)
    → 합계(api-contract.md 3.3 순서, calc.verify_total).
    채팅방(단계 × 업체)이 없으면 만들고 QUOTE 시스템 메시지를 남긴다 (#42). 방 번호를 함께 돌려준다.
    """
    supplier = _sender(db, user)
    if not request_service.posting_visible(db, stage_id, supplier):
        raise _stage_not_open()
    stage = db.get(Stage, stage_id)  # 읽기 전용 참조 (2번 stages·performances)
    _venue_fields(stage.stage_type, body)
    calc.verify_total(body.amounts, body.total_amount, body.discount_amount)
    require_review(db, user)

    # 견적 요청(1번 #32)을 받은 업체면 그 요청에 답한 것으로 (AC-F3-18 "내가 요청한 업체")
    offer_id = offer_service.link_quote(db, stage_id=stage_id, supplier_id=supplier.id, now=datetime.now())
    quote = Quote(
        stage_id=stage_id,
        supplier_id=supplier.id,
        offer_id=offer_id,
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
    checks = _checks(db, quote, row)
    room_id = chat_service.post_quote_message(
        db, stage_id=stage_id, supplier_id=supplier.id, user_id=stage.performance.user_id, quote_version_id=row.id
    )
    # #45 사용자에게 QUOTE_RECEIVED (견적 요청을 받은 업체가 보낸 것도 이 알림 하나, notifications.md 3.3)
    perf = stage.performance
    notification.notify(
        db, perf.user_id, "QUOTE_RECEIVED", link=f"/performances/{perf.id}/compare",
        params={"company": supplier.company_name, "stage": notification.stage_label(stage.stage_type), "amount": notification.won(row.total_amount)},
        payload={"performanceId": perf.id, "stageId": stage_id, "quoteId": quote.id, "roomId": room_id},
    )
    db.commit()
    return quote, row, checks, room_id


def update_quote(db: Session, user: User, quote_id: int, body: QuoteUpdateIn) -> tuple[Quote, QuoteVersion, list[dict], int]:
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
    require_review(db, user)

    quote.current_version += 1
    quote.is_full_spec = body.includes.equipment and body.includes.engineer
    row = _version_row(quote, quote.current_version, stage.performance.current_version, body, stage.stage_type, db)
    db.add(row)
    db.flush()
    checks = _checks(db, quote, row)
    room_id = chat_service.post_quote_message(
        db, stage_id=quote.stage_id, supplier_id=supplier.id, user_id=stage.performance.user_id, quote_version_id=row.id
    )
    chat_service.notify_quote_updated(db, room_id=room_id, quote_id=quote.id, version=quote.current_version)
    # #45 채팅을 시작한 사이에만 QUOTE_UPDATED (notifications.md 3.2)
    if chat_service.chat_started(db, stage.performance_id, supplier.id):
        notification.notify(
            db, stage.performance.user_id, "QUOTE_UPDATED", link=f"/chats/{room_id}",
            params={"company": supplier.company_name, "version": quote.current_version,
                    "stage": notification.stage_label(stage.stage_type), "amount": notification.won(row.total_amount)},
            payload={"roomId": room_id, "quoteId": quote.id},
        )
    # #43에서 이 단계의 대기 중인 최종 견적 카드를 INVALIDATED 로 (AC-F3-09)
    db.commit()
    db.refresh(quote)
    return quote, row, checks, room_id


def get_quote_by_version(db: Session, user: User, version_id: int) -> Quote:
    """채팅 견적서 카드(refId = quote_version_id)의 [내역서 보기]: 버전 번호로 견적서를 찾는다. 권한은 get_quote 와 같다."""
    row = db.get(QuoteVersion, version_id)
    if row is None:
        raise not_found()
    return get_quote(db, user, row.quote_id)


def sheet_extra(db: Session, quote: Quote) -> dict:
    """내역서 머리(단계·공연·업체 상호)와 현재 버전의 자동 검사. 읽기 전용 참조 (2번 stages·performances, 1번 suppliers)."""
    stage = quote.stage
    perf = stage.performance
    supplier = db.get(Supplier, quote.supplier_id)
    current = next(v for v in quote.versions if v.version == quote.current_version)
    return {
        "stage_type": stage.stage_type,
        "performance_id": perf.id,
        "performance_title": perf.title,
        "show_date": perf.show_date,
        "company_name": supplier.company_name if supplier else "",
        "checks": _checks(db, quote, current),
    }


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


# ---------------------------------------------------------------------------
# 공고 목록·상세 (T3-01 #41, AC-F2-11·12·14, AC-F3-01·03, AC-F4-07, AC-F5-12)
# 보이는 조건은 2번 request.service(open_postings_for·posting_visible)가 정한다.
# 요청서 내용은 견적서 API처럼 2번 stages·performances 를, 닉네임은 1번 users 를 **읽기 전용으로 참조**만 한다.
# 연락처(contact_phone)·실명·이메일은 넣지 않는다 (CLAUDE.md 20).
# ---------------------------------------------------------------------------


def _user_counts(db: Session, user_ids: set[int]) -> dict[int, dict[str, Any]]:
    """사용자별 닉네임·반려 횟수·이용 횟수 (AC-F4-07). 반려·이용 횟수는 2번 약속 함수 request.rejection.user_counts (#39)."""
    if not user_ids:
        return {}
    rows = db.execute(select(User.id, User.nickname).where(User.id.in_(user_ids))).all()  # 읽기 전용 참조 (1번 users)
    counts = rejection.user_counts(db, user_ids, now=datetime.now())
    return {uid: {"nickname": nickname, **counts[uid]} for uid, nickname in rows}


def list_postings(db: Session, user: User, *, sido: str | None) -> list[dict[str, Any]]:
    """AC-F2-11·12, AC-F3-01, AC-F4-07: 내 승인 부문 × 지금 열린 단계 공고. 공연일 임박 순.

    심사 중·정지 업체는 403 대신 빈 목록이다 (AC-F2-12 "보이지 않는다").
    """
    supplier = supplier_service.get_application(db, user)
    postings = request_service.open_postings_for(db, supplier, sido=sido)
    perf_ids = {p.performance_id for p in postings}
    owners = dict(db.execute(select(Performance.id, Performance.user_id).where(Performance.id.in_(perf_ids))).all())
    users = _user_counts(db, set(owners.values()))
    return [asdict(p) | users[owners[p.performance_id]] for p in postings]


def get_posting(db: Session, user: User, stage_id: int) -> dict[str, Any]:
    """AC-F3-03, AC-F2-14, AC-F5-12: 공고 상세 + 앞 단계 확정 정보. 나에게 안 보이는 공고는 404."""
    supplier = supplier_service.get_application(db, user)
    if not request_service.posting_visible(db, stage_id, supplier):
        raise not_found()
    stage = db.get(Stage, stage_id)  # 읽기 전용 참조 (2번 stages·performances)
    perf = stage.performance
    previous = []
    for s in perf.stages:
        if s.seq >= stage.seq or s.status != "CONFIRMED" or s.confirmed_quote_version_id is None:
            continue
        version = db.get(QuoteVersion, s.confirmed_quote_version_id)
        previous.append({
            "stage_type": s.stage_type,
            "venue_snapshot": version.venue_snapshot,
            "checkin_time": version.checkin_time,
            "setup_available_time": version.setup_available_time,
            "items": version.items,  # 기본 장비
            "tech_note": version.tech_note,  # 전원 (전용 칸 없음)
        })
    return {
        "stage_id": stage.id, "performance_id": perf.id, "stage_type": stage.stage_type, "status": stage.status,
        "performance_version": perf.current_version, "title": perf.title, "show_date": perf.show_date,
        "sido": perf.sido, "sigungu": perf.sigungu, "form": perf.form, "rehearsal_start": perf.rehearsal_start,
        "show_start": perf.show_start, "show_end": perf.show_end, "audience": perf.audience, "needs": perf.needs,
        "previous_stages": previous,
    } | _user_counts(db, {perf.user_id})[perf.user_id]


# ---------------------------------------------------------------------------
# 묶음 사이 약속 — 3번 → 4번 (비교 화면 #48)
# ---------------------------------------------------------------------------


def stage_quotes_with_checks(db: Session, user: User, stage_id: int) -> list[tuple[Quote, QuoteVersion, list[dict]]]:
    """[약속 3 → 4] AC-F3-20~24: 단계의 견적서(철회 제외)마다 현재 버전과 자동 검사 결과. 보낸 순서.

    그 공연의 사용자만 본다. 없는 단계·남의 공연은 404. 검사는 견적서 응답과 같은 _checks 를 쓴다.
    """
    stage = db.get(Stage, stage_id)  # 읽기 전용 참조 (2번 stages·performances)
    if stage is None or stage.performance.user_id != user.id:
        raise not_found()
    quotes = db.scalars(
        select(Quote).where(Quote.stage_id == stage_id, Quote.status != "WITHDRAWN").order_by(Quote.id)
    ).all()
    result = []
    for quote in quotes:
        row = next(v for v in quote.versions if v.version == quote.current_version)
        result.append((quote, row, _checks(db, quote, row)))
    return result
