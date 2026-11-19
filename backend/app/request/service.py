"""공연 요청서·순차 배정 서비스 (2번 묶음 — 해원).

다른 묶음이 부르는 약속 함수(roles.md 3장)는 이 파일 위쪽에 있다. 테스트에서 목업으로 바꿔 쓸 때:

    monkeypatch.setattr("app.request.service.confirmed_lines", lambda db, pid: [ConfirmedLine(...)])

이름·인자·돌려주는 모양을 바꾸려면 쓰는 쪽과 먼저 합의한다 (tests/test_contracts.py).
"""
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.check.calc import PerformanceInput
from app.core.history import record_transition
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, PerformanceVersion, Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.request import calc, rejection
from app.request.schemas import PerformanceIn
from app.chat.service import chat_started, invalidate_pending_cards
from app.quote.service import quote_counts
from app.supplier.service import can_send_quotes

STAGE_TYPES = ("VENUE", "EQUIPMENT", "ENGINEER")  # 배정 순서 (constitution 3)


@dataclass(frozen=True)
class OpenStage:
    """공연에서 지금 열려 있는 단계 하나 (공연당 최대 1개, AC-F3-01)."""

    stage_id: int
    performance_id: int
    stage_type: str  # VENUE · EQUIPMENT · ENGINEER
    status: str  # OPEN · NEGOTIATING
    performance_version: int  # 지금 공고의 요청서 버전 (CHK-12, 견적서 based_on_perf_version)


@dataclass(frozen=True)
class ConfirmedLine:
    """확정된 단계 하나의 청구서 줄 (data-model.md order_lines). 금액은 원 단위 정수."""

    stage_id: int
    stage_type: str
    supplier_id: int
    quote_version_id: int
    amount: int


@dataclass(frozen=True)
class OpenPosting:
    """업체에게 보이는 공고 한 줄 (#37 → 3번 GET /postings). 연락처·실명은 넣지 않는다 (CLAUDE.md 20)."""

    stage_id: int
    performance_id: int
    stage_type: str  # VENUE · EQUIPMENT · ENGINEER
    status: str  # OPEN · NEGOTIATING
    performance_version: int
    title: str
    show_date: date
    sido: str
    sigungu: str


@dataclass(frozen=True)
class AfterConfirm:
    """컨펌 직후 [다음 단계로] 화면에 필요한 것 (3번 accept 응답의 next·checkoutAvailable, AC-F3-05·14)."""

    next_stage_type: str | None  # 다음 대기 단계. 없으면 None
    suggest_skip: bool  # 풀스펙 공연장을 확정했으면 장비·엔지니어 건너뛰기 제안
    checkout_available: bool  # 남은 단계가 없고 모두 확정·건너뜀이면 [통합 결제하기]


def get_open_stage(db: Session, performance_id: int) -> OpenStage | None:
    """[약속 2 → 1·3] 공연에서 지금 열린 단계. 열린 단계가 없으면(모집 전·모두 확정·취소) None.

    쓰는 곳: 1번 직접 오퍼(그 부문 업체에게만, AC-F3-16), 3번 공고 목록·견적서 전송(AC-F2-11, F3-01).
    권한 검사는 하지 않는다 — 부르는 쪽이 이미 검사했다고 본다. 내린 공고·초안이면 None.
    """
    row = db.execute(
        select(Stage, Performance)
        .join(Performance, Performance.id == Stage.performance_id)
        .where(Stage.performance_id == performance_id, Stage.status.in_(OPEN_STATUSES), Performance.status.in_(POSTED))
    ).first()
    if row is None:
        return None
    stage, perf = row
    return OpenStage(
        stage_id=stage.id, performance_id=perf.id, stage_type=stage.stage_type, status=stage.status,
        performance_version=perf.current_version,
    )


