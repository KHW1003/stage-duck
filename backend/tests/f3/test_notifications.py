"""사이트 안 알림 (T3-05 #45, specs/notifications.md 7장 테스트 표, D-52)."""
import re
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.main import app
from app.models.notification import Notification
from app.models.supplier import Supplier
from app.notification import service as notification
from app.notification.router import get_now as notification_now
from app.offer.router import get_now as offer_now
from app.policy import service as policy
from app.request.router import get_today
from app.supplier import service as supplier_service
from tests.conftest import make_supplier, make_user
from tests.f2.test_posting import TODAY, _published
from tests.f2.test_quotes import _as, _body, _equipment_open, _stage_id, _supplier_d
from tests.f3.test_chat import _room
from tests.f5.test_order import _fixed_now, _ready  # noqa: F401 (픽스처)

API = "/api/v1"
NOW = datetime(2026, 11, 19, 10, 0)
CONTACT = re.compile(r"01[016789]-?\d{3,4}-?\d{4}|[\w.+-]+@[\w-]+\.\w+|\d{10,14}")


@pytest.fixture(autouse=True)
def _fixed_time():
    app.dependency_overrides[get_today] = lambda: TODAY
    app.dependency_overrides[offer_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_today, None)
    app.dependency_overrides.pop(offer_now, None)


def _types(db, user_id: int) -> list[str]:
    db.expire_all()
    return list(db.scalars(select(Notification.type).where(Notification.user_id == user_id).order_by(Notification.id)))


def _me(c) -> int:
    return c.get(f"{API}/me").json()["id"]


# ---------- 7장 표 ----------


def test_quote_received_goes_to_user_not_supplier_and_text_chat_makes_none(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db, start=False)
    user_id = _me(user)

    assert _types(db, user_id) == ["QUOTE_RECEIVED"]
    assert _types(db, supplier.user_id) == []
    n = db.scalar(select(Notification).where(Notification.user_id == user_id))
    assert n.title == f"{supplier.company_name}에서 견적서를 보냈습니다" and n.link == f"/performances/{perf_id}/compare"

    # 채팅 시작 → 업체에게 CHAT_STARTED 한 번 (두 번 눌러도 하나), 글 메시지는 알림 없음
    user.post(f"{API}/chat-rooms/{room_id}/start")
    user.post(f"{API}/chat-rooms/{room_id}/start")
    d.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "드럼 마이크도 돼요"})
    user.post(f"{API}/chat-rooms/{room_id}/messages", json={"type": "TEXT", "body": "좋아요"})
    assert _types(db, supplier.user_id) == ["CHAT_STARTED"]
    assert _types(db, user_id) == ["QUOTE_RECEIVED"]


def test_quote_updated_only_after_chat_started(client, db):
    user, d, room_id, perf_id, supplier = _room(client, db, start=False)
    quote_id = db.scalar(select(Notification.payload).where(Notification.type == "QUOTE_RECEIVED"))["quoteId"]
    body = {k: v for k, v in _body().items() if k != "label"}
    assert d.put(f"{API}/quotes/{quote_id}", json={**body, "version": 1}).status_code == 200
    assert _types(db, _me(user)) == ["QUOTE_RECEIVED"]
    user.post(f"{API}/chat-rooms/{room_id}/start")
    assert d.put(f"{API}/quotes/{quote_id}", json={**body, "version": 2}).status_code == 200
    assert _types(db, _me(user)) == ["QUOTE_RECEIVED", "QUOTE_UPDATED"]


def test_paid_goes_to_confirmed_suppliers_not_user(client, db, _fixed_now):  # noqa: F811
    user, perf_id, (c, d) = _ready(client, db)
    order_id = user.post(f"{API}/performances/{perf_id}/order").json()["id"]
    res = user.post(f"{API}/orders/{order_id}/payments", json={"amount": 1942500}, headers={"Idempotency-Key": "k"})
    assert res.json()["status"] == "SUCCEEDED"

    for sid in (c, d):
        assert _types(db, db.get(Supplier, sid).user_id) == ["PAID"]
    assert _types(db, _me(user)) == []


