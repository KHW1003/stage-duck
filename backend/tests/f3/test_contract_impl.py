"""2번 약속 함수 본문 (roles.md 3장): confirmed_lines (→ 4번 청구서·위약금), is_related (→ 1번 개인 프로필 AC-F5-17).

컨펌은 3번 흐름이라 단계를 직접 CONFIRMED 로 바꿔 흉내 낸다.
"""
from datetime import date, datetime

import pytest
from sqlalchemy import select

from app.main import app
from app.models.chat import ChatRoom
from app.models.quote import Quote, QuoteVersion
from app.models.request import Stage
from app.request import service
from app.request.router import get_today
from tests.conftest import login_as, make_supplier, make_user

BODY = {
    "title": "가을밤 밴드 공연", "form": "BAND", "showDate": "2026-11-28",
    "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
    "audience": 80, "sido": "광주광역시", "sigungu": "동구",
    "needs": {"venue": {"needed": True}, "equipment": {"needed": True}, "engineer": {"needed": True, "tasks": ["FOH"]}},
}


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: date(2026, 11, 12)
    yield
    app.dependency_overrides.pop(get_today, None)


def _show(client, db):
    user = make_user(db)
    perf_id = login_as(client, user).post("/api/v1/performances", json=BODY).json()["id"]
    assert client.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200
    db.rollback()
    stages = {s.stage_type: s for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}
    return user, perf_id, stages


def _quote(db, stage, supplier, total, *, versions=1, status="SENT") -> QuoteVersion:
    quote = Quote(stage_id=stage.id, supplier_id=supplier.id, label="기본형", current_version=versions, status=status)
    db.add(quote)
    db.flush()
    last = None
    for v in range(1, versions + 1):
        amount = total if v == versions else total + 100000
        last = QuoteVersion(
            quote_id=quote.id, version=v, based_on_perf_version=1, staff=[], items=[],
            amount_items=amount, amount_transport=0, amount_install=0, amount_labor=0, amount_etc=0, total_amount=amount,
        )
        db.add(last)
        db.flush()
    db.commit()
    return last


def _confirm(db, stage, qv):
    stage.status = "CONFIRMED"
    stage.confirmed_quote_version_id = qv.id
    db.commit()


# ---- confirmed_lines ----------------------------------------------------------------------


def test_confirmed_lines_in_stage_order_skipping_skipped(client, db):
    _, perf_id, st = _show(client, db)
    c = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    d = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    venue_qv = _quote(db, st["VENUE"], c, 500000)
    gear_qv = _quote(db, st["EQUIPMENT"], d, 1350000, versions=2)  # v2 가 확정 (v1 은 1,450,000)
    _quote(db, st["EQUIPMENT"], make_supplier(db, review_status="APPROVED"), 980000, status="CLOSED")  # 자동 마감 견적은 빠짐
    _confirm(db, st["EQUIPMENT"], gear_qv)
    _confirm(db, st["VENUE"], venue_qv)
    st["ENGINEER"].status = "SKIPPED"
    db.commit()

    lines = service.confirmed_lines(db, perf_id)

    assert [(l.stage_type, l.supplier_id, l.quote_version_id, l.amount) for l in lines] == [
        ("VENUE", c.id, venue_qv.id, 500000),
        ("EQUIPMENT", d.id, gear_qv.id, 1350000),
    ]
    assert sum(l.amount for l in lines) == 1850000  # 시연_예시값.md 업체 금액 합


def test_confirmed_lines_excludes_recheck_and_open(client, db):
    """요청서가 바뀌어 재확인(RECHECK)이 필요한 단계는 다시 확정하기 전까지 청구서에 넣지 않는다."""
    _, perf_id, st = _show(client, db)
    qv = _quote(db, st["VENUE"], make_supplier(db, review_status="APPROVED"), 500000)
    _confirm(db, st["VENUE"], qv)
    st["VENUE"].status = "RECHECK"
    db.commit()

    assert service.confirmed_lines(db, perf_id) == []


def test_confirmed_lines_unknown_performance_is_empty(db):
    assert service.confirmed_lines(db, 999999) == []


# ---- is_related (AC-F5-17) ----------------------------------------------------------------


def test_is_related_by_quote_or_chat_only_for_own_shows(client, db):
    user, perf_id, st = _show(client, db)
    quoted = make_supplier(db, review_status="APPROVED")
    chatted = make_supplier(db, review_status="APPROVED")
    stranger = make_supplier(db, review_status="APPROVED")
    _quote(db, st["VENUE"], quoted, 500000)
    db.add(ChatRoom(stage_id=st["VENUE"].id, supplier_id=chatted.id, user_id=user.id, started_at=datetime(2026, 11, 12, 10)))
    db.commit()
    other_user = make_user(db)

    assert service.is_related(db, user.id, quoted.id) is True
    assert service.is_related(db, user.id, chatted.id) is True
    assert service.is_related(db, user.id, stranger.id) is False
    assert service.is_related(db, other_user.id, quoted.id) is False  # 남의 공연에 엮인 업체


def test_chat_room_not_started_is_not_related(client, db):
    """업체가 견적서도 안 보냈고 채팅도 시작 전(started_at 없음)이면 엮이지 않았다."""
    user, _, st = _show(client, db)
    s = make_supplier(db, review_status="APPROVED")
    db.add(ChatRoom(stage_id=st["VENUE"].id, supplier_id=s.id, user_id=user.id, started_at=None))
    db.commit()

    assert service.is_related(db, user.id, s.id) is False