def stage_confirmed(db: Session, stage_id: int, quote_version_id: int, *, actor_id: int) -> None:
    """[약속 3 → 2] 3번의 컨펌 처리 안에서 부른다. 단계를 CONFIRMED 로 바꾸고 확정 견적서 버전을 저장한다.

    - 3번이 연 트랜잭션 안에서 실행되고 **커밋하지 않는다** (커밋은 3번이 한 번에).
    - 단계 행은 부르는 쪽이 이미 `SELECT … FOR UPDATE` 로 잠갔다고 본다 (plan.md 5.3).
    - 상태 이력(status_histories)은 이 함수가 남긴다. 재확인(RECHECK) 단계도 다시 확정할 수 있다.
    - 다음 단계는 열지 않는다 — 사용자가 [다음 단계로]를 눌러야 열린다 (D-1, AC-F3-02).
    - 이미 확정된 단계면 409 STAGE_ALREADY_CONFIRMED, 대기·건너뜀이면 409 INVALID_STATE.
    """
    stage = db.get(Stage, stage_id)
    if stage is None:
        raise not_found()
    if stage.status == "CONFIRMED":
        raise AppError(409, "STAGE_ALREADY_CONFIRMED", "이 단계는 이미 다른 견적서로 정해졌어요.")
    _move_stage(db, stage, "CONFIRMED", actor_id)
    stage.confirmed_quote_version_id = quote_version_id
    stage.confirmed_at = func.now()
    perf = db.get(Performance, stage.performance_id)
    if perf.status == "PUBLISHED":
        _move_performance(db, perf, "ASSIGNING", actor_id)
    db.flush()
    _sync_performance(db, perf, actor_id)
    db.flush()


def after_confirm(db: Session, stage_id: int, *, full_spec: bool) -> AfterConfirm:
    """[약속 2 → 3] 컨펌 직후 다음 할 일 (AC-F3-05 풀스펙 건너뛰기 제안, AC-F3-14 [통합 결제하기]).

    full_spec: 확정한 견적서가 풀스펙(장비·엔지니어 포함)인지 — 견적서는 3번 것이라 부르는 쪽이 넘긴다.
    """
    stage = db.get(Stage, stage_id)
    stages = _stages_of(db, stage.performance_id)
    remaining = [s for s in stages if s.seq > stage.seq and s.status == "WAITING"]
    done = all(s.status in DONE_STATUSES for s in stages)
    return AfterConfirm(
        next_stage_type=remaining[0].stage_type if remaining else None,
        suggest_skip=full_spec and stage.stage_type == "VENUE" and bool(remaining),
        checkout_available=not remaining and done,
    )


def is_related(db: Session, user_id: int, supplier_id: int) -> bool:
    """[약속 2 → 1] 이 사용자의 공연에 이 업체가 견적서·채팅으로 엮여 있는가 (1번 개인 프로필 열람, AC-F5-17).

    - 견적서: 사용자 공연의 어느 단계에든 이 업체가 견적서를 보냈다 (상태 상관없이)
    - 채팅: 사용자 공연의 어느 단계에서든 이 업체와 채팅이 시작됐다 (3번 chat_started)
    오퍼(1번 #32)는 offers 표가 생기면 여기에 더한다. 커밋하지 않는다.
    """
    perf_ids = list(db.scalars(select(Performance.id).where(Performance.user_id == user_id)))
    if not perf_ids:
        return False
    quoted = db.scalar(
        select(Quote.id)
        .join(Stage, Stage.id == Quote.stage_id)
        .where(Stage.performance_id.in_(perf_ids), Quote.supplier_id == supplier_id)
        .limit(1)
    )
    if quoted is not None:
        return True
    return any(chat_started(db, pid, supplier_id) for pid in perf_ids)


