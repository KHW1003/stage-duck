"""커뮤니티 목록·글 보기·글쓰기 (T2-07 #100, AC-F4-12·13·16, api-contract.md 7장 free-posts, data-model.md free_posts)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.community.router import get_now
from app.main import app
from app.models.community import FreePost
from tests.conftest import login_as, make_supplier, make_user

NOW = datetime(2026, 11, 18, 14, 0)


@pytest.fixture
def clock():
    """글쓰기 시각을 고정하고 테스트에서 옮긴다 (1분 제한, AC-F4-16)."""
    state = {"now": NOW}
    app.dependency_overrides[get_now] = lambda: state["now"]
    yield state
    app.dependency_overrides.pop(get_now, None)


def _post(client, *, category="FREE", title="첫 공연 후기", body="소리가 좋았어요.", **kw):
    return client.post("/api/v1/free-posts", json={"category": category, "title": title, "body": body, **kw})


def _write(client, clock, n=1, **kw) -> list[int]:
    ids = []
    for _ in range(n):
        res = _post(client, **kw)
        assert res.status_code == 201, res.text
        ids.append(res.json()["id"])
        clock["now"] += timedelta(minutes=2)
    return ids


# ---- AC-F4-12 방문자 열람 ------------------------------------------------------------------


def test_ac_f4_12_visitor_can_read_list_and_post(client, db, clock):
    writer = login_as(client, make_user(db, nickname="가을밴드"))
    post_id = _write(writer, clock, title="첫 공연 후기")[0]
    client.cookies.clear()

    listing = client.get("/api/v1/free-posts")
    detail = client.get(f"/api/v1/free-posts/{post_id}")

    assert listing.status_code == 200
    assert [p["title"] for p in listing.json()["items"]] == ["첫 공연 후기"]
    assert detail.status_code == 200
    assert (detail.json()["title"], detail.json()["author"]["name"], detail.json()["author"]["kind"]) == ("첫 공연 후기", "가을밴드", "USER")


def test_ac_f4_12_visitor_cannot_write(client, db):
    assert _post(client).status_code in (401, 403)  # CSRF 또는 로그인 — 어느 쪽이든 저장 안 됨
    assert db.scalars(select(FreePost)).all() == []


def test_supplier_author_shown_as_company(client, db, clock):
    supplier = make_supplier(db, review_status="APPROVED", company_name="업체 D")
    post_id = _write(login_as(client, supplier.user), clock)[0]

    author = client.get(f"/api/v1/free-posts/{post_id}").json()["author"]

    assert (author["name"], author["kind"]) == ("업체 D", "SUPPLIER")


def test_detail_counts_views_and_links_prev_next(client, db, clock):
    writer = login_as(client, make_user(db))
    first, second, third = _write(writer, clock, n=3)

    client.get(f"/api/v1/free-posts/{second}")
    out = client.get(f"/api/v1/free-posts/{second}").json()

    assert out["viewCount"] == 2
    assert (out["prevId"], out["nextId"]) == (first, third)
    first_title = client.get(f"/api/v1/free-posts/{first}").json()["title"]
    assert out["prevTitle"] == first_title and out["nextTitle"]  # 화면이 "다음 글 보기" 대신 제목을 보여 준다


# ---- AC-F4-13 말머리 필터·정렬·검색 ---------------------------------------------------------


def test_ac_f4_13_category_filter_shows_only_questions(client, db, clock):
    writer = login_as(client, make_user(db))
    _write(writer, clock, category="FREE", title="자유 글")
    _write(writer, clock, category="QUESTION", title="질문 글")
    _write(writer, clock, category="INFO", title="정보 글")

    items = client.get("/api/v1/free-posts?category=QUESTION").json()["items"]

    assert [(p["category"], p["title"]) for p in items] == [("QUESTION", "질문 글")]


def test_list_latest_first_with_paging(client, db, clock):
    writer = login_as(client, make_user(db))
    ids = _write(writer, clock, n=22)

    page1 = client.get("/api/v1/free-posts").json()
    page2 = client.get("/api/v1/free-posts?page=2").json()

    assert (page1["total"], len(page1["items"]), len(page2["items"])) == (22, 20, 2)
    assert page1["items"][0]["id"] == ids[-1]
    assert [p["id"] for p in page2["items"]] == [ids[1], ids[0]]


@pytest.mark.parametrize("field, q, expected", [("title", "장비", ["장비 추천"]), ("all", "드럼", ["장비 추천"]), ("author", "가을", ["장비 추천", "공연장 후기"])])
def test_search_by_field(client, db, clock, field, q, expected):
    writer = login_as(client, make_user(db, nickname="가을밴드"))
    _write(writer, clock, title="공연장 후기", body="좋았어요")
    _write(writer, clock, title="장비 추천", body="드럼 세트 빌릴 곳")

    items = client.get(f"/api/v1/free-posts?field={field}&q={q}").json()["items"]

    assert [p["title"] for p in items] == expected


def test_blinded_and_suspended_authors_posts_hidden(client, db, clock):
    good = login_as(client, make_user(db))
    visible = _write(good, clock, title="보이는 글")[0]
    bad_user = make_user(db)
    hidden = _write(login_as(client, bad_user), clock, title="정지 회원 글")[0]
    blinded = _write(login_as(client, make_user(db)), clock, title="블라인드 글")[0]
    bad_user.status = "SUSPENDED"
    db.get(FreePost, blinded).status = "BLINDED"
    db.get(FreePost, blinded).blind_reason = "광고"
    db.commit()
    client.cookies.clear()

    assert [p["id"] for p in client.get("/api/v1/free-posts").json()["items"]] == [visible]
    assert client.get(f"/api/v1/free-posts/{blinded}").status_code == 404
    assert client.get(f"/api/v1/free-posts/{hidden}").status_code == 404


def test_blinded_post_visible_to_author_with_reason(client, db, clock):
    author = make_user(db)
    post_id = _write(login_as(client, author), clock)[0]
    db.get(FreePost, post_id).status = "BLINDED"
    db.get(FreePost, post_id).blind_reason = "연락처 노출"
    db.commit()

    out = client.get(f"/api/v1/free-posts/{post_id}").json()

    assert (out["status"], out["blindReason"]) == ("BLINDED", "연락처 노출")


# ---- AC-F4-16 1분 제한 + 입력 검사 ----------------------------------------------------------


def test_ac_f4_16_second_post_within_a_minute_rejected(client, db, clock):
    writer = login_as(client, make_user(db))
    assert _post(writer).status_code == 201

    clock["now"] += timedelta(seconds=59)
    res = _post(writer, title="두 번째 글")
    assert (res.status_code, res.json()["code"]) == (403, "POSTING_RATE_LIMITED")

    clock["now"] += timedelta(seconds=1)  # 딱 1분
    assert _post(writer, title="세 번째 글").status_code == 201


@pytest.mark.parametrize(
    "kw, field",
    [
        ({"category": "NOTICE"}, "category"),
        ({"title": ""}, "title"),
        ({"title": "가" * 101}, "title"),
        ({"body": ""}, "body"),
        ({"body": "가" * 5001}, "body"),
    ],
)
def test_post_input_rules(client, db, clock, kw, field):
    res = _post(login_as(client, make_user(db)), **kw)

    assert res.status_code == 400
    assert field in [e["field"] for e in res.json()["fieldErrors"]]


def test_contact_pattern_warns_but_saves(client, db, clock):
    res = _post(login_as(client, make_user(db)), body="연락 주세요 010-1234-5678")

    assert (res.status_code, res.json()["contactWarning"]) == (201, True)


# ---- 수정·삭제 (본인만) --------------------------------------------------------------------


def test_author_can_edit_and_delete(client, db, clock):
    writer = login_as(client, make_user(db))
    post_id = _write(writer, clock)[0]

    edited = writer.put(f"/api/v1/free-posts/{post_id}", json={"category": "INFO", "title": "고친 제목", "body": "고친 본문"})
    assert (edited.status_code, edited.json()["title"]) == (200, "고친 제목")

    assert writer.delete(f"/api/v1/free-posts/{post_id}").status_code == 204
    assert db.get(FreePost, post_id).status == "DELETED"  # 댓글이 생길 수 있어 행은 남긴다
    assert client.get(f"/api/v1/free-posts/{post_id}").status_code == 404


def test_others_cannot_edit_or_delete(client, db, clock):
    post_id = _write(login_as(client, make_user(db)), clock)[0]
    other = login_as(client, make_user(db))

    assert other.put(f"/api/v1/free-posts/{post_id}", json={"category": "FREE", "title": "남의 글", "body": "x"}).status_code == 404
    assert other.delete(f"/api/v1/free-posts/{post_id}").status_code == 404
    assert db.get(FreePost, post_id).status == "ACTIVE"
