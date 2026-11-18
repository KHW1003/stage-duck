"""순차 배정 (T2-04 #38, AC-F3-01~05·14, api-contract.md 4.3 advance·declare-all-secured).

컨펌은 3번(채은)의 accept 가 `stage_confirmed()`를 부르는 흐름이라, 여기서는 그 함수를 직접 불러 흉내 낸다.
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.main import app
from app.models.history import StatusHistory
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.request import service
from app.request.router import get_today
from tests.conftest import login_as, make_supplier, make_user

KEY = {"Idempotency-Key": "k-1"}
ACK = {"acknowledgement": "STAGE_SKIP_OWNED", "noticeVersion": "1"}


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: date(2026, 11, 12)
    yield
    app.dependency_overrides.pop(get_today, None)


def _body() -> dict:
    return {
        "title": "가을밤 밴드 공연", "form": "BAND", "showDate": "2026-11-28",
        "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
        "audience": 80, "sido": "광주광역시", "sigungu": "동구",
        "needs": {
            "venue": {"needed": True}, "equipment": {"needed": True},
            "engineer": {"needed": True, "tasks": ["FOH"]},
        },
    }


def _published(client, db):
    user = login_as(client, make_user(db))
    perf_id = user.post("/api/v1/performances", json=_body()).json()["id"]
    assert user.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200
    return user, perf_id


def _stage(db, perf_id, stage_type) -> Stage:
    db.expire_all()
    return db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == stage_type))


def _quote_version(db, stage_id) -> int:
    """확정할 견적서 버전 (stages.confirmed_quote_version_id 는 quote_versions FK — MariaDB 에서 검사)."""
    supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE", "EQUIPMENT", "ENGINEER"))
    quote = Quote(stage_id=stage_id, supplier_id=supplier.id, label="기본형", current_version=1, status="SENT")
    db.add(quote)
    db.flush()
    version = QuoteVersion(
        quote_id=quote.id, version=1, based_on_perf_version=1, staff=[], items=[],
        amount_items=500000, amount_transport=0, amount_install=0, amount_labor=0, amount_etc=0, total_amount=500000,
    )
    db.add(version)
    db.commit()
    return version.id


def _confirm(db, perf_id, stage_type) -> tuple[int, int]:
    """3번 accept 흉내: 단계 잠그고 stage_confirmed → 커밋. (단계 id, 견적서 버전 id)"""
    stage_id = db.scalar(select(Stage.id).where(Stage.performance_id == perf_id, Stage.stage_type == stage_type))
    version_id = _quote_version(db, stage_id)
    stage = db.scalar(select(Stage).where(Stage.id == stage_id).with_for_update())
    service.stage_confirmed(db, stage.id, version_id, actor_id=1)
    db.commit()
    return stage.id, version_id


def _advance(user, stage_id, action="OPEN_NEXT", headers=KEY, **extra):
    return user.post(f"/api/v1/stages/{stage_id}/advance", json={"action": action, **extra}, headers=headers)


def _statuses(db, perf_id) -> dict[str, str]:
    db.expire_all()
    return {s.stage_type: s.status for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}


def _perf_status(db, perf_id) -> str:
    db.expire_all()
    return db.get(Performance, perf_id).status


# ---- AC-F3-01·02 --------------------------------------------------------------------------


def test_ac_f3_01_equipment_cannot_see_before_venue_confirmed(client, db):
    _, perf_id = _published(client, db)
    equipment = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))

    assert service.open_postings_for(db, equipment) == []
    open_stage = service.get_open_stage(db, perf_id)
    assert (open_stage.stage_type, open_stage.status, open_stage.performance_version) == ("VENUE", "OPEN", 1)


def test_ac_f3_02_advance_opens_equipment(client, db):
    user, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")
    assert _perf_status(db, perf_id) == "ASSIGNING"
    assert service.get_open_stage(db, perf_id) is None  # 확정됐지만 아직 다음 단계는 안 열림 (D-1)

    res = _advance(user, venue_id)

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["stageType"], out["status"], out["next"]["stageType"], out["next"]["status"]) == ("VENUE", "CONFIRMED", "EQUIPMENT", "OPEN")
    equipment = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    assert [p.stage_type for p in service.open_postings_for(db, equipment)] == ["EQUIPMENT"]
    assert service.open_postings_for(db, make_supplier(db, review_status="APPROVED", categories=("VENUE",))) == []
    assert service.get_open_stage(db, perf_id).stage_type == "EQUIPMENT"
    assert _stage(db, perf_id, "EQUIPMENT").opened_at is not None


def test_same_advance_twice_applies_once(client, db):
    user, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")

    first = _advance(user, venue_id)
    second = _advance(user, venue_id)

    assert (second.status_code, second.json()) == (200, first.json())
    opened = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "stage", StatusHistory.to_status == "OPEN")).all()
    assert len(opened) == 2  # 게시 때 공연장 1번 + 장비 1번


def test_advance_requires_idempotency_key(client, db):
    user, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")

    res = _advance(user, venue_id, headers={})

    assert res.status_code == 400
    assert "Idempotency-Key" in [e["field"] for e in res.json()["fieldErrors"]]
    assert _statuses(db, perf_id)["EQUIPMENT"] == "WAITING"


def test_advance_before_confirm_is_invalid_state(client, db):
    user, perf_id = _published(client, db)

    res = _advance(user, _stage(db, perf_id, "VENUE").id)

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


def test_advance_from_last_stage_is_invalid_state(client, db):
    user, perf_id = _published(client, db)
    _advance(user, _confirm(db, perf_id, "VENUE")[0])
    _advance(user, _confirm(db, perf_id, "EQUIPMENT")[0])

    res = _advance(user, _confirm(db, perf_id, "ENGINEER")[0])

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


def test_skip_next_needs_acknowledgement_then_opens_following(client, db):
    user, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")

    no_ack = _advance(user, venue_id, action="SKIP_NEXT")
    assert no_ack.status_code == 400
    assert "acknowledgement" in [e["field"] for e in no_ack.json()["fieldErrors"]]

    res = _advance(user, venue_id, action="SKIP_NEXT", **ACK)
    assert res.json()["next"] == {"stageId": _stage(db, perf_id, "EQUIPMENT").id, "stageType": "EQUIPMENT", "status": "SKIPPED"}
    equipment = _stage(db, perf_id, "EQUIPMENT")
    assert equipment.skip_ack_at is not None and equipment.skip_ack_text_version == "1"

    _advance(user, equipment.id, headers={"Idempotency-Key": "k-2"})
    assert _statuses(db, perf_id) == {"VENUE": "CONFIRMED", "EQUIPMENT": "SKIPPED", "ENGINEER": "OPEN"}


def test_advance_other_user_or_supplier_not_found(client, db):
    _, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")

    assert _advance(login_as(client, make_user(db)), venue_id).status_code == 404
    supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    assert _advance(login_as(client, supplier.user), venue_id).status_code == 404
    assert _statuses(db, perf_id)["EQUIPMENT"] == "WAITING"


# ---- AC-F3-04 전부 구했어요 ----------------------------------------------------------------


def test_ac_f3_04_declare_all_secured_skips_rest_with_acknowledgement(client, db):
    user, perf_id = _published(client, db)
    _confirm(db, perf_id, "VENUE")

    res = user.post(f"/api/v1/performances/{perf_id}/declare-all-secured", json=ACK)

    assert res.status_code == 200, res.text
    assert _statuses(db, perf_id) == {"VENUE": "CONFIRMED", "EQUIPMENT": "SKIPPED", "ENGINEER": "SKIPPED"}
    for stage_type in ("EQUIPMENT", "ENGINEER"):
        stage = _stage(db, perf_id, stage_type)
        assert stage.skip_ack_at is not None and stage.skip_ack_text_version == "1"
    assert _perf_status(db, perf_id) == "AWAITING_PAYMENT"


def test_declare_all_secured_needs_acknowledgement(client, db):
    user, perf_id = _published(client, db)
    _confirm(db, perf_id, "VENUE")

    res = user.post(f"/api/v1/performances/{perf_id}/declare-all-secured", json={})

    assert res.status_code == 400
    assert _statuses(db, perf_id)["EQUIPMENT"] == "WAITING"


def test_declare_all_secured_while_recruiting_is_invalid_state(client, db):
    user, perf_id = _published(client, db)  # 공연장 모집 중

    res = user.post(f"/api/v1/performances/{perf_id}/declare-all-secured", json=ACK)

    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


def test_declare_all_secured_other_user_not_found(client, db):
    _, perf_id = _published(client, db)
    _confirm(db, perf_id, "VENUE")

    res = login_as(client, make_user(db)).post(f"/api/v1/performances/{perf_id}/declare-all-secured", json=ACK)

    assert res.status_code == 404


# ---- AC-F3-05·14 컨펌 뒤 다음 할 일 (→ 3번 accept 응답) ------------------------------------


@pytest.mark.parametrize("full_spec, suggest", [(True, True), (False, False)])
def test_ac_f3_05_full_spec_venue_suggests_skip(client, db, full_spec, suggest):
    _, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")

    step = service.after_confirm(db, venue_id, full_spec=full_spec)

    assert (step.next_stage_type, step.suggest_skip, step.checkout_available) == ("EQUIPMENT", suggest, False)


def test_ac_f3_14_last_stage_confirmed_offers_checkout(client, db):
    user, perf_id = _published(client, db)
    _advance(user, _confirm(db, perf_id, "VENUE")[0])
    _advance(user, _confirm(db, perf_id, "EQUIPMENT")[0])
    engineer_id, _ = _confirm(db, perf_id, "ENGINEER")

    step = service.after_confirm(db, engineer_id, full_spec=False)

    assert (step.next_stage_type, step.suggest_skip, step.checkout_available) == (None, False, True)
    assert _perf_status(db, perf_id) == "AWAITING_PAYMENT"


# ---- 약속 함수 ----------------------------------------------------------------------------


def test_stage_confirmed_saves_quote_version_and_history(client, db):
    _, perf_id = _published(client, db)
    venue_id, version_id = _confirm(db, perf_id, "VENUE")

    stage = _stage(db, perf_id, "VENUE")
    assert (stage.status, stage.confirmed_quote_version_id) == ("CONFIRMED", version_id)
    assert stage.confirmed_at is not None
    history = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "stage", StatusHistory.entity_id == venue_id)).all()
    assert [(h.from_status, h.to_status) for h in history][-1] == ("OPEN", "CONFIRMED")


def test_stage_confirmed_twice_is_already_confirmed(client, db):
    _, perf_id = _published(client, db)
    venue_id, _ = _confirm(db, perf_id, "VENUE")

    other_version = _quote_version(db, venue_id)
    with pytest.raises(AppError) as err:
        service.stage_confirmed(db, venue_id, other_version, actor_id=1)
    db.rollback()

    assert (err.value.status, err.value.code) == (409, "STAGE_ALREADY_CONFIRMED")


def test_recheck_stage_can_be_confirmed_again(client, db):
    user, perf_id = _published(client, db)
    _confirm(db, perf_id, "VENUE")
    body = _body() | {"rehearsalStart": "16:00"}
    assert user.put(f"/api/v1/performances/{perf_id}", json=body).status_code == 200
    assert _statuses(db, perf_id)["VENUE"] == "RECHECK"

    _, version_id = _confirm(db, perf_id, "VENUE")

    assert (_stage(db, perf_id, "VENUE").status, _stage(db, perf_id, "VENUE").confirmed_quote_version_id) == ("CONFIRMED", version_id)


def test_get_open_stage_none_after_withdraw(client, db):
    user, perf_id = _published(client, db)
    user.post(f"/api/v1/performances/{perf_id}/withdraw")

    assert service.get_open_stage(db, perf_id) is None