def performance_input(db: Session, performance_id: int) -> PerformanceInput:
    """[약속 2 → 3·4] 자동 검사(run_checks)에 넘길 요청서 값 (지금 버전). 없는 공연은 404.

    must_have: STEP2 공연장 "꼭 필요한 조건" 키 (BAND_ALLOWED 등, CHK-03)
    budgets: 단계별 예산 {"VENUE": 600000, "EQUIPMENT": ...} — 적지 않은 단계는 빠진다 (CHK-10)
    """
    perf = db.get(Performance, performance_id)
    if perf is None:
        raise not_found()
    needs = perf.needs or {}
    venue = needs.get("venue") or {}
    equipment = needs.get("equipment") or {}
    budgets = {k: v for k, v in (("VENUE", venue.get("budget")), ("EQUIPMENT", equipment.get("budget"))) if v}
    return PerformanceInput(
        version=perf.current_version,
        audience=perf.audience,
        rehearsal_start=perf.rehearsal_start,
        show_start=perf.show_start,
        show_end=perf.show_end,
        must_have=frozenset(venue.get("mustHave") or []),
        budgets=budgets,
    )


def performance_paid(db: Session, performance_id: int, *, actor_id: int | None) -> None:
    """[약속 4 → 2] 테스트 결제가 성공하면 4번 결제(payment.service)가 같은 트랜잭션 안에서 부른다. 커밋하지 않는다.

    결제 대기(AWAITING_PAYMENT) → 섭외 확정(CONFIRMED) + 상태 이력. 내 공연의 다음 할 일이 PAY → DONE 이 된다.
    이미 CONFIRMED 면 아무것도 하지 않는다 (같은 결제 결과가 두 번 와도 한 번만, AC-F5-06). 그 밖의 상태면 409 INVALID_STATE.
    """
    perf = db.get(Performance, performance_id, with_for_update=True)
    if perf is None:
        raise not_found()
    if perf.status == "CONFIRMED":
        return
    _move_performance(db, perf, "CONFIRMED", actor_id)


def confirmed_lines(db: Session, performance_id: int) -> list[ConfirmedLine]:
    """[약속 2·3 → 4] 확정된 단계마다 한 줄. 건너뛴 단계는 넣지 않는다. 순서는 배정 순서(공연장 → 장비 → 엔지니어).

    쓰는 곳: 4번 통합 청구서(AC-F5-03)·위약금 배분(AC-F5-08).
    금액은 확정 견적서 버전(stages.confirmed_quote_version_id)의 total_amount.
    재확인(RECHECK) 단계는 다시 확정하기 전까지 넣지 않는다 — 재확인 전에는 결제할 수 없다 (nextActionText RECHECK).
    """
    rows = db.execute(
        select(Stage.id, Stage.stage_type, Quote.supplier_id, QuoteVersion.id, QuoteVersion.total_amount)
        .join(QuoteVersion, QuoteVersion.id == Stage.confirmed_quote_version_id)
        .join(Quote, Quote.id == QuoteVersion.quote_id)
        .where(Stage.performance_id == performance_id, Stage.status == "CONFIRMED")
        .order_by(Stage.seq)
    ).all()
    return [
        ConfirmedLine(stage_id=sid, stage_type=stype, supplier_id=sup, quote_version_id=qv, amount=amount)
        for sid, stype, sup, qv, amount in rows
    ]


# ---------------------------------------------------------------------------
# 요청서 작성·게시 (T2-02 #36) — 사용자 본인
# ---------------------------------------------------------------------------

