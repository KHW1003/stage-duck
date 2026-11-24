"""기술 확인 (T4-04 #49, FR-TECH-01 · AC-F3-25, api-contract.md 4.5, data-model.md tech_checks).

공연: 공연장 = 업체 C, 장비 = 업체 D(엔지니어 포함), 엔지니어 = 건너뜀. 항목을 정하는 업체는 D.
컨펌은 3번 흐름이라 여기서는 단계를 직접 CONFIRMED 로 바꿔 흉내 낸다.
"""
from datetime import date

import pytest
from sqlalchemy import select

from app.main import app
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.tech import TechCheck
from app.request.router import get_today
from tests.conftest import login_as, make_supplier, make_user


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: date(2026, 11, 12)
    yield
    app.dependency_overrides.pop(get_today, None)


BODY = {
    "title": "가을밤 밴드 공연", "form": "BAND", "showDate": "2026-11-28",
    "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
    "audience": 80, "sido": "광주광역시", "sigungu": "동구",
    "needs": {"venue": {"needed": True}, "equipment": {"needed": True}, "engineer": {"needed": True, "tasks": ["FOH"]}},
}


def _confirm(db, stage: Stage, supplier, *, includes_engineer=False) -> int:
    quote = Quote(stage_id=stage.id, supplier_id=supplier.id, label="기본형", current_version=1, status="CONFIRMED")
    db.add(quote)
    db.flush()
    qv = QuoteVersion(
        quote_id=quote.id, version=1, based_on_perf_version=1, staff=[], items=[], includes_engineer=includes_engineer,
        amount_items=500000, amount_transport=0, amount_install=0, amount_labor=0, amount_etc=0, total_amount=500000,
    )
    db.add(qv)
    db.flush()
    stage.status = "CONFIRMED"
    stage.confirmed_quote_version_id = qv.id
    db.commit()
    return qv.id


@pytest.fixture
def show(client, db):
    """(사용자 클라이언트 만들기, 공연 id, 업체 C, 업체 D, 사용자)"""
    host = make_user(db)
    perf_id = login_as(client, host).post("/api/v1/performances", json=BODY).json()["id"]
    assert client.post(f"/api/v1/performances/{perf_id}/publish").status_code == 200
    client.cookies.clear()
    db.rollback()
    stages = {s.stage_type: s for s in db.scalars(select(Stage).where(Stage.performance_id == perf_id))}
    c = make_supplier(db, review_status="APPROVED", categories=("VENUE",), company_name="업체 C")
    d = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "ENGINEER"), company_name="업체 D")
    _confirm(db, stages["VENUE"], c)
    _confirm(db, stages["EQUIPMENT"], d, includes_engineer=True)
    stages["ENGINEER"].status = "SKIPPED"
    db.get(Performance, perf_id).status = "AWAITING_PAYMENT"
    db.commit()
    return perf_id, c, d, host


def _as(client, who):
    client.cookies.clear()
    return login_as(client, who if hasattr(who, "role") else who.user)


def _add(client, d, perf_id, item, owner, detail=""):
    return _as(client, d).post(
        f"/api/v1/performances/{perf_id}/tech-checks", json={"item": item, "detail": detail, "ownerSupplierId": owner.id}
    )


def test_ac_f3_25_each_supplier_answers_only_own_items(client, db, show):
    perf_id, c, d, _ = show
    plug = _add(client, d, perf_id, "무대 콘센트 위치·구 수", c, "믹서와 스피커 전원을 따로")
    foh = _add(client, d, perf_id, "FOH 믹서 자리", d)
    assert plug.status_code == 201, plug.text
    assert foh.status_code == 201, foh.text

    as_c = _as(client, c)
    assert as_c.put(f"/api/v1/tech-checks/{plug.json()['id']}", json={"answer": "OK", "memo": "왼쪽 4구"}).status_code == 200
    assert as_c.put(f"/api/v1/tech-checks/{foh.json()['id']}", json={"answer": "OK", "memo": "남의 항목"}).status_code == 404

    as_d = _as(client, d)
    res = as_d.put(f"/api/v1/tech-checks/{foh.json()['id']}", json={"answer": "CONDITIONAL", "memo": "테이블 1개 필요"})
    assert res.status_code == 200, res.text
    assert res.json()["answer"] == "CONDITIONAL"

    db.rollback()
    saved = db.get(TechCheck, plug.json()["id"])
    assert (saved.answer, saved.memo, saved.answered_at is not None, saved.target_perf_version) == ("OK", "왼쪽 4구", True, 1)
    assert saved.target_quote_version_id is not None


