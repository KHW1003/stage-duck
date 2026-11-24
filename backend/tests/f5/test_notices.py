"""공지사항 — AC-F5-21 (FR-CS-02, FR-ADMIN-06, 이슈 #103)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.main import app
from app.models.support import Notice
from app.support.router import get_now
from tests.conftest import make_supplier, make_user

LIST = "/api/v1/notices"
NOW = datetime(2026, 11, 20, 10, 0)


@pytest.fixture(autouse=True)
def _clock():
    app.dependency_overrides[get_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_now, None)


def _notice(db, title: str, *, days_ago: float, pinned: bool = False, category: str = "GUIDE") -> Notice:
    n = Notice(category=category, title=title, body=f"{title} 본문", is_pinned=pinned,
               published_at=NOW - timedelta(days=days_ago))
    db.add(n)
    db.commit()
    return n


def test_ac_f5_21_pinned_notice_comes_before_newer_ones(client, db):
    old_pinned = _notice(db, "커뮤니티 이용 규칙", days_ago=10, pinned=True)
    newest = _notice(db, "서버 점검", days_ago=1, category="MAINTENANCE")
    middle = _notice(db, "견적서 최소 금액", days_ago=3, category="POLICY")
    pinned2 = _notice(db, "시연 서비스 안내", days_ago=9, pinned=True)

    res = client.get(LIST)
    assert res.status_code == 200
    body = res.json()
    assert [i["id"] for i in body["items"]] == [pinned2.id, old_pinned.id, newest.id, middle.id]
    assert body["items"][0] == {"id": pinned2.id, "category": "GUIDE", "title": "시연 서비스 안내", "isPinned": True,
                                "publishedAt": "2026-11-11T10:00:00"}
    assert (body["page"], body["totalPages"], body["total"]) == (1, 1, 4)


def test_ac_f5_21_future_notice_is_hidden_until_published(client, db):
    _notice(db, "예약 공지", days_ago=-1)
    visible = _notice(db, "지금 공지", days_ago=0)
    assert [i["id"] for i in client.get(LIST).json()["items"]] == [visible.id]


def test_ac_f5_21_list_pages_by_twenty(client, db):
    for i in range(21):
        _notice(db, f"공지 {i}", days_ago=i)
    first = client.get(LIST).json()
    second = client.get(LIST, params={"page": 2}).json()
    assert (len(first["items"]), first["totalPages"]) == (20, 2)
    assert [i["title"] for i in second["items"]] == ["공지 20"]
    assert client.get(LIST, params={"page": 0}).status_code == 400


def test_notice_detail_has_previous_and_next(client, db):
    older = _notice(db, "업체할인 칸", days_ago=4)
    this = _notice(db, "최소 금액", days_ago=3)
    newer = _notice(db, "서버 점검", days_ago=1, pinned=True)
    _notice(db, "예약", days_ago=-2)  # 아직 안 보이는 글은 다음 글이 되지 않는다

    body = client.get(f"{LIST}/{this.id}").json()
    assert body["body"] == "최소 금액 본문"
    assert body["prev"] == {"id": older.id, "title": "업체할인 칸", "publishedAt": "2026-11-16T10:00:00"}
    assert body["next"]["id"] == newer.id
    first = client.get(f"{LIST}/{older.id}").json()
    assert first["prev"] is None
    assert client.get(f"{LIST}/{newer.id}").json()["next"] is None


def test_notice_detail_404_for_missing_or_future(client, db):
    future = _notice(db, "예약", days_ago=-1)
    assert client.get(f"{LIST}/{future.id}").status_code == 404
    assert client.get(f"{LIST}/999999").status_code == 404


@pytest.mark.parametrize("who", ["guest", "user", "supplier"])
def test_notices_are_public_to_every_role(client, db, who):
    from tests.conftest import login_as

    n = _notice(db, "공지", days_ago=1)
    if who == "user":
        login_as(client, make_user(db))
    elif who == "supplier":
        login_as(client, make_supplier(db).user)
    assert client.get(LIST).status_code == 200
    assert client.get(f"{LIST}/{n.id}").status_code == 200


def test_notices_have_no_write_api(client, db):
    """쓰기는 관리자 SQLAdmin 만 — API 에는 쓰기 주소가 없다."""
    from tests.conftest import login_as

    login_as(client, make_user(db, role="ADMIN"))
    assert client.post(LIST, json={"title": "x"}).status_code == 405


def test_admin_creates_pinned_notice_in_sqladmin(admin_client, admin_user, db):
    res = admin_client.post(
        "/admin/notice/create",
        data={"category": "POLICY", "title": "새 정책", "body": "본문", "is_pinned": "y", "published_at": ""},
        follow_redirects=False,
    )
    assert res.status_code == 302, res.text
    notice = db.scalar(select(Notice).where(Notice.title == "새 정책"))
    assert notice.is_pinned is True
    assert notice.created_by == admin_user.id
    assert notice.published_at is not None


def test_seo_head_and_sitemap_include_public_notice(client, db):
    """seo.md 3장: {제목} · STAGE DUCK 공지 / 본문 앞 80자. 게시일이 지난 글만."""
    n = Notice(category="GUIDE", title="시연 안내", body="이 서비스는 포트폴리오 시연용이에요.", published_at=datetime.now())
    db.add(n)
    db.commit()
    res = client.get(f"/notices/{n.id}", headers={"Accept": "text/html"})
    assert res.status_code == 200
    assert "<title>시연 안내 · STAGE DUCK 공지</title>" in res.text
    assert "포트폴리오 시연용이에요." in res.text
    assert client.get("/notices/999999", headers={"Accept": "text/html"}).status_code == 404
    assert f"/notices/{n.id}</loc>" in client.get("/sitemap.xml").text