_ALLOWED = {
    ("DRAFT", "PUBLISHED"),
    ("PUBLISHED", "WITHDRAWN"),  # 공고 내림 (#37)
    ("ASSIGNING", "WITHDRAWN"),
    ("PUBLISHED", "ASSIGNING"),  # 첫 단계 확정 (#38)
    ("ASSIGNING", "AWAITING_PAYMENT"),  # 필요한 단계가 모두 확정·건너뜀 (#38)
    ("AWAITING_PAYMENT", "CONFIRMED"),  # 테스트 결제 성공 (4번 #51 → performance_paid)
}
_STAGE_ALLOWED = {  # data-model.md 11장 stages.status
    ("WAITING", "OPEN"),
    ("OPEN", "NEGOTIATING"),
    ("OPEN", "CONFIRMED"),
    ("NEGOTIATING", "CONFIRMED"),
    ("CONFIRMED", "RECHECK"),
    ("RECHECK", "CONFIRMED"),
    ("WAITING", "SKIPPED"),
}
DONE_STATUSES = ("CONFIRMED", "SKIPPED")
SKIP_ACK = "STAGE_SKIP_OWNED"  # 건너뛰기 책임 고지 동의 값 (api-contract.md 4.3, FR-ASSIGN-03)
EDITABLE = ("DRAFT", "PUBLISHED", "ASSIGNING", "AWAITING_PAYMENT")  # 결제(CONFIRMED) 뒤·취소·내림은 수정 불가
POSTED = ("PUBLISHED", "ASSIGNING")  # 업체에게 공고가 보이는 요청서 상태
OPEN_STATUSES = ("OPEN", "NEGOTIATING")
# 업체 부문 → 볼 수 있는 단계. 설치·철수(INSTALL)는 장비 단계 견적에 들어간다 (#37에서 정함)
CATEGORY_STAGE = {"VENUE": "VENUE", "EQUIPMENT": "EQUIPMENT", "INSTALL": "EQUIPMENT", "ENGINEER": "ENGINEER"}


def _fill(perf: Performance, body: PerformanceIn, data: dict) -> None:
    """요청서 행의 칸 = 현재 버전 값 (조회용). 버전별 원본은 performance_versions."""
    perf.title = body.title
    perf.form = body.form
    perf.show_date = body.show_date
    perf.rehearsal_start = body.rehearsal_start
    perf.show_start = body.show_start
    perf.show_end = body.show_end
    perf.audience = body.audience
    perf.sido = body.sido
    perf.sigungu = body.sigungu
    perf.contact_phone = body.contact_phone or None
    perf.needs = data["needs"]


def _move_performance(db: Session, perf: Performance, to: str, actor_id: int | None) -> None:
    if (perf.status, to) not in _ALLOWED:
        raise invalid_state()
    record_transition(
        db, entity_type="performance", entity_id=perf.id, from_status=perf.status, to_status=to, actor_user_id=actor_id
    )
    perf.status = to


def _move_stage(db: Session, stage: Stage, to: str, actor_id: int | None, reason: str | None = None) -> None:
    if (stage.status, to) not in _STAGE_ALLOWED:
        raise invalid_state()
    record_transition(
        db, entity_type="stage", entity_id=stage.id, from_status=stage.status, to_status=to,
        actor_user_id=actor_id, reason=reason,
    )
    stage.status = to


def _stages_of(db: Session, performance_id: int, *, lock: bool = False) -> list[Stage]:
    stmt = select(Stage).where(Stage.performance_id == performance_id).order_by(Stage.seq)
    return list(db.scalars(stmt.with_for_update() if lock else stmt))


def _sync_performance(db: Session, perf: Performance, actor_id: int | None) -> None:
    """필요한 단계가 모두 확정·건너뜀이면 결제 대기 (AWAITING_PAYMENT)."""
    stages = _stages_of(db, perf.id)
    if perf.status == "ASSIGNING" and stages and all(s.status in DONE_STATUSES for s in stages):
        _move_performance(db, perf, "AWAITING_PAYMENT", actor_id)


def _require_ack(acknowledgement: str | None, notice_version: str | None) -> str:
    """건너뛰기 책임 고지 동의 (FR-ASSIGN-03). 없으면 VALIDATION_FAILED. 돌려주는 값은 저장할 문구 버전."""
    if acknowledgement != SKIP_ACK or not notice_version:
        raise AppError(
            400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.",
            [{"field": "acknowledgement", "reason": "건너뛰면 그 부분의 일정·장비 책임이 사용자에게 있다는 안내에 동의해 주세요."}],
        )
    return notice_version


