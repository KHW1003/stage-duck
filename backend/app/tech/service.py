"""기술 확인 서비스 (FR-TECH-01 · AC-F3-25).

- 볼 수 있는 사람: 공연을 올린 사용자, 그 공연에 확정된 업체. 그 밖은 404 (있는지 알리지 않는다)
- 항목을 더하는 업체(creator): 엔지니어 단계에 확정된 업체. 없으면 엔지니어 포함(includes_engineer)으로 확정된 장비 업체
- 답하는 업체: 그 항목의 담당(owner)만. 담당 업체는 이 공연에 확정된 업체여야 한다
- 사용자는 읽기만 (항목 추가·답변은 403). 자동 판정은 하지 않는다
"""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.models.tech import TechCheck
from app.models.user import User
from app.tech import calc
from app.tech.schemas import (
    OwnerOption,
    PerformanceBrief,
    SupplierBrief,
    TechAnswerIn,
    TechCheckIn,
    TechCheckListOut,
    TechCheckOut,
)


@dataclass(frozen=True)
class Party:
    """이 공연에 확정된 업체 한 곳 (단계별)."""

    supplier: Supplier
    stage_type: str
    seq: int
    quote_version: QuoteVersion


def confirmed_parties(db: Session, performance_id: int) -> list[Party]:
    rows = db.execute(
        select(Stage, QuoteVersion, Supplier)
        .join(QuoteVersion, QuoteVersion.id == Stage.confirmed_quote_version_id)
        .join(Quote, Quote.id == QuoteVersion.quote_id)
        .join(Supplier, Supplier.id == Quote.supplier_id)
        .where(Stage.performance_id == performance_id, Stage.status == "CONFIRMED")
        .order_by(Stage.seq)
    ).all()
    return [Party(supplier=s, stage_type=st.stage_type, seq=st.seq, quote_version=qv) for st, qv, s in rows]


def creator_of(parties: list[Party]) -> Supplier | None:
    """항목을 정하는 업체: 엔지니어 단계 업체, 없으면 엔지니어 포함 장비 업체."""
    for p in parties:
        if p.stage_type == "ENGINEER":
            return p.supplier
    for p in parties:
        if p.stage_type == "EQUIPMENT" and p.quote_version.includes_engineer:
            return p.supplier
    return None


@dataclass(frozen=True)
class Access:
    performance: Performance
    parties: list[Party]
    me: Supplier | None  # 업체로 볼 때 나, 사용자면 None


def _access(db: Session, user: User, performance_id: int) -> Access:
    perf = db.get(Performance, performance_id)
    if perf is None:
        raise not_found()
    parties = confirmed_parties(db, perf.id)
    if user.role == "USER" and perf.user_id == user.id:
        return Access(perf, parties, None)
    if user.role == "SUPPLIER":
        me = next((p.supplier for p in parties if p.supplier.user_id == user.id), None)
        if me is not None:
            return Access(perf, parties, me)
    raise not_found()


def _forbidden() -> AppError:
    return AppError(403, "FORBIDDEN", "업체만 기술 확인 항목을 더하거나 답할 수 있어요.")


def _owner_labels(parties: list[Party]) -> dict[int, str]:
    labels: dict[int, str] = {}
    for p in parties:  # 한 업체가 두 단계를 맡으면 앞 단계 이름
        labels.setdefault(p.supplier.id, calc.owner_label(p.supplier.company_name, p.stage_type))
    return labels


def _out(check: TechCheck, labels: dict[int, str], me: Supplier | None) -> TechCheckOut:
    return TechCheckOut(
        id=check.id,
        item=check.item,
        detail=check.detail,
        owner_supplier_id=check.owner_supplier_id,
        owner_label=labels.get(check.owner_supplier_id, "확정이 풀린 업체"),
        mine=me is not None and check.owner_supplier_id == me.id,
        answer=check.answer,
        memo=check.memo,
        answered_at=check.answered_at,
    )


def list_checks(db: Session, user: User, performance_id: int) -> TechCheckListOut:
    acc = _access(db, user, performance_id)
    creator = creator_of(acc.parties)
    labels = _owner_labels(acc.parties)
    checks = db.scalars(select(TechCheck).where(TechCheck.performance_id == performance_id).order_by(TechCheck.id)).all()
    return TechCheckListOut(
        performance=PerformanceBrief(
            id=acc.performance.id,
            title=acc.performance.title,
            show_date=acc.performance.show_date,
            status_label=calc.STATUS_LABEL.get(acc.performance.status, acc.performance.status),
        ),
        creator=SupplierBrief(supplier_id=creator.id, name=creator.company_name) if creator else None,
        can_add=creator is not None and acc.me is not None and acc.me.id == creator.id,
        owners=[OwnerOption(supplier_id=sid, label=label) for sid, label in labels.items()],
        items=[_out(c, labels, acc.me) for c in checks],
    )


def add_check(db: Session, user: User, performance_id: int, body: TechCheckIn) -> TechCheckOut:
    """AC-F3-25: 항목은 엔지니어(또는 엔지니어 포함 업체)만 정한다."""
    acc = _access(db, user, performance_id)
    if acc.me is None:
        raise _forbidden()
    creator = creator_of(acc.parties)
    if creator is None or creator.id != acc.me.id:
        raise not_found()
    errors = calc.item_errors(body.item, body.detail)
    labels = _owner_labels(acc.parties)
    if body.owner_supplier_id not in labels:
        errors.append({"field": "ownerSupplierId", "reason": "이 공연에 확정된 업체를 골라 주세요"})
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    check = TechCheck(
        performance_id=performance_id,
        item=body.item.strip(),
        detail=(body.detail or "").strip() or None,
        created_by_supplier_id=acc.me.id,
        owner_supplier_id=body.owner_supplier_id,
    )
    db.add(check)
    db.commit()
    return _out(check, labels, acc.me)


def answer_check(db: Session, user: User, check_id: int, body: TechAnswerIn, *, now: datetime) -> TechCheckOut:
    """AC-F3-25: 담당 업체만 답한다. 남의 항목·남의 공연은 404."""
    check = db.get(TechCheck, check_id)
    if check is None:
        raise not_found()
    acc = _access(db, user, check.performance_id)
    if acc.me is None:
        raise _forbidden()
    if check.owner_supplier_id != acc.me.id:
        raise not_found()
    errors = calc.answer_errors(body.answer, body.memo)
    if errors:
        raise AppError(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", errors)
    mine = next(p for p in acc.parties if p.supplier.id == acc.me.id)
    check.answer = body.answer
    check.memo = (body.memo or "").strip() or None
    check.answered_at = now
    check.target_perf_version = acc.performance.current_version
    check.target_quote_version_id = mine.quote_version.id
    db.commit()
    return _out(check, _owner_labels(acc.parties), acc.me)