def test_third_warning_sends_warning_and_suspension(client, db):
    member = make_user(db)
    for _ in range(3):
        policy.warn(db, member.id, actor_id=None, reason="욕설")
    assert _types(db, member.id) == ["WARNING_ISSUED", "WARNING_ISSUED", "WARNING_ISSUED", "ACCOUNT_SUSPENDED"]
    titles = list(db.scalars(select(Notification.title).where(Notification.user_id == member.id).order_by(Notification.id)))
    assert titles[:3] == ["경고가 부과되었습니다 (1/3)", "경고가 부과되었습니다 (2/3)", "경고가 부과되었습니다 (3/3)"]


def test_read_ignores_other_peoples_ids_and_lists_with_unread_count(client, db):
    a, b = make_user(db), make_user(db)
    na = notification.notify(db, a.id, "INQUIRY_ANSWERED", link="/inquiries/1", params={"title": "환불 문의"})
    nb = notification.notify(db, b.id, "INQUIRY_ANSWERED", link="/inquiries/2", params={"title": "다른 문의"})
    db.commit()
    ca = _as(db, a)

    assert ca.post(f"{API}/me/notifications/read", json={"ids": [na.id, nb.id]}).status_code == 204
    db.expire_all()
    assert db.get(Notification, na.id).read_at is not None
    assert db.get(Notification, nb.id).read_at is None  # 남의 알림은 그대로
    page = ca.get(f"{API}/me/notifications").json()
    assert [(i["id"], i["read"]) for i in page["items"]] == [(na.id, True)] and page["unreadCount"] == 0
    assert _as(db, b).get(f"{API}/me/notifications/unread-count").json() == {"count": 1}


def test_mark_all_read_and_category_filter_and_paging(client, db):
    u = make_user(db)
    for i in range(22):
        notification.notify(db, u.id, "INQUIRY_ANSWERED", link=f"/inquiries/{i}", params={"title": f"문의 {i}"})
    notification.notify(db, u.id, "SUPPLIER_APPROVED", link="/supplier/profile")
    notification.notify(db, u.id, "OFFER_RECEIVED", link="/supplier/offers", params={"title": "가을밤", "date": "11월 28일"})
    db.commit()
    c = _as(db, u)
    first = c.get(f"{API}/me/notifications").json()
    assert len(first["items"]) == 20 and first["nextBefore"] is not None and first["unreadCount"] == 24
    second = c.get(f"{API}/me/notifications", params={"before": first["nextBefore"]}).json()
    assert len(second["items"]) == 4 and second["nextBefore"] is None
    offers = c.get(f"{API}/me/notifications", params={"category": "OFFER"}).json()
    assert [i["type"] for i in offers["items"]] == ["OFFER_RECEIVED"]
    assert c.post(f"{API}/me/notifications/read", json={"all": True}).status_code == 204
    assert c.get(f"{API}/me/notifications/unread-count").json() == {"count": 0}


def test_no_contacts_in_title_or_body(client, db):
    u = make_user(db)
    notification.notify(db, u.id, "COMMUNITY_COMMENT", link="/community/1",
                        params={"title": "합주실 추천", "snippet": "010-1234-5678 로 연락 주세요 a@b.com"})
    notification.notify(db, u.id, "QUOTE_RECEIVED", link="/x", params={"company": "업체 D", "stage": "장비", "amount": notification.won(1250000)})
    db.commit()
    for title, body in db.execute(select(Notification.title, Notification.body).where(Notification.user_id == u.id)):
        assert not CONTACT.search(title) and not CONTACT.search(body or ""), (title, body)
    assert db.scalar(select(Notification.body).where(Notification.type == "QUOTE_RECEIVED")) == "장비 · 1,250,000원"


def test_91_day_old_notifications_are_deleted(client, db):
    u = make_user(db)
    old = notification.notify(db, u.id, "SUPPLIER_APPROVED", link="/supplier/profile")
    old.created_at = NOW - timedelta(days=91)
    old_id = old.id
    notification.notify(db, u.id, "SUPPLIER_APPROVED", link="/supplier/profile")
    db.commit()
    app.dependency_overrides[notification_now] = lambda: NOW
    try:
        items = _as(db, u).get(f"{API}/me/notifications").json()["items"]
    finally:
        app.dependency_overrides.pop(notification_now, None)
    assert len(items) == 1
    db.expire_all()
    assert db.get(Notification, old_id) is None