def _mine(db: Session, user: User, performance_id: int) -> Performance:
    """내 요청서를 잠가서 가져온다. 없거나 남의 것이면 404 (CLAUDE.md 10)."""
    perf = db.scalar(
        select(Performance)
        .where(Performance.id == performance_id, Performance.user_id == user.id)
        .with_for_update()
    )
    if perf is None:
        raise not_found()
    return perf


def create_performance(db: Session, user: User, body: PerformanceIn, *, today: date) -> Performance:
    """AC-F2-04~07·10: 규칙을 어기면 400 VALIDATION_FAILED, 맞으면 DRAFT 요청서와 v1 버전을 만든다."""
    errors = calc.performance_field_errors(body, today)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    data = body.model_dump(mode="json", by_alias=True)
    perf = Performance(user_id=user.id, status="DRAFT", current_version=1)
    _fill(perf, body, data)
    db.add(perf)
    db.flush()
    # lineup(편성)은 data-model 에 칸이 없어 버전 스냅샷에만 둔다
    db.add(PerformanceVersion(performance_id=perf.id, version=1, snapshot=data, changed_fields=[]))
    record_transition(
        db, entity_type="performance", entity_id=perf.id, from_status=None, to_status="DRAFT", actor_user_id=user.id
    )
    db.commit()
    return perf


def publish(db: Session, user: User, performance_id: int, *, now: datetime) -> Performance:
    """AC-F2-08: 게시하면 필요한 단계만 만들고 첫 단계를 연다. 장비 "이미 있어요"면 장비 단계가 없다.

    남의 요청서는 404, DRAFT 가 아니면 409 INVALID_STATE. 반려 제한 중이면 403 POSTING_RATE_LIMITED (AC-F4-05).
    """
    perf = _mine(db, user, performance_id)
    if (perf.status, "PUBLISHED") not in _ALLOWED:
        raise invalid_state("이미 게시한 요청서예요.")
    rejection.check_can_publish(db, user.id, now)
    plan = calc.stage_plan(perf.needs)
    if not plan:
        raise AppError(
            400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.",
            [{"field": "needs", "reason": "섭외가 필요한 단계를 하나 이상 골라 주세요."}],
        )

    for i, (stage_type, seq) in enumerate(plan):
        status = "OPEN" if i == 0 else "WAITING"
        stage = Stage(performance_id=perf.id, stage_type=stage_type, seq=seq, status=status,
                      opened_at=now if status == "OPEN" else None)
        db.add(stage)
        db.flush()
        record_transition(
            db, entity_type="stage", entity_id=stage.id, from_status=None, to_status=status, actor_user_id=user.id
        )
    record_transition(
        db, entity_type="performance", entity_id=perf.id, from_status=perf.status, to_status="PUBLISHED",
        actor_user_id=user.id,
    )
    perf.status = "PUBLISHED"
    perf.published_at = now
    db.commit()
    db.refresh(perf)
    return perf


