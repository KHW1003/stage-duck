"""권한 공통 검사 — AC-F1-13·14·15 (FR-AUTH-07, 이슈 #34).

남의 리소스는 존재 여부도 알 수 없게 404 NOT_FOUND 로 답한다 (CLAUDE.md 10).
업체 상태 문제(심사 중)만 403 SUPPLIER_NOT_APPROVED 다.
공연·견적서·채팅방은 2·3번 묶음 API 를 HTTP 로만 부른다. 준비 함수는 기존 테스트(f2·f3)의 것을 쓴다.
"""
import pytest
from sqlalchemy import func, select

from app.main import app
from app.models.quote import Quote
from app.request.router import get_today
from tests.conftest import make_supplier, make_user
from tests.f2.test_posting import TODAY
from tests.f2.test_quotes import _as, _body, _equipment_open, _supplier_d
from tests.f3.test_chat import _room

API = "/api/v1"
MISSING_ID = 999999


@pytest.fixture(autouse=True)
def _fixed_today():
    app.dependency_overrides[get_today] = lambda: TODAY
    yield
    app.dependency_overrides.pop(get_today, None)


def _same_as_missing(res, missing) -> None:
    """남의 것과 없는 것이 같은 응답이어야 한다 — 상태·코드·문구까지 (traceId 만 다르다)."""
    assert res.status_code == missing.status_code == 404, res.text
    got, want = res.json(), missing.json()
    assert (got["code"], got["message"], got["fieldErrors"]) == (want["code"], want["message"], want["fieldErrors"])
    assert got["code"] == "NOT_FOUND"


# ---------- AC-F1-13 다른 사용자의 공연·채팅방 → 찾을 수 없음 ----------


def test_ac_f1_13_other_users_performance_is_404(client, db):
    owner, perf_id, _ = _equipment_open(client, db)
    other = _as(db, make_user(db))

    assert owner.get(f"{API}/performances/{perf_id}").status_code == 200
    for path in (f"/performances/{perf_id}", f"/performances/{perf_id}/versions"):
        _same_as_missing(other.get(API + path), other.get(API + path.replace(str(perf_id), str(MISSING_ID))))


def test_ac_f1_13_supplier_cannot_open_users_performance(client, db):
    _, perf_id, _ = _equipment_open(client, db)
    supplier = _as(db, _supplier_d(db).user)

    res = supplier.get(f"{API}/performances/{perf_id}")

    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"


def test_ac_f1_13_other_users_chat_room_is_404(client, db):
    owner, _, room_id, _, _ = _room(client, db)
    other = _as(db, make_user(db))

    assert owner.get(f"{API}/chat-rooms/{room_id}/messages").status_code == 200
    _same_as_missing(
        other.get(f"{API}/chat-rooms/{room_id}/messages"),
        other.get(f"{API}/chat-rooms/{MISSING_ID}/messages"),
    )


def test_ac_f1_13_not_logged_in_is_401(client, db):
    _, perf_id, _ = _equipment_open(client, db)
    guest = _as(db, make_user(db))
    guest.cookies.clear()

    res = guest.get(f"{API}/performances/{perf_id}")

    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHENTICATED"


# ---------- AC-F1-14 업체 D 가 업체 E 의 견적서 → 거부 ----------


def test_ac_f1_14_other_suppliers_quote_is_404(client, db):
    _, _, stage_id = _equipment_open(client, db)
    supplier_e = _as(db, _supplier_d(db).user)
    supplier_d = _as(db, _supplier_d(db).user)
    quote_id = supplier_e.post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]

    assert supplier_e.get(f"{API}/quotes/{quote_id}").status_code == 200
    _same_as_missing(supplier_d.get(f"{API}/quotes/{quote_id}"), supplier_d.get(f"{API}/quotes/{MISSING_ID}"))


def test_ac_f1_14_other_supplier_cannot_change_quote(client, db):
    _, _, stage_id = _equipment_open(client, db)
    supplier_e = _as(db, _supplier_d(db).user)
    supplier_d = _as(db, _supplier_d(db).user)
    quote_id = supplier_e.post(f"{API}/stages/{stage_id}/quotes", json=_body()).json()["quoteId"]
    versions_before = supplier_e.get(f"{API}/quotes/{quote_id}").json()

    body = _body(version=1)
    body.pop("label")  # 고치기 요청은 label 을 받지 않는다 (QuoteUpdateIn)
    res = supplier_d.put(f"{API}/quotes/{quote_id}", json=body)

    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"
    assert supplier_e.get(f"{API}/quotes/{quote_id}").json() == versions_before  # 바뀌지 않았다


# ---------- AC-F1-15 심사 중 업체가 견적서 전송을 직접 보내면 → 거부 ----------


@pytest.mark.parametrize("review_status", ["PENDING", "REJECTED"])
def test_ac_f1_15_not_approved_supplier_cannot_send_quote(client, db, review_status):
    _, _, stage_id = _equipment_open(client, db)
    pending = _as(db, make_supplier(db, review_status=review_status, categories=("EQUIPMENT",)).user)

    res = pending.post(f"{API}/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 403
    assert res.json()["code"] == "SUPPLIER_NOT_APPROVED"
    assert db.scalar(select(func.count()).select_from(Quote)) == 0  # 저장되지 않았다


def test_ac_f1_15_approved_supplier_can_send_same_request(client, db):
    """같은 요청을 승인 업체가 보내면 201 — 위 거부가 요청 모양 때문이 아니라 심사 상태 때문인지 확인."""
    _, _, stage_id = _equipment_open(client, db)
    approved = _as(db, _supplier_d(db).user)

    res = approved.post(f"{API}/stages/{stage_id}/quotes", json=_body())

    assert res.status_code == 201, res.text
