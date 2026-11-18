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
from app.models.user import User
from app.request import calc
from app.request.schemas import PerformanceIn

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

_ALLOWED = {("DRAFT", "PUBLISHED")}  # 게시 이후 전이는 T2-03·T2-04 에서 더한다


def create_performance(db: Session, user: User, body: PerformanceIn, *, today: date) -> Performance:
    """AC-F2-04~07·10: 규칙을 어기면 400 VALIDATION_FAILED, 맞으면 DRAFT 요청서와 v1 버전을 만든다."""
    errors = calc.performance_field_errors(body, today)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    data = body.model_dump(mode="json", by_alias=True)
    perf = Performance(
        user_id=user.id, status="DRAFT", current_version=1, title=body.title, form=body.form,
        show_date=body.show_date, rehearsal_start=body.rehearsal_start, show_start=body.show_start,
        show_end=body.show_end, audience=body.audience, sido=body.sido, sigungu=body.sigungu,
        contact_phone=body.contact_phone or None, needs=data["needs"],
    )
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
    perf = db.scalar(
        select(Performance)
        .where(Performance.id == performance_id, Performance.user_id == user.id)
        .with_for_update()
    )
    if perf is None:
        raise not_found()
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