def update_performance(db: Session, user: User, performance_id: int, body: PerformanceIn, *, today: date) -> Performance:
    """AC-F2-13: 고칠 때마다 새 버전(v2…)을 만들고 이전 버전은 그대로 둔다. 확정된 단계는 RECHECK (plan.md 5.3).

    - 공연 날짜를 바꿀 때만 14일 규칙을 본다. 게시 뒤에는 필요해요/이미 있어요를 바꿀 수 없다.
    - 바뀐 것이 없으면 새 버전을 만들지 않는다. contactPhone 을 안 보내면 저장된 번호를 그대로 둔다 (응답에 번호가 없어서).
    - 새 버전이 생기면 모든 단계의 대기(PENDING) 최종 견적 카드를 무효로 (CLAUDE.md 3장 6, 3번 `invalidate_pending_cards`).
    """
    perf = _mine(db, user, performance_id)
    if perf.status not in EDITABLE:
        raise invalid_state("결제했거나 내린 요청서는 고칠 수 없어요.")
    errors = calc.performance_field_errors(body, today, check_show_date=body.show_date != perf.show_date)
    if perf.status != "DRAFT":
        errors += calc.needed_change_errors(perf.needs, body)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)

    data = body.model_dump(mode="json", by_alias=True)
    previous = db.scalar(
        select(PerformanceVersion).where(
            PerformanceVersion.performance_id == perf.id, PerformanceVersion.version == perf.current_version
        )
    )
    keep_phone = "contact_phone" not in body.model_fields_set  # 수정 화면은 번호를 모르니, 안 보내면 그대로 둔다
    if keep_phone:
        data["contactPhone"] = previous.snapshot.get("contactPhone")
    changed = calc.changed_fields(previous.snapshot, data)
    if not changed:
        return perf

    perf.current_version += 1
    phone = perf.contact_phone
    _fill(perf, body, data)
    if keep_phone:
        perf.contact_phone = phone
    db.add(PerformanceVersion(performance_id=perf.id, version=perf.current_version, snapshot=data, changed_fields=changed))
    for stage in _stages_of(db, perf.id):
        invalidate_pending_cards(db, stage.id)  # 커밋하지 않는다 — 아래에서 한 번에
    for stage in db.scalars(select(Stage).where(Stage.performance_id == perf.id, Stage.status == "CONFIRMED")):
        record_transition(
            db, entity_type="stage", entity_id=stage.id, from_status="CONFIRMED", to_status="RECHECK",
            actor_user_id=user.id, reason=f"요청서 v{perf.current_version}: {', '.join(changed)}",
        )
        stage.status = "RECHECK"
    db.commit()
    db.refresh(perf)
    return perf


def withdraw(db: Session, user: User, performance_id: int, *, now: datetime) -> Performance:
    """공고 내림 (api-contract.md 3.2). 게시·배정 중일 때만. 견적서를 받은 공고였으면 반려 1회 (FR-POL-02, #39)."""
    perf = _mine(db, user, performance_id)
    if (perf.status, "WITHDRAWN") not in _ALLOWED:
        raise invalid_state("게시 중인 공고만 내릴 수 있어요.")
    rejection.record_rejection(db, perf.id, now=now)
    record_transition(
        db, entity_type="performance", entity_id=perf.id, from_status=perf.status, to_status="WITHDRAWN",
        actor_user_id=user.id,
    )
    perf.status = "WITHDRAWN"
    db.commit()
    db.refresh(perf)
    return perf


# ---------------------------------------------------------------------------
# 공고 노출 조건 (#37, AC-F2-11·12) — 3번 GET /postings 가 부른다
# ---------------------------------------------------------------------------


def _visible_stage_types(supplier: Supplier) -> set[str]:
    """승인되고 계정이 정상인 업체의 부문 → 볼 수 있는 단계 종류. 아니면 빈 집합 (AC-F2-12)."""
    if not can_send_quotes(supplier):
        return set()
    return {CATEGORY_STAGE[c.category] for c in supplier.categories}


def _posting_stmt(stage_types: set[str]):
    return (
        select(Stage, Performance)
        .join(Performance, Performance.id == Stage.performance_id)
        .where(
            Stage.status.in_(OPEN_STATUSES),
            Stage.stage_type.in_(stage_types),
            Performance.status.in_(POSTED),
        )
    )


def posting_visible(db: Session, stage_id: int, supplier: Supplier) -> bool:
    """[약속 2 → 3] 이 업체에게 이 단계 공고가 보이는가 (공고 상세 GET /postings/{stageId}). 안 보이면 3번이 404."""
    stage_types = _visible_stage_types(supplier)
    if not stage_types:
        return False
    return db.execute(_posting_stmt(stage_types).where(Stage.id == stage_id)).first() is not None