def test_list_shows_mine_and_owner_labels(client, db, show):
    perf_id, c, d, _ = show
    _add(client, d, perf_id, "장비 반입 동선", c)
    _add(client, d, perf_id, "드럼 마이킹 수", d)

    body = _as(client, c).get(f"/api/v1/performances/{perf_id}/tech-checks").json()

    assert body["performance"] == {"id": perf_id, "title": "가을밤 밴드 공연", "showDate": "2026-11-28", "statusLabel": "결제 대기"}
    assert body["creator"] == {"supplierId": d.id, "name": "업체 D"}
    assert body["canAdd"] is False
    assert body["owners"] == [{"supplierId": c.id, "label": "업체 C (공간)"}, {"supplierId": d.id, "label": "업체 D (장비)"}]
    assert [(i["item"], i["ownerLabel"], i["mine"], i["answer"]) for i in body["items"]] == [
        ("장비 반입 동선", "업체 C (공간)", True, "UNCONFIRMED"),
        ("드럼 마이킹 수", "업체 D (장비)", False, "UNCONFIRMED"),
    ]
    assert _as(client, d).get(f"/api/v1/performances/{perf_id}/tech-checks").json()["canAdd"] is True


def test_host_can_read_but_not_add_or_answer(client, db, show):
    perf_id, c, d, host = show
    item = _add(client, d, perf_id, "음량 제한 시각", c).json()

    as_host = _as(client, host)
    body = as_host.get(f"/api/v1/performances/{perf_id}/tech-checks").json()
    assert body["canAdd"] is False and body["items"][0]["mine"] is False
    assert as_host.post(f"/api/v1/performances/{perf_id}/tech-checks", json={"item": "x", "ownerSupplierId": c.id}).status_code == 403
    assert as_host.put(f"/api/v1/tech-checks/{item['id']}", json={"answer": "OK"}).status_code == 403


def test_outsiders_get_404(client, db, show):
    perf_id, c, d, _ = show
    item = _add(client, d, perf_id, "전원", c).json()
    stranger = make_supplier(db, review_status="APPROVED")
    other_user = make_user(db)

    assert _as(client, stranger).get(f"/api/v1/performances/{perf_id}/tech-checks").status_code == 404
    assert _as(client, stranger).put(f"/api/v1/tech-checks/{item['id']}", json={"answer": "OK"}).status_code == 404
    assert _as(client, other_user).get(f"/api/v1/performances/{perf_id}/tech-checks").status_code == 404


def test_only_creator_adds_and_owner_must_be_on_this_show(client, db, show):
    perf_id, c, d, _ = show
    stranger = make_supplier(db, review_status="APPROVED")

    assert _add(client, c, perf_id, "공간이 정한 항목", c).status_code == 404  # 항목은 엔지니어(포함) 업체만
    res = _add(client, d, perf_id, "남의 공연 업체", stranger)
    assert res.status_code == 400
    assert res.json()["fieldErrors"][0]["field"] == "ownerSupplierId"


@pytest.mark.parametrize(
    ("payload", "field"),
    [({"item": "  "}, "item"), ({"item": "가" * 201}, "item"), ({"item": "전원", "detail": "가" * 201}, "detail")],
)
def test_item_validation(client, db, show, payload, field):
    perf_id, c, d, _ = show
    res = _as(client, d).post(f"/api/v1/performances/{perf_id}/tech-checks", json={**payload, "ownerSupplierId": c.id})
    assert res.status_code == 400
    assert [e["field"] for e in res.json()["fieldErrors"]] == [field]


@pytest.mark.parametrize(("payload", "field"), [({"answer": "MAYBE"}, "answer"), ({"answer": "OK", "memo": "가" * 501}, "memo")])
def test_answer_validation(client, db, show, payload, field):
    perf_id, c, d, _ = show
    item = _add(client, d, perf_id, "전원", c).json()
    res = _as(client, c).put(f"/api/v1/tech-checks/{item['id']}", json=payload)
    assert res.status_code == 400
    assert field in [e["field"] for e in res.json()["fieldErrors"]]


def test_engineer_stage_supplier_is_creator_when_confirmed(client, db, show):
    perf_id, c, d, _ = show
    stage = db.scalar(select(Stage).where(Stage.performance_id == perf_id, Stage.stage_type == "ENGINEER"))
    e = make_supplier(db, review_status="APPROVED", categories=("ENGINEER",), company_name="업체 E")
    _confirm(db, stage, e)

    body = _as(client, e).get(f"/api/v1/performances/{perf_id}/tech-checks").json()
    assert body["creator"]["name"] == "업체 E" and body["canAdd"] is True
    assert _add(client, d, perf_id, "장비 업체가 정한 항목", c).status_code == 404


def test_no_engineer_means_nobody_adds(client, db, show):
    perf_id, c, d, _ = show
    qv = db.scalar(
        select(QuoteVersion).join(Stage, Stage.confirmed_quote_version_id == QuoteVersion.id).where(
            Stage.performance_id == perf_id, Stage.stage_type == "EQUIPMENT"
        )
    )
    qv.includes_engineer = False
    db.commit()

    body = _as(client, d).get(f"/api/v1/performances/{perf_id}/tech-checks").json()
    assert body["creator"] is None and body["canAdd"] is False