# ---------- 각 묶음 연결 ----------


def test_offer_received_declined_and_expired(client, db):
    user, perf_id = _published(client, db)
    venue_stage = _stage_id(db, perf_id, "VENUE")
    a, b = (make_supplier(db, review_status="APPROVED", categories=("VENUE",)) for _ in range(2))
    oa = user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": a.id}).json()["offerId"]
    user.post(f"{API}/stages/{venue_stage}/offers", json={"supplierId": b.id})
    assert _types(db, a.user_id)[-1] == "OFFER_RECEIVED"

    _as(db, a.user).post(f"{API}/offers/{oa}/decline", json={"reason": "BUDGET"})
    app.dependency_overrides[offer_now] = lambda: NOW + timedelta(hours=49)
    user.get(f"{API}/stages/{venue_stage}/offers")
    user.get(f"{API}/stages/{venue_stage}/offers")  # 두 번 읽어도 만료 알림은 한 번
    user_types = [t for t in _types(db, _me(user)) if t.startswith("OFFER")]
    assert user_types == ["OFFER_DECLINED", "OFFER_EXPIRED"]
    bodies = list(db.scalars(select(Notification.body).where(Notification.type == "OFFER_DECLINED")))
    assert bodies == ["사유: 예산이 맞지 않아요"]


def test_posting_opened_goes_to_matching_approved_suppliers(client, db):
    venue = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    equipment = _supplier_d(db)
    pending = make_supplier(db, review_status="PENDING", categories=("VENUE",))
    user, perf_id = _published(client, db)  # 게시 = 공연장 단계 열림

    assert _types(db, venue.user_id) == ["POSTING_OPENED"]
    assert _types(db, equipment.user_id) == [] and _types(db, pending.user_id) == []
    assert _types(db, _me(user)) == []


def test_supplier_approved_and_rejected(client, db):
    s1 = make_supplier(db, review_status="PENDING")
    s2 = make_supplier(db, review_status="PENDING")
    supplier_service.approve(db, s1.id, actor_id=None)
    supplier_service.reject(db, s2.id, actor_id=None, reason="사업자등록증이 흐려요")
    assert _types(db, s1.user_id) == ["SUPPLIER_APPROVED"]
    assert _types(db, s2.user_id) == ["SUPPLIER_REJECTED"]


def test_community_comment_and_reply_but_not_to_self(client, db):
    from app.community.router import get_now as community_now

    clock = {"now": NOW}
    app.dependency_overrides[community_now] = lambda: clock["now"]
    try:
        writer, commenter, third = make_user(db), make_user(db), make_user(db)
        w, c, t = _as(db, writer), _as(db, commenter), _as(db, third)
        res = w.post(f"{API}/free-posts", json={"category": "QUESTION", "title": "합주실 추천해 주세요", "body": "광주 동구 근처"})
        assert res.status_code == 201, res.text
        post_id = res.json()["id"]

        def comment(cl, body, parent=None):
            clock["now"] += timedelta(seconds=11)
            r = cl.post(f"{API}/free-posts/{post_id}/comments", json={"body": body, "parentId": parent})
            assert r.status_code == 201, r.text
            return r.json()["id"]

        first = comment(c, "OO 합주실 좋아요")
        comment(w, "내 글에 내가 단 댓글")
        comment(t, "저도 궁금해요", first)
    finally:
        app.dependency_overrides.pop(community_now, None)

    assert _types(db, writer.id) == ["COMMUNITY_COMMENT"]  # 내가 단 댓글은 나에게 없음
    assert _types(db, commenter.id) == ["COMMUNITY_REPLY"]
    link = db.scalar(select(Notification.link).where(Notification.user_id == commenter.id))
    assert link.startswith(f"/community/{post_id}#c")