def open_postings_for(db: Session, supplier: Supplier, *, sido: str | None = None) -> list[OpenPosting]:
    """[약속 2 → 3] 이 업체에게 보이는 공고 목록 (GET /postings). 공연일 임박 순, sido 가 있으면 그 지역만.

    보이는 조건 (AC-F2-11·12, FR-REQ-03): 승인·정상 업체 × 자기 부문의 단계 × 그 단계가 지금 열림(OPEN·NEGOTIATING)
    × 요청서가 게시·배정 중. 내린 공고·초안은 안 보인다.
    """
    stage_types = _visible_stage_types(supplier)
    if not stage_types:
        return []
    stmt = _posting_stmt(stage_types).order_by(Performance.show_date, Stage.id)
    if sido:
        stmt = stmt.where(Performance.sido == sido)
    return [
        OpenPosting(
            stage_id=stage.id, performance_id=perf.id, stage_type=stage.stage_type, status=stage.status,
            performance_version=perf.current_version, title=perf.title, show_date=perf.show_date,
            sido=perf.sido, sigungu=perf.sigungu,
        )
        for stage, perf in db.execute(stmt).all()
    ]


# ---------------------------------------------------------------------------
# 순차 배정 (T2-04 #38, AC-F3-01~05) — 사용자 본인
# ---------------------------------------------------------------------------


def advance(
    db: Session, user: User, stage_id: int, *, action: str, acknowledgement: str | None, notice_version: str | None,
    now: datetime,
) -> tuple[Stage, Stage]:
    """AC-F3-02: [다음 단계로]. 지금 단계가 확정·건너뜀일 때 다음 대기 단계를 연다(OPEN_NEXT) 또는 건너뛴다(SKIP_NEXT).

    - 요청서·단계 행을 잠그고 바꾼다. 같은 요청이 다시 오면(다음 단계가 이미 그렇게 됐으면) 바꾸지 않고 지금 상태를 돌려준다.
    - 건너뛰기는 책임 고지 동의가 필요하다 (skip_ack_at·skip_ack_text_version 저장).
    - 남의 단계는 404, 다음 단계가 없거나 지금 단계가 확정 전이면 409 INVALID_STATE.
    돌려주는 값: (지금 단계, 다음 단계)
    """
    performance_id = db.scalar(select(Stage.performance_id).where(Stage.id == stage_id))
    if performance_id is None:
        raise not_found()
    perf = _mine(db, user, performance_id)
    stages = _stages_of(db, perf.id, lock=True)
    stage = next(s for s in stages if s.id == stage_id)
    following = [s for s in stages if s.seq > stage.seq]
    if not following:
        raise invalid_state("마지막 단계예요. 통합 결제로 넘어가 주세요.")
    nxt = following[0]

    if action == "OPEN_NEXT" and nxt.status not in ("WAITING", "SKIPPED"):
        return stage, nxt  # 이미 열림 — 같은 요청 반복
    if action == "SKIP_NEXT" and nxt.status == "SKIPPED":
        return stage, nxt
    if stage.status not in DONE_STATUSES:
        raise invalid_state("이 단계를 먼저 확정해 주세요.")
    if perf.status not in POSTED or nxt.status != "WAITING":
        raise invalid_state()

    if action == "SKIP_NEXT":
        version = _require_ack(acknowledgement, notice_version)
        _move_stage(db, nxt, "SKIPPED", user.id, reason="사용자가 건너뜀 (책임 고지 동의)")
        nxt.skip_ack_at = now
        nxt.skip_ack_text_version = version
    else:
        _move_stage(db, nxt, "OPEN", user.id)
        nxt.opened_at = now
    db.flush()
    _sync_performance(db, perf, user.id)
    db.commit()
    return stage, nxt


