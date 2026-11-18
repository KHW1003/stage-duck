"""공연 요청서 API (api-contract.md 3.2). 사용자(USER) 역할만, 남의 요청서는 404."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import require_role
from app.core.db import get_db
from app.core.errors import AppError
from app.models.request import Performance
from app.models.user import User
from app.request import rejection, service
from app.request.schemas import (
    AdvanceIn,
    AdvanceOut,
    MyPerformancesOut,
    PerformanceDetailOut,
    PerformanceSummaryOut,
    PostingLimitOut,
    StageSummaryOut,
    VersionOut,
    PerformanceCreatedOut,
    PerformanceIn,
    PublishOut,
    SkipAckIn,
    StageRefOut,
)

router = APIRouter(prefix="/performances", tags=["request"])
stage_router = APIRouter(prefix="/stages", tags=["request"])
me_router = APIRouter(prefix="/me", tags=["request"])


def get_now() -> datetime:
    """지금 시각. 테스트에서 dependency_overrides 로 고정한다 (반려 제한 AC-F4-05·06)."""
    return datetime.now()


def get_today() -> date:
    """오늘 날짜 (KST 서버 시각). 테스트에서 dependency_overrides 로 고정한다 (AC-F2-06)."""
    return date.today()


@router.post("", response_model=PerformanceCreatedOut, status_code=status.HTTP_201_CREATED)
def create_performance(
    body: PerformanceIn,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
) -> PerformanceCreatedOut:
    """AC-F2-04~07·10: 요청서 작성 (DRAFT, v1)."""
    return PerformanceCreatedOut.model_validate(service.create_performance(db, user, body, today=today))


@router.post("/{performance_id}/publish", response_model=PublishOut)
def publish(
    performance_id: int,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> PublishOut:
    """AC-F2-08: 게시 → 필요한 단계만 만들고 첫 단계 OPEN. AC-F4-05: 반려 제한 중이면 403."""
    return PublishOut.model_validate(service.publish(db, user, performance_id, now=now))


@router.put("/{performance_id}", response_model=PerformanceCreatedOut)
def update_performance(
    performance_id: int,
    body: PerformanceIn,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
) -> PerformanceCreatedOut:
    """AC-F2-13: 요청서 수정 → 새 버전, 확정된 단계는 재확인 (RECHECK)."""
    return PerformanceCreatedOut.model_validate(service.update_performance(db, user, performance_id, body, today=today))


@router.post("/{performance_id}/withdraw", response_model=PerformanceCreatedOut)
def withdraw(
    performance_id: int,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> PerformanceCreatedOut:
    """공고 내림 (게시·배정 중일 때만). 견적서를 받은 공고면 반려 1회 (FR-POL-02)."""
    return PerformanceCreatedOut.model_validate(service.withdraw(db, user, performance_id, now=now))


@router.post("/{performance_id}/declare-all-secured", response_model=PublishOut)
def declare_all_secured(
    performance_id: int, body: SkipAckIn, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> PublishOut:
    """AC-F3-04: 전부 구했어요 → 남은 단계 건너뜀 + 책임 고지 동의 기록."""
    perf: Performance = service.declare_all_secured(
        db, user, performance_id, acknowledgement=body.acknowledgement, notice_version=body.notice_version,
        now=datetime.now(),
    )
    return PublishOut.model_validate(perf)


def require_idempotency_key(key: str | None = Header(default=None, alias="Idempotency-Key")) -> str:
    """결제·컨펌·다음 단계 요청은 Idempotency-Key 헤더가 필수 (api-contract.md 1장, CLAUDE.md 13)."""
    if not key:
        raise AppError(
            400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.",
            [{"field": "Idempotency-Key", "reason": "같은 요청이 두 번 반영되지 않도록 Idempotency-Key 헤더가 필요해요."}],
        )
    return key


@stage_router.post("/{stage_id}/advance", response_model=AdvanceOut)
def advance(
    stage_id: int,
    body: AdvanceIn,
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    _key: str = Depends(require_idempotency_key),
) -> AdvanceOut:
    """AC-F3-02: [다음 단계로] — 다음 단계 열기(OPEN_NEXT) 또는 건너뛰기(SKIP_NEXT)."""
    stage, nxt = service.advance(
        db, user, stage_id, action=body.action, acknowledgement=body.acknowledgement,
        notice_version=body.notice_version, now=datetime.now(),
    )
    return AdvanceOut(
        stage_id=stage.id, stage_type=stage.stage_type, status=stage.status,
        performance_status=db.get(Performance, stage.performance_id).status,
        next=StageRefOut(stage_id=nxt.id, stage_type=nxt.stage_type, status=nxt.status),
    )


def _summary_fields(view: service.PerformanceView) -> dict:
    perf = view.performance
    return dict(
        id=perf.id, title=perf.title, form=perf.form, status=perf.status, show_date=perf.show_date,
        rehearsal_start=perf.rehearsal_start, show_start=perf.show_start, show_end=perf.show_end,
        audience=perf.audience, sido=perf.sido, sigungu=perf.sigungu, current_version=perf.current_version,
        stages=[
            StageSummaryOut(id=s.id, stage_type=s.stage_type, seq=s.seq, status=s.status, quote_count=view.quote_counts.get(s.id, 0))
            for s in view.stages
        ],
        next_action=view.next_action, next_stage_id=view.next_stage_id,
    )


@router.get("", response_model=MyPerformancesOut)
def list_my_performances(
    mine: bool = Query(False),
    user: User = Depends(require_role("USER")),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
) -> MyPerformancesOut:
    """AC-F5-02: 내 공연 (진행 중·작성 중·지난 공연) + 단계 현황 + 다음 할 일. 지금은 `mine=true`만 있다."""
    if not mine:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{"field": "mine", "reason": "mine=true 로 내 공연만 볼 수 있어요."}])
    groups = service.list_mine(db, user, today=today)
    return MyPerformancesOut(
        **{name: [PerformanceSummaryOut(**_summary_fields(v)) for v in views] for name, views in groups.items()}
    )


@router.get("/{performance_id}", response_model=PerformanceDetailOut)
def get_my_performance(
    performance_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> PerformanceDetailOut:
    """AC-F5-02: 내 공연 상세 — 현재 버전 + 단계 목록. 남의 공연은 404."""
    view, snapshot = service.get_mine(db, user, performance_id)
    perf = view.performance
    return PerformanceDetailOut(
        **_summary_fields(view), lineup=snapshot.get("lineup", []), needs=perf.needs,
        has_contact_phone=bool(perf.contact_phone), published_at=perf.published_at,
    )


@router.get("/{performance_id}/versions", response_model=list[VersionOut])
def list_performance_versions(
    performance_id: int, user: User = Depends(require_role("USER")), db: Session = Depends(get_db)
) -> list[VersionOut]:
    """AC-F2-13: 버전 이력·변경 항목 (최신 먼저)."""
    return [VersionOut.model_validate(v) for v in service.list_versions(db, user, performance_id)]


@me_router.get("/posting-limit", response_model=PostingLimitOut)
def posting_limit(
    user: User = Depends(require_role("USER")), db: Session = Depends(get_db), now: datetime = Depends(get_now)
) -> PostingLimitOut:
    """AC-F4-05·06: 지금 반려 카운트(채팅 후·미응답)와 게시 제한 여부·가능 시각."""
    limit = rejection.limit_for(db, user.id, now)
    return PostingLimitOut(
        after_chat=limit.after_chat, no_chat=limit.no_chat, limited=limit.limited, available_at=limit.available_at
    )

