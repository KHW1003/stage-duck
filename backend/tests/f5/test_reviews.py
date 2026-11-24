"""공연 후기·평점 (specs/reviews.md): 결제하고 끝난 공연의 주인만, 확정한 업체마다 한 번."""
from datetime import date, datetime

import pytest

from app.main import app
from app.models.request import Performance
from app.models.user import User
from app.payment.router import get_now as pay_now
from app.review.router import get_now as review_now
from app.review.router import get_today as review_today
from tests.conftest import login_as, make_user
from tests.f5.test_order import _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

SHOW = date(2026, 12, 20)
AFTER = date(2026, 12, 21)


@pytest.fixture(autouse=True)
def _review_time():
    app.dependency_overrides[review_now] = lambda: datetime(2026, 12, 21, 10, 0)
    yield
    app.dependency_overrides.pop(review_now, None)
    app.dependency_overrides.pop(review_today, None)


def _paid(client, db):
    """C·D 확정, 결제 끝. (사용자 client, 공연 id, (C, D))"""
    user, perf_id, (c, d) = _ready(client, db)
    db.get(Performance, perf_id).show_date = SHOW
    db.commit()
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    app.dependency_overrides[pay_now] = lambda: datetime(2026, 12, 1, 10, 0)
    res = user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": 1942500}, headers={"Idempotency-Key": "k"})
    assert res.json()["status"] == "SUCCEEDED"
    return user, perf_id, (c, d)


def _url(perf_id):
    return f"/api/v1/performances/{perf_id}/reviews"


def test_only_after_show_and_payment_one_per_supplier_and_shown_on_profile(client, db):
    user, perf_id, (c, d) = _paid(client, db)

    app.dependency_overrides[review_today] = lambda: SHOW  # 공연 당일: 아직
    page = user.get(_url(perf_id)).json()
    assert page["canWrite"] is False and [i["supplierId"] for i in page["items"]] == [c, d]
    stage_c = page["items"][0]["stageId"]
    res = user.post(_url(perf_id), json={"stageId": stage_c, "rating": 5, "content": "음향이 깔끔하고 친절했어요"})
    assert res.status_code == 409

    app.dependency_overrides[review_today] = lambda: AFTER
    assert user.get(_url(perf_id)).json()["canWrite"] is True
    res = user.post(_url(perf_id), json={"stageId": stage_c, "rating": 5, "content": "음향이 깔끔하고 친절했어요"})
    assert res.status_code == 201
    again = user.post(_url(perf_id), json={"stageId": stage_c, "rating": 1, "content": "두 번 쓰기 시도입니다"})
    assert again.status_code == 409 and again.json()["code"] == "ALREADY_REVIEWED"
    stage_d = user.get(_url(perf_id)).json()["items"][1]["stageId"]
    assert user.post(_url(perf_id), json={"stageId": stage_d, "rating": 4, "content": "설치가 빨라서 좋았습니다"}).status_code == 201

    prof = client.get(f"/api/v1/suppliers/{c}/reviews").json()
    assert (prof["average"], prof["count"]) == (5.0, 1)
    assert prof["distribution"] == {"5": 1, "4": 0, "3": 0, "2": 0, "1": 0}
    item = prof["items"][0]
    assert item["content"] == "음향이 깔끔하고 친절했어요" and item["showMonth"] == "2026년 12월"
    assert "email" not in item and item["nickname"]

    sums = client.get(f"/api/v1/review-summaries?ids={c},{d},999").json()
    assert sorted((s["supplierId"], s["average"], s["count"]) for s in sums) == sorted([(c, 5.0, 1), (d, 4.0, 1)])


def test_unpaid_or_others_cannot_review(client, db):
    user, perf_id, (c, d) = _ready(client, db)  # 결제 전
    app.dependency_overrides[review_today] = lambda: date(2027, 1, 1)
    page = user.get(_url(perf_id)).json()
    assert page["canWrite"] is False
    res = user.post(_url(perf_id), json={"stageId": page["items"][0]["stageId"], "rating": 5, "content": "결제 안 하고 쓰는 가짜 후기"})
    assert res.status_code == 409

    other = login_as(client, make_user(db))
    assert other.get(_url(perf_id)).status_code == 404


@pytest.mark.parametrize(
    ("rating", "content", "field"),
    [(0, "별점이 0점인 후기입니다", "rating"), (5, "짧아요", "content"), (5, "연락은 010-1234-5678 로 주세요", "content")],
)
def test_bad_reviews_are_rejected(client, db, rating, content, field):
    user, perf_id, _ = _paid(client, db)
    app.dependency_overrides[review_today] = lambda: AFTER
    stage = user.get(_url(perf_id)).json()["items"][0]["stageId"]
    res = user.post(_url(perf_id), json={"stageId": stage, "rating": rating, "content": content})
    assert res.status_code == 400 and res.json()["fieldErrors"][0]["field"] == field


def test_writer_can_delete_and_rewrite(client, db):
    user, perf_id, (c, _) = _paid(client, db)
    app.dependency_overrides[review_today] = lambda: AFTER
    stage = user.get(_url(perf_id)).json()["items"][0]["stageId"]
    rid = user.post(_url(perf_id), json={"stageId": stage, "rating": 3, "content": "보통이었어요 무난합니다"}).json()["id"]
    other = login_as(client, make_user(db))
    assert other.delete(f"/api/v1/reviews/{rid}").status_code == 404
    login_as(client, db.get(User, db.get(Performance, perf_id).user_id))
    assert client.delete(f"/api/v1/reviews/{rid}").status_code == 204
    assert client.get(f"/api/v1/suppliers/{c}/reviews").json()["count"] == 0


def test_demo_seed_has_past_reviews_for_profiles(client, db):
    from sqlalchemy import select

    from app.demo.service import seed_demo
    from app.models.supplier import Supplier

    seed_demo(db, datetime(2026, 11, 20, 9, 0))
    a = db.scalar(select(Supplier.id).where(Supplier.company_name == "업체 A"))
    prof = client.get(f"/api/v1/suppliers/{a}/reviews").json()
    assert (prof["average"], prof["count"]) == (4.5, 2)
    assert {i["nickname"] for i in prof["items"]} == {"가을소리", "북구청년밴드"}