def declare_all_secured(
    db: Session, user: User, performance_id: int, *, acknowledgement: str | None, notice_version: str | None,
    now: datetime,
) -> Performance:
    """AC-F3-04: "전부 구했어요". 재확인(책임 고지) 동의 뒤 남은 대기 단계를 모두 건너뜀으로 바꾸고 동의를 기록한다.

    모집 중(OPEN·NEGOTIATING)인 단계가 있으면 409 — 모집 중 → 건너뜀 전이는 없다 (data-model.md 11장).
    """
    perf = _mine(db, user, performance_id)
    if perf.status not in POSTED:
        raise invalid_state()
    stages = _stages_of(db, perf.id, lock=True)
    if any(s.status in OPEN_STATUSES for s in stages):
        raise invalid_state("지금 모집 중인 단계를 먼저 확정해 주세요.")
    waiting = [s for s in stages if s.status == "WAITING"]
    if not waiting:
        raise invalid_state("건너뛸 단계가 없어요.")
    version = _require_ack(acknowledgement, notice_version)
    for stage in waiting:
        _move_stage(db, stage, "SKIPPED", user.id, reason="전부 구했어요 (책임 고지 동의)")
        stage.skip_ack_at = now
        stage.skip_ack_text_version = version
    db.flush()
    _sync_performance(db, perf, user.id)
    db.commit()
    db.refresh(perf)
    return perf


# ---------------------------------------------------------------------------
# 내 공연 현황 (T2-06 #40, AC-F5-02) — 사용자 본인, 읽기만
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PerformanceView:
    """내 공연 한 건: 요청서 + 단계(배정 순서) + 다음 할 일."""

    performance: Performance
    stages: list[Stage]
    next_action: str
    next_stage_id: int | None
    quote_counts: dict[int, int]  # 단계별 받은 견적서 수 (철회 제외, 3번 quote_counts)


def _view(perf: Performance, stages: list[Stage], counts: dict[int, int]) -> PerformanceView:
    action, index = calc.next_action(perf.status, [s.status for s in stages])
    return PerformanceView(perf, stages, action, stages[index].id if index is not None else None, counts)


def _owned(db: Session, user: User, performance_id: int) -> Performance:
    """읽기용 (잠그지 않음). 없거나 남의 것이면 404."""
    perf = db.scalar(select(Performance).where(Performance.id == performance_id, Performance.user_id == user.id))
    if perf is None:
        raise not_found()
    return perf


def list_mine(db: Session, user: User, *, today: date) -> dict[str, list[PerformanceView]]:
    """AC-F5-02: 내 공연을 진행 중·작성 중·지난 공연으로 나눠 공연일 순으로. 단계와 다음 할 일 포함."""
    perfs = list(db.scalars(select(Performance).where(Performance.user_id == user.id).order_by(Performance.show_date, Performance.id)))
    stages: dict[int, list[Stage]] = {p.id: [] for p in perfs}
    if perfs:
        for stage in db.scalars(select(Stage).where(Stage.performance_id.in_(stages)).order_by(Stage.seq)):
            stages[stage.performance_id].append(stage)
    counts = quote_counts(db, [s.id for ss in stages.values() for s in ss])  # 쿼리 한 번
    groups: dict[str, list[PerformanceView]] = {"active": [], "draft": [], "past": []}
    for perf in perfs:
        groups[calc.performance_group(perf.status, perf.show_date, today)].append(_view(perf, stages[perf.id], counts))
    return groups


def get_mine(db: Session, user: User, performance_id: int) -> tuple[PerformanceView, dict]:
    """내 공연 상세: (현재 상태, 현재 버전 스냅샷). 스냅샷에서 편성(lineup)을 읽는다."""
    perf = _owned(db, user, performance_id)
    snapshot = db.scalar(
        select(PerformanceVersion.snapshot).where(
            PerformanceVersion.performance_id == perf.id, PerformanceVersion.version == perf.current_version
        )
    )
    stages = _stages_of(db, perf.id)
    return _view(perf, stages, quote_counts(db, [s.id for s in stages])), snapshot or {}


def list_versions(db: Session, user: User, performance_id: int) -> list[PerformanceVersion]:
    """AC-F2-13: 버전 이력 (최신 먼저)."""
    perf = _owned(db, user, performance_id)
    return list(
        db.scalars(
            select(PerformanceVersion)
            .where(PerformanceVersion.performance_id == perf.id)
            .order_by(PerformanceVersion.version.desc())
        )
    )
