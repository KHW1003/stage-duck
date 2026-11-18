"""공연 요청서·순차 배정 서비스 (2번 묶음 — 해원).

지금은 다른 묶음이 부를 **약속 함수의 모양만** 있다 (roles.md 3장, 이슈 #35).
본문은 T2-04(#38)에서 채운다. 그 전까지 다른 묶음은 테스트에서 이 함수를 목업으로 바꿔 쓴다:

    monkeypatch.setattr("app.request.service.get_open_stage", lambda db, pid: OpenStage(...))

이름·인자·돌려주는 모양을 바꾸려면 쓰는 쪽과 먼저 합의한다.
"""
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.request import Performance, PerformanceVersion, Stage
from app.models.supplier import Supplier
from app.models.user import User
from app.request import calc
from app.request.schemas import PerformanceIn
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


def get_open_stage(db: Session, performance_id: int) -> OpenStage | None:
    """[약속 2 → 1·3] 공연에서 지금 열린 단계. 열린 단계가 없으면(모집 전·모두 확정·취소) None.

    쓰는 곳: 1번 직접 오퍼(그 부문 업체에게만, AC-F3-16), 3번 공고 목록·견적서 전송(AC-F2-11, F3-01).
    권한 검사는 하지 않는다 — 부르는 쪽이 이미 검사했다고 본다.
    구현: 2번 해원 — T2-04 (#38).
    """
    raise NotImplementedError("2번 묶음 T2-04(#38)에서 구현한다")


def stage_confirmed(db: Session, stage_id: int, quote_version_id: int, *, actor_id: int) -> None:
    """[약속 3 → 2] 3번의 컨펌 처리 안에서 부른다. 단계를 CONFIRMED 로 바꾸고 확정 견적서 버전을 저장한다.

    - 3번이 연 트랜잭션 안에서 실행되고 **커밋하지 않는다** (커밋은 3번이 한 번에).
    - 단계 행은 부르는 쪽이 이미 `SELECT … FOR UPDATE` 로 잠갔다고 본다 (plan.md 5.3).
    - 상태 이력(status_histories)은 이 함수가 남긴다.
    - 다음 단계는 열지 않는다 — 사용자가 [다음 단계로]를 눌러야 열린다 (D-1, AC-F3-02).
    구현: 2번 해원 — T2-04 (#38).
    """
    raise NotImplementedError("2번 묶음 T2-04(#38)에서 구현한다")


def confirmed_lines(db: Session, performance_id: int) -> list[ConfirmedLine]:
    """[약속 2·3 → 4] 확정된 단계마다 한 줄. 건너뛴 단계는 넣지 않는다. 순서는 배정 순서(공연장 → 장비 → 엔지니어).

    쓰는 곳: 4번 통합 청구서(AC-F5-03)·위약금 배분(AC-F5-08).
    금액은 확정 견적서 버전의 total_amount (견적서 금액은 3번 quote 서비스로 읽는다).
    구현: 2번 해원 — T2-04 (#38).
    """
    raise NotImplementedError("2번 묶음 T2-04(#38)에서 구현한다")


# ---------------------------------------------------------------------------
# 요청서 작성·게시 (T2-02 #36) — 사용자 본인
# ---------------------------------------------------------------------------

_ALLOWED = {
    ("DRAFT", "PUBLISHED"),
    ("PUBLISHED", "WITHDRAWN"),  # 공고 내림 (#37)
    ("ASSIGNING", "WITHDRAWN"),
}  # 배정 중 전이(ASSIGNING·AWAITING_PAYMENT)는 T2-04 에서 더한다
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

    남의 요청서는 404, DRAFT 가 아니면 409 INVALID_STATE. 반려 제한 검사(F4-05)는 T2-03 에서 더한다.
    """
    perf = _mine(db, user, performance_id)
    if (perf.status, "PUBLISHED") not in _ALLOWED:
        raise invalid_state("이미 게시한 요청서예요.")
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
    - 바뀐 것이 없으면 새 버전을 만들지 않는다.
    - 진행 중인 최종 견적 카드 무효화(CLAUDE.md 3장 6)는 3번 `invalidate_pending_cards` 가 생기면 여기서 부른다.
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
    changed = calc.changed_fields(previous.snapshot, data)
    if not changed:
        return perf

    perf.current_version += 1
    _fill(perf, body, data)
    db.add(PerformanceVersion(performance_id=perf.id, version=perf.current_version, snapshot=data, changed_fields=changed))
    for stage in db.scalars(select(Stage).where(Stage.performance_id == perf.id, Stage.status == "CONFIRMED")):
        record_transition(
            db, entity_type="stage", entity_id=stage.id, from_status="CONFIRMED", to_status="RECHECK",
            actor_user_id=user.id, reason=f"요청서 v{perf.current_version}: {', '.join(changed)}",
        )
        stage.status = "RECHECK"
    db.commit()
    db.refresh(perf)
    return perf


def withdraw(db: Session, user: User, performance_id: int) -> Performance:
    """공고 내림 (api-contract.md 3.2). 게시·배정 중일 때만. 반려 이벤트 기록(AC-F4-05)은 T2-05(#39)에서 더한다."""
    perf = _mine(db, user, performance_id)
    if (perf.status, "WITHDRAWN") not in _ALLOWED:
        raise invalid_state("게시 중인 공고만 내릴 수 있어요.")
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
