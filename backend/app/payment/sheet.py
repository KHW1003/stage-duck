"""최종 담당표 (T4-08 #53, FR-PAY-04, AC-F5-11·12). 묶음 4.

사용자와 그 공연에서 확정된 업체만 본다 (다른 업체·다른 사용자는 404). 연락처는 결제가 끝난 뒤에만 넣는다 (CLAUDE.md 20).
담당 범위·일정은 확정한 견적서 버전(스냅샷)에서 읽는다 — 업체가 나중에 정보를 바꿔도 담당표는 바뀌지 않는다.
다른 묶음 표(performances·stages·quote_versions·suppliers·users)는 읽기만 한다.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models.payment import Order
from app.models.quote import QuoteVersion
from app.models.request import Performance
from app.models.supplier import Supplier
from app.models.user import User
from app.request import service as request_service

PAID_STATUSES = ("PAID", "SETTLEMENT_SCHEDULED")
_STAGE_NAME = {"VENUE": "공간", "EQUIPMENT": "장비", "ENGINEER": "엔지니어"}


@dataclass(frozen=True)
class ScheduleItem:
    time: str  # "15:00"
    title: str
    who: str


@dataclass(frozen=True)
class ScopeLine:
    stage_type: str
    status: str  # CONFIRMED · SKIPPED · (그 밖은 아직)
    company_name: str | None
    scope: str  # 맡는 일 (견적서 항목 이름)
    amount: int | None


@dataclass(frozen=True)
class Contact:
    role: str  # USER 또는 단계 이름들
    name: str  # 사용자 닉네임 또는 상호
    real_name: str | None
    phone: str
    email: str


@dataclass(frozen=True)
class Sheet:
    performance: Performance
    paid_at: datetime | None
    schedule: list[ScheduleItem]
    lines: list[ScopeLine]
    contacts: list[Contact] = field(default_factory=list)  # 결제 전이면 빈 목록


def _hm(t: time | str | None) -> time | None:
    if t is None or isinstance(t, time):
        return t
    h, m = str(t).split(":")[:2]
    return time(int(h), int(m))


def _plus(t: time, minutes: int) -> time:
    return (datetime.combine(date.min, t) + timedelta(minutes=minutes)).time()


def build_schedule(perf: Performance, versions: dict[str, tuple[str, QuoteVersion]]) -> list[ScheduleItem]:
    """당일 일정: 입실 → 설치 → 리허설 → 공연 → 철수 → 퇴실 (FR-PAY-04). versions = {단계: (상호, 확정 견적서 버전)}."""
    items: list[tuple[time, ScheduleItem]] = []

    def add(t: time | None, title: str, who: str) -> None:
        if t is not None:
            items.append((t, ScheduleItem(t.strftime("%H:%M"), title, who)))

    if "VENUE" in versions:
        name, qv = versions["VENUE"]
        snap = qv.venue_snapshot or {}
        add(_hm(qv.checkin_time), f"{snap.get('name') or '공연장'} 입실", name)
        add(_hm(snap.get("checkoutTime")), "퇴실 마감", name)
    if "EQUIPMENT" in versions:
        name, qv = versions["EQUIPMENT"]
        start = _hm(qv.setup_start)
        add(start, "장비 설치 시작", name)
        if start and qv.setup_minutes:
            add(_plus(start, qv.setup_minutes), "장비 설치 완료", name)
        if qv.teardown_minutes:
            add(_plus(perf.show_end, qv.teardown_minutes), "철수 완료", name)
    add(perf.rehearsal_start, "리허설 · 사운드체크", "뮤지션")
    add(perf.show_start, "공연 시작", "뮤지션")
    add(perf.show_end, "공연 끝 · 철수 시작", "뮤지션")
    return [item for _, item in sorted(items, key=lambda x: x[0])]


def _scope(qv: QuoteVersion) -> str:
    names = [str(i.get("name")) for i in (qv.items or []) if i.get("name")]
    if qv.includes_engineer:
        names.append("엔지니어")
    return " · ".join(names) or "견적서 내용대로"


def get_sheet(db: Session, user: User, performance_id: int) -> Sheet:
    """AC-F5-11·12: 사용자·확정 업체만. 연락처는 결제(PAID·SETTLEMENT_SCHEDULED) 뒤에만."""
    perf = db.get(Performance, performance_id)
    if perf is None:
        raise not_found()
    lines = request_service.confirmed_lines(db, perf.id)
    supplier_ids = {line.supplier_id for line in lines}
    me_supplier = db.scalar(select(Supplier.id).where(Supplier.user_id == user.id)) if user.role == "SUPPLIER" else None
    if not ((user.role == "USER" and perf.user_id == user.id) or (me_supplier is not None and me_supplier in supplier_ids)):
        raise not_found()

    suppliers = {s.id: s for s in db.scalars(select(Supplier).where(Supplier.id.in_(supplier_ids)))}
    by_stage = {line.stage_type: line for line in lines}
    versions = {
        line.stage_type: (suppliers[line.supplier_id].company_name, db.get(QuoteVersion, line.quote_version_id))
        for line in lines
    }
    scope = []
    for s in perf.stages:
        line = by_stage.get(s.stage_type)
        if line:
            scope.append(ScopeLine(s.stage_type, s.status, suppliers[line.supplier_id].company_name,
                                   _scope(versions[s.stage_type][1]), line.amount))
        else:
            scope.append(ScopeLine(s.stage_type, s.status, None, "", None))

    order = db.scalar(select(Order).where(Order.performance_id == perf.id, Order.status.in_(PAID_STATUSES)))
    contacts: list[Contact] = []
    if order is not None:
        owner = db.get(User, perf.user_id)
        contacts.append(Contact("USER", owner.nickname or owner.name, owner.name, perf.contact_phone or owner.phone, owner.email))
        roles: dict[int, list[str]] = {}
        for line in lines:
            roles.setdefault(line.supplier_id, []).append(_STAGE_NAME[line.stage_type])
        for sid, stage_names in roles.items():
            s = suppliers[sid]
            contacts.append(Contact(" · ".join(stage_names), s.company_name, None, s.main_phone, s.user.email))
    return Sheet(perf, order.paid_at if order else None, build_schedule(perf, versions), scope, contacts)
