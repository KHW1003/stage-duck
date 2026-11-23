"""최종 견적(견적 내역 확인 카드)·확정 (T3-03 #43, api-contract.md 4.3, AC-F3-09~14, plan.md 5.3).

흐름: 업체 [최종 견적 보내기] → 채팅방에 카드(지금 버전 고정, 48시간) → 사용자 [내역서 보기](열람 기록) → [확정하기]
- 확정 검사 순서 (api-contract.md 4.3): 카드 상태·만료 422 CONFIRM_REQUEST_EXPIRED → 열람 422 DETAIL_NOT_VIEWED
  → 버전 422 CONFIRM_REQUEST_STALE → 자동 검사 409 CHECK_CONFLICT → 단계 409 STAGE_ALREADY_CONFIRMED
- 동시 확정(AC-F3-11): 단계 행을 SELECT … FOR UPDATE 로 먼저 잠그고, 2번 stage_confirmed 가 이미 확정이면 409.
- 확정하면: 견적서 CONFIRMED, 같은 단계 다른 견적서 CLOSED + 그 방들에 안내 + NOT_SELECTED 알림, 반려 이벤트 없음 (AC-F3-13)
- 같은 카드로 다시 확정하면(새로고침·두 번 클릭) 처음 결과를 그대로 돌려준다 (Idempotency-Key 필수).
- 견적서를 고치면 대기 카드는 INVALIDATED (AC-F3-09, quote.update_quote 가 invalidate_for_quote 를 부른다).
- 48시간이 지나면 EXPIRED — 스케줄러 대신 카드를 읽거나 보낼 때 바꾼다. 업체는 새 카드를 보낼 수 있다 (AC-F3-12).
  결제 마감(4번 payment_deadline)이 생기면 만료 = min(48시간, 결제 마감) 으로 바꾼다.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.chat import realtime
from app.chat import service as chat_service
from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.chat import ChatMessage, ChatRoom, ConfirmRequest
from app.models.quote import Quote, QuoteVersion
from app.models.request import Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.notification import service as notification
from app.request import service as request_service

CARD_HOURS = 48
OPEN_STAGE = ("OPEN", "NEGOTIATING", "RECHECK")


@dataclass
class CardView:
    card: ConfirmRequest
    room: ChatRoom
    quote: Quote
    version: QuoteVersion
    stage: Stage


def _expire(db: Session, card: ConfirmRequest, now: datetime) -> None:
    if card.status == "PENDING" and card.expires_at <= now:
        card.status = "EXPIRED"
        room = db.get(ChatRoom, card.room_id)
        supplier_user_id = db.scalar(select(Supplier.user_id).where(Supplier.id == room.supplier_id))
        stage = db.get(Stage, room.stage_id)
        notification.notify(
            db, supplier_user_id, "CONFIRM_EXPIRED", link=f"/chats/{room.id}",
            params={"title": stage.performance.title}, payload={"roomId": room.id, "confirmRequestId": card.id},
        )
        _publish(db, room, card)


def _publish(db: Session, room: ChatRoom, card: ConfirmRequest) -> None:
    """api-contract.md 7장 confirm.updated. 커밋되면 두 참여자에게."""
    realtime.publish_after_commit(
        db, chat_service._participant_ids(db, room), "confirm.updated",
        {"roomId": room.id, "confirmRequestId": card.id, "status": card.status},
    )


def _system(db: Session, room: ChatRoom, type_: str, ref_id: int | None, body: str | None = None) -> None:
    message = ChatMessage(room_id=room.id, sender_user_id=None, type=type_, ref_id=ref_id, body=body)
    db.add(message)
    chat_service._publish_message(db, room, message)


def _load(db: Session, user: User, card_id: int, *, lock: bool = False) -> CardView:
    """그 방 참여자(사용자·업체)만. 아니면 404."""
    card = db.get(ConfirmRequest, card_id, with_for_update=lock)
    if card is None:
        raise not_found()
    room = db.get(ChatRoom, card.room_id)
    supplier_user_id = db.scalar(select(Supplier.user_id).where(Supplier.id == room.supplier_id))
    if user.id not in (room.user_id, supplier_user_id):
        raise not_found()
    version = db.get(QuoteVersion, card.quote_version_id)
    quote = db.get(Quote, version.quote_id)
    return CardView(card, room, quote, version, db.get(Stage, room.stage_id))


# ---------------------------------------------------------------------------
# 업체: 최종 견적 보내기
# ---------------------------------------------------------------------------


def send_card(db: Session, user: User, quote_id: int, *, now: datetime) -> CardView:
    """POST /quotes/{id}/confirm-requests: 내 보낸(SENT) 견적서의 지금 버전으로 카드. 방당 대기 카드 1장."""
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    quote = db.get(Quote, quote_id)
    if supplier is None or quote is None or quote.supplier_id != supplier.id:
        raise not_found()
    if quote.status != "SENT":
        raise invalid_state("보낸 상태의 견적서만 최종 견적으로 보낼 수 있어요.")
    stage = quote.stage
    if stage.status not in OPEN_STAGE:
        raise invalid_state("이 단계는 지금 확정할 수 없어요. 공고 상태를 확인해 주세요.")
    room = db.scalar(
        select(ChatRoom).where(ChatRoom.stage_id == stage.id, ChatRoom.supplier_id == supplier.id).with_for_update()
    )
    if room is None:
        raise not_found()
    if room.started_at is None:
        raise AppError(403, "CHAT_NOT_STARTED", "사용자가 채팅을 시작하면 최종 견적을 보낼 수 있어요.")
    for old in db.scalars(select(ConfirmRequest).where(ConfirmRequest.room_id == room.id, ConfirmRequest.status == "PENDING")):
        _expire(db, old, now)
        if old.status == "PENDING":
            raise invalid_state("이미 보낸 최종 견적이 있어요. 사용자가 답하거나 기한이 지나면 다시 보낼 수 있어요.")
    version = db.scalar(select(QuoteVersion).where(QuoteVersion.quote_id == quote.id, QuoteVersion.version == quote.current_version))
    expires = now + timedelta(hours=CARD_HOURS)
    from app.payment.deadline import deadline_for  # 4번 결제 마감 (D-57): 카드 만료 = min(48시간, 결제 마감)

    deadline = deadline_for(db, stage.performance)
    if deadline is not None:
        expires = min(expires, deadline)
    card = ConfirmRequest(room_id=room.id, quote_version_id=version.id, status="PENDING", expires_at=expires, created_at=now)
    db.add(card)
    db.flush()
    _system(db, room, "CONFIRM_REQUEST", card.id)
    notification.notify(
        db, room.user_id, "CONFIRM_REQUESTED", link=f"/chats/{room.id}",
        params={"company": supplier.company_name, "stage": notification.stage_label(stage.stage_type),
                "version": version.version, "amount": notification.won(version.total_amount)},
        payload={"roomId": room.id, "confirmRequestId": card.id},
    )
    db.commit()
    return _load(db, user, card.id)


# ---------------------------------------------------------------------------
# 사용자·업체: 카드 보기 / 사용자: 열람·확정·다시 조율
# ---------------------------------------------------------------------------


def get_card(db: Session, user: User, card_id: int, *, now: datetime) -> CardView:
    view = _load(db, user, card_id)
    if view.card.status == "PENDING" and view.card.expires_at <= now:
        _expire(db, view.card, now)
        db.commit()
    return view


def _for_user(db: Session, user: User, card_id: int, *, lock: bool = False) -> CardView:
    view = _load(db, user, card_id, lock=lock)
    if view.room.user_id != user.id:
        raise not_found()
    return view


def mark_viewed(db: Session, user: User, card_id: int, *, now: datetime) -> CardView:
    """POST /confirm-requests/{id}/view: 내역서를 열면 기록 (AC-F3-10). 처음 연 시각 그대로."""
    view = _for_user(db, user, card_id)
    if view.card.viewed_at is None:
        view.card.viewed_at = now
        _publish(db, view.room, view.card)
        db.commit()
    return view


@dataclass
class AcceptResult:
    view: CardView
    after: request_service.AfterConfirm


def accept(db: Session, user: User, card_id: int, *, now: datetime) -> AcceptResult:
    """POST /confirm-requests/{id}/accept: 확정 (AC-F3-10·11·13·14). 단계 행을 먼저 잠근다 (plan.md 5.3)."""
    view = _for_user(db, user, card_id)
    db.rollback()  # 잠금은 새 트랜잭션에서 단계 → 카드 순서로
    stage = db.get(Stage, view.stage.id, with_for_update=True, populate_existing=True)
    view = _for_user(db, user, card_id, lock=True)
    card = view.card
    db.refresh(card)

    if card.status == "CONFIRMED":  # 같은 카드 다시 = 처음 결과 (멱등)
        return AcceptResult(view, request_service.after_confirm(db, stage.id, full_spec=view.quote.is_full_spec))
    _expire(db, card, now)
    if card.status in ("EXPIRED", "RENEGOTIATE"):
        db.commit()
        raise AppError(422, "CONFIRM_REQUEST_EXPIRED", "기한이 지났거나 다시 조율하기로 한 최종 견적이에요. 업체에게 새 최종 견적을 요청해 주세요.")
    if card.viewed_at is None:
        raise AppError(422, "DETAIL_NOT_VIEWED", "내역서를 먼저 열어 확인해 주세요.")
    if card.status == "INVALIDATED" or view.version.version != view.quote.current_version:
        raise AppError(422, "CONFIRM_REQUEST_STALE", "새 견적이 있어요. 업체에게 새 견적 내역 확인을 요청해 주세요.")
    from app.quote.service import _checks  # 3번 안 (순환 import 피함)

    if any(c["result"] == "CONFLICT" for c in _checks(db, view.quote, view.version)):
        raise AppError(409, "CHECK_CONFLICT", "자동 검사에서 충돌이 있어 확정할 수 없어요. 업체와 조율해 주세요.")
    if stage.status == "CONFIRMED":
        raise AppError(409, "STAGE_ALREADY_CONFIRMED", "이 단계는 이미 다른 견적서로 정해졌어요.")

    request_service.stage_confirmed(db, stage.id, view.version.id, actor_id=user.id)
    card.status, card.decided_at = "CONFIRMED", now
    _move_quote(db, view.quote, "CONFIRMED", user.id)
    _system(db, view.room, "CONFIRMED", card.id)
    _publish(db, view.room, card)
    supplier = db.get(Supplier, view.quote.supplier_id)
    perf = stage.performance
    notification.notify(
        db, supplier.user_id, "CONFIRMED", link="/supplier/reservations",
        params={"title": perf.title, "amount": notification.won(view.version.total_amount)},
        payload={"performanceId": perf.id, "stageId": stage.id},
    )
    _close_others(db, stage, view.quote, user.id, now)
    _notify_deadline(db, stage, now)
    db.commit()
    return AcceptResult(_load(db, user, card_id), request_service.after_confirm(db, stage.id, full_spec=view.quote.is_full_spec))


def _notify_deadline(db: Session, stage: Stage, now: datetime) -> None:
    """D-57: 처음 컨펌이면 결제 마감 안내, 모든 단계가 끝나 결제할 수 있게 됐으면 결제 안내 (사용자에게)."""
    from app.payment import deadline as dl

    db.flush()
    perf = stage.performance
    db.refresh(perf)
    deadline = dl.deadline_for(db, perf)
    if deadline is None:
        return
    confirmed = [s for s in perf.stages if s.confirmed_at is not None]
    if len(confirmed) == 1:
        notification.notify(db, perf.user_id, "PAYMENT_DEADLINE_SET", link=f"/performances/{perf.id}",
                            params={"deadline": dl.label(deadline), "title": perf.title}, payload={"performanceId": perf.id})
    if request_service.after_confirm(db, stage.id, full_spec=False).checkout_available:
        total = sum(ln.amount for ln in request_service.confirmed_lines(db, perf.id))
        notification.notify(db, perf.user_id, "PAYMENT_READY", link=f"/performances/{perf.id}/order",
                            params={"deadline": dl.label(deadline), "title": perf.title, "amount": notification.won(total)},
                            payload={"performanceId": perf.id})


def _move_quote(db: Session, quote: Quote, to: str, actor_id: int) -> None:
    record_transition(db, entity_type="quote", entity_id=quote.id, from_status=quote.status, to_status=to, actor_user_id=actor_id)
    quote.status = to


def _close_others(db: Session, stage: Stage, chosen: Quote, actor_id: int, now: datetime) -> None:
    """AC-F3-13: 같은 단계의 다른 견적서는 CLOSED, 그 방들에 안내 + NOT_SELECTED. 반려 이벤트는 남기지 않는다."""
    perf = stage.performance
    told: set[int] = set()
    for quote in db.scalars(select(Quote).where(Quote.stage_id == stage.id, Quote.id != chosen.id, Quote.status == "SENT")):
        _move_quote(db, quote, "CLOSED", actor_id)
        if quote.supplier_id in told or quote.supplier_id == chosen.supplier_id:
            continue
        told.add(quote.supplier_id)
        room = db.scalar(select(ChatRoom).where(ChatRoom.stage_id == stage.id, ChatRoom.supplier_id == quote.supplier_id))
        if room is not None:
            for card in db.scalars(select(ConfirmRequest).where(ConfirmRequest.room_id == room.id, ConfirmRequest.status == "PENDING")):
                card.status, card.decided_at = "INVALIDATED", now
                _publish(db, room, card)
            _system(db, room, "NOTICE", None, "사용자가 다른 업체와 진행하기로 했어요. 이 공고의 견적서는 마감됐어요.")
        supplier_user_id = db.scalar(select(Supplier.user_id).where(Supplier.id == quote.supplier_id))
        notification.notify(
            db, supplier_user_id, "NOT_SELECTED", link=f"/supplier/postings/{stage.id}",
            params={"title": perf.title}, payload={"stageId": stage.id},
        )


def renegotiate(db: Session, user: User, card_id: int, *, now: datetime) -> CardView:
    """POST /confirm-requests/{id}/renegotiate: [다시 조율] — 카드를 닫고 업체가 고쳐서 다시 보내게 한다."""
    view = _for_user(db, user, card_id, lock=True)
    _expire(db, view.card, now)
    if view.card.status != "PENDING":
        db.commit()
        raise invalid_state("이미 답했거나 기한이 지난 최종 견적이에요.")
    view.card.status, view.card.decided_at = "RENEGOTIATE", now
    _system(db, view.room, "NOTICE", None, "사용자가 다시 조율하고 싶어 해요. 견적서를 고쳐 새 최종 견적을 보내 주세요.")
    _publish(db, view.room, view.card)
    db.commit()
    return view


def invalidate_for_quote(db: Session, quote_id: int, *, now: datetime) -> None:
    """[3번 안] 견적서를 고치면(update_quote) 그 견적서의 대기 카드를 INVALIDATED 로 (AC-F3-09). 커밋하지 않는다."""
    cards = db.scalars(
        select(ConfirmRequest).join(QuoteVersion, QuoteVersion.id == ConfirmRequest.quote_version_id)
        .where(QuoteVersion.quote_id == quote_id, ConfirmRequest.status == "PENDING")
    ).all()
    for card in cards:
        card.status, card.decided_at = "INVALIDATED", now
        _publish(db, db.get(ChatRoom, card.room_id), card)


def invalidate_for_stage(db: Session, stage_id: int, *, now: datetime) -> None:
    """[3번 안] 요청서가 새 버전이 되면 그 단계의 대기 카드를 INVALIDATED 로 (AC-F2-13, CLAUDE.md 3장 6). 커밋하지 않는다.

    now 는 decided_at 기록용이다. 만료·비교에는 쓰지 않는다 (EXPIRED 등 PENDING 이 아닌 카드는 그대로).
    """
    cards = db.scalars(
        select(ConfirmRequest).join(ChatRoom, ChatRoom.id == ConfirmRequest.room_id)
        .where(ChatRoom.stage_id == stage_id, ConfirmRequest.status == "PENDING")
    ).all()
    for card in cards:
        card.status, card.decided_at = "INVALIDATED", now
        _publish(db, db.get(ChatRoom, card.room_id), card)
