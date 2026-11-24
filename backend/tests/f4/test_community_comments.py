"""커뮤니티 댓글·답글·도움 돼요·저장·블라인드 (T2-08 #101, AC-F4-14·15·17, FR-COMM-03·04)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.community import service
from app.community.router import get_now
from app.main import app
from app.models.community import FreeComment, FreePost
from app.models.user import User
from tests.conftest import login_as, make_supplier, make_user

NOW = datetime(2026, 11, 18, 14, 0)


@pytest.fixture
def clock():
    state = {"now": NOW}
    app.dependency_overrides[get_now] = lambda: state["now"]
    yield state
    app.dependency_overrides.pop(get_now, None)


def _post(client, clock) -> int:
    res = client.post("/api/v1/free-posts", json={"category": "QUESTION", "title": "리허설 질문", "body": "몇 시간 전에?"})
    assert res.status_code == 201, res.text
    clock["now"] += timedelta(minutes=2)
    return res.json()["id"]


def _comment(client, clock, post_id, body="17시 추천해요", parent_id=None):
    res = client.post(f"/api/v1/free-posts/{post_id}/comments", json={"body": body, "parentId": parent_id})
    clock["now"] += timedelta(seconds=11)
    return res


def _detail(client, post_id) -> dict:
    res = client.get(f"/api/v1/free-posts/{post_id}")
    assert res.status_code == 200, res.text
    return res.json()


# ---- AC-F4-14 댓글·답글 ---------------------------------------------------------------------


def test_ac_f4_14_supplier_comment_shown_as_company_and_author_can_reply(client, db, clock):
    owner = make_user(db, nickname="광주밴드")
    post_id = _post(login_as(client, owner), clock)
    supplier = make_supplier(db, review_status="APPROVED", company_name="업체 D")
    comment = _comment(login_as(client, supplier.user), clock, post_id, body="입실 15시면 17시 리허설 괜찮아요")
    assert comment.status_code == 201, comment.text

    reply = _comment(login_as(client, owner), clock, post_id, body="감사해요!", parent_id=comment.json()["id"])
    assert reply.status_code == 201

    out = _detail(client, post_id)
    assert out["commentCount"] == 2
    [top] = out["comments"]
    assert (top["author"]["name"], top["author"]["kind"], top["isPostAuthor"]) == ("업체 D", "SUPPLIER", False)
    assert [(r["body"], r["author"]["name"], r["isPostAuthor"]) for r in top["replies"]] == [("감사해요!", "광주밴드", True)]


def test_ac_f4_14_reply_to_reply_rejected(client, db, clock):
    user = login_as(client, make_user(db))
    post_id = _post(user, clock)
    first = _comment(user, clock, post_id).json()["id"]
    reply = _comment(user, clock, post_id, parent_id=first).json()["id"]

    res = _comment(user, clock, post_id, parent_id=reply)

    assert (res.status_code, res.json()["code"]) == (400, "VALIDATION_FAILED")
    assert "parentId" in [e["field"] for e in res.json()["fieldErrors"]]


def test_comment_rules_length_rate_and_contact(client, db, clock):
    user = login_as(client, make_user(db))
    post_id = _post(user, clock)

    assert _comment(user, clock, post_id, body="").status_code == 400
    assert _comment(user, clock, post_id, body="가" * 501).status_code == 400
    assert _comment(user, clock, post_id, body="연락 주세요 010-1234-5678").json()["contactWarning"] is True

    clock["now"] -= timedelta(seconds=2)  # 방금 쓴 댓글에서 9초 뒤
    res = user.post(f"/api/v1/free-posts/{post_id}/comments", json={"body": "또", "parentId": None})
    assert (res.status_code, res.json()["code"]) == (403, "POSTING_RATE_LIMITED")


def test_visitor_cannot_comment(client, db, clock):
    post_id = _post(login_as(client, make_user(db)), clock)
    client.cookies.clear()

    assert _comment(client, clock, post_id).status_code in (401, 403)


def test_delete_comment_leaves_placeholder_and_replies(client, db, clock):
    user = login_as(client, make_user(db))
    post_id = _post(user, clock)
    first = _comment(user, clock, post_id).json()["id"]
    _comment(user, clock, post_id, body="답글", parent_id=first)

    assert user.delete(f"/api/v1/free-comments/{first}").status_code == 204

    [top] = _detail(client, post_id)["comments"]
    assert (top["status"], top["body"]) == ("DELETED", None)
    assert [r["body"] for r in top["replies"]] == ["답글"]


def test_others_cannot_delete_comment(client, db, clock):
    user = login_as(client, make_user(db))
    post_id = _post(user, clock)
    first = _comment(user, clock, post_id).json()["id"]

    assert login_as(client, make_user(db)).delete(f"/api/v1/free-comments/{first}").status_code == 404


# ---- AC-F4-15 신고 → 블라인드 + 경고 ----------------------------------------------------------


def test_ac_f4_15_blinded_comment_hidden_and_author_warned(client, db, clock):
    post_id = _post(login_as(client, make_user(db)), clock)
    writer = make_user(db, nickname="광고왕")
    comment_id = _comment(login_as(client, writer), clock, post_id, body="우리 업체 연락 주세요").json()["id"]
    reporter = login_as(client, make_user(db))
    assert reporter.post("/api/v1/reports", json={"targetType": "FREE_COMMENT", "targetId": comment_id, "reason": "홍보"}).status_code in (200, 201)

    service.blind_comment(db, comment_id, actor_id=None, reason="업체 홍보")

    [top] = _detail(reporter, post_id)["comments"]
    assert (top["status"], top["body"], top["blindReason"]) == ("BLINDED", None, None)
    mine = _detail(login_as(client, writer), post_id)["comments"][0]
    assert (mine["body"], mine["blindReason"]) == ("우리 업체 연락 주세요", "업체 홍보")
    db.expire_all()
    assert db.get(User, writer.id).warning_count == 1


def test_blind_post_warns_author(client, db, clock):
    writer = make_user(db)
    post_id = _post(login_as(client, writer), clock)

    service.blind_post(db, post_id, actor_id=None, reason="외부 거래 유도")

    db.expire_all()
    assert (db.get(FreePost, post_id).status, db.get(FreePost, post_id).blind_reason) == ("BLINDED", "외부 거래 유도")
    assert db.get(User, writer.id).warning_count == 1


def test_blind_needs_reason(client, db, clock):
    post_id = _post(login_as(client, make_user(db)), clock)
    from app.core.errors import AppError

    with pytest.raises(AppError):
        service.blind_post(db, post_id, actor_id=None, reason="")


# ---- AC-F4-17 도움 돼요·저장 -----------------------------------------------------------------


def test_ac_f4_17_helpful_once_then_cancel(client, db, clock):
    post_id = _post(login_as(client, make_user(db)), clock)
    fan = login_as(client, make_user(db))
    target = {"targetType": "POST", "targetId": post_id}

    assert fan.put("/api/v1/free-helpfuls", json=target).json()["helpfulCount"] == 1
    assert fan.put("/api/v1/free-helpfuls", json=target).json()["helpfulCount"] == 1  # 두 번 눌러도 한 번
    assert _detail(fan, post_id)["myHelpful"] is True
    assert fan.request("DELETE", "/api/v1/free-helpfuls", json=target).json()["helpfulCount"] == 0
    assert _detail(fan, post_id)["myHelpful"] is False


def test_helpful_on_comment(client, db, clock):
    user = login_as(client, make_user(db))
    post_id = _post(user, clock)
    comment_id = _comment(user, clock, post_id).json()["id"]
    fan = login_as(client, make_user(db))

    assert fan.put("/api/v1/free-helpfuls", json={"targetType": "COMMENT", "targetId": comment_id}).json()["helpfulCount"] == 1
    top = _detail(fan, post_id)["comments"][0]
    assert (top["helpfulCount"], top["myHelpful"]) == (1, True)


def test_helpful_unknown_target_not_found(client, db, clock):
    fan = login_as(client, make_user(db))
    assert fan.put("/api/v1/free-helpfuls", json={"targetType": "POST", "targetId": 999}).status_code == 404


def test_ac_f4_17_bookmark_and_list(client, db, clock):
    writer = login_as(client, make_user(db))
    first = _post(writer, clock)
    second = _post(writer, clock)
    me = login_as(client, make_user(db))

    assert me.put(f"/api/v1/free-posts/{first}/bookmark").status_code == 204
    assert me.put(f"/api/v1/free-posts/{second}/bookmark").status_code == 204
    assert me.put(f"/api/v1/free-posts/{second}/bookmark").status_code == 204  # 이미 저장 → 그대로
    assert me.request("DELETE", f"/api/v1/free-posts/{first}/bookmark").status_code == 204

    saved = me.get("/api/v1/me/free-bookmarks").json()
    assert [p["id"] for p in saved["items"]] == [second]
    assert _detail(me, second)["bookmarked"] is True


def test_visitor_detail_has_no_my_flags(client, db, clock):
    post_id = _post(login_as(client, make_user(db)), clock)
    client.cookies.clear()

    out = _detail(client, post_id)

    assert (out["myHelpful"], out["bookmarked"], out["comments"]) == (False, False, [])


def test_suspended_member_comments_hidden(client, db, clock):
    post_id = _post(login_as(client, make_user(db)), clock)
    bad = make_user(db)
    _comment(login_as(client, bad), clock, post_id)
    bad.status = "SUSPENDED"
    db.commit()
    client.cookies.clear()

    assert _detail(client, post_id)["comments"] == []


def test_comment_count_kept_in_sync(client, db, clock):
    user = login_as(client, make_user(db))
    post_id = _post(user, clock)
    first = _comment(user, clock, post_id).json()["id"]
    _comment(user, clock, post_id, parent_id=first)

    db.expire_all()
    assert db.get(FreePost, post_id).comment_count == 2
    assert len(db.scalars(select(FreeComment).where(FreeComment.post_id == post_id)).all()) == 2


def test_ac_f4_15_admin_blind_action_from_sqladmin(client, db, clock, admin_client):
    """SQLAdmin [블라인드 (사유 입력)] → 서비스 함수 → 블라인드 + 경고 (CLAUDE.md 29)."""
    writer = make_user(db)
    from fastapi.testclient import TestClient

    user = login_as(TestClient(app), writer)
    post_id = _post(user, clock)
    comment_id = _comment(user, clock, post_id).json()["id"]

    res = admin_client.post(
        f"/admin/reason?op=free_comment_blind&pks={comment_id}&back=free-comment", data={"reason": "업체 홍보"}, follow_redirects=False
    )

    assert res.status_code == 302
    db.expire_all()
    assert (db.get(FreeComment, comment_id).status, db.get(User, writer.id).warning_count) == ("BLINDED", 1)
