"""F4 업체 찾기(PR 게시판) — AC-F4-01, AC-F4-02, AC-F4-04, AC-F4-09 (#30).

- 화면 이름은 "업체 찾기"·"소개 글", 코드·API 는 pr_posts (문구.md 7장).
- AC-F4-02 는 서비스 검사 + DB 보호 장치(active_guard UNIQUE) 둘 다 본다.
"""
from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.board import service

from app.models import PrPost, StoredFile
from tests.conftest import login_as, make_supplier, make_user

URL = "/api/v1/pr-posts"
NOW = datetime(2026, 11, 18, 10, 0)


def _body(category="EQUIPMENT", **kw):
    return {
        "category": category,
        "title": kw.pop("title", "공연 음향 장비 대여해요"),
        "body": kw.pop("body", "500명 이하 공연에 맞는 장비를 갖추고 있어요."),
        "sido": kw.pop("sido", "광주광역시"),
        "priceRange": kw.pop("priceRange", "장비 40~60만 원"),
        **kw,
    }


def _post(db, supplier, category, *, status="ACTIVE", title=None, bumped_at=NOW):
    post = PrPost(
        supplier_id=supplier.id,
        category=category,
        title=title or f"{category} 소개 글",
        body="소개",
        photos=[],
        sido="광주광역시",
        status=status,
        bumped_at=bumped_at,
    )
    db.add(post)
    db.commit()
    return post


def _temp_file(db, owner_id, purpose="PR_POST"):
    f = StoredFile(
        owner_user_id=owner_id,
        purpose=purpose,
        visibility="PUBLIC",
        status="TEMP",
        storage_key=f"public/test/{owner_id}-{purpose}-{datetime.now().timestamp()}.jpg",
        original_name="photo.jpg",
        mime_type="image/jpeg",
        size_bytes=100,
    )
    db.add(f)
    db.commit()
    return f


# ---- AC-F4-01 승인 안 된 부문 말머리는 서버가 거부 ----

def test_ac_f4_01_unapproved_category_is_rejected(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))

    res = login_as(client, s.user).post(URL, json=_body("VENUE"))

    assert res.status_code == 403
    assert res.json()["code"] == "CATEGORY_NOT_APPROVED"
    assert db.query(PrPost).count() == 0


def test_ac_f4_01_approved_category_is_created(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))

    res = login_as(client, s.user).post(URL, json=_body("EQUIPMENT"))

    assert res.status_code == 201, res.text
    data = res.json()
    assert (data["category"], data["supplierId"], data["companyName"]) == ("EQUIPMENT", s.id, s.company_name)
    db.rollback()  # MariaDB(REPEATABLE READ): 앞서 연 트랜잭션을 닫아야 API 가 저장한 행이 보인다
    [post] = db.query(PrPost).all()
    assert post.status == "ACTIVE" and post.bumped_at is not None


def test_ac_f4_01_supplier_not_approved_cannot_write(client, db):
    s = make_supplier(db, review_status="PENDING", categories=("EQUIPMENT",))

    res = login_as(client, s.user).post(URL, json=_body("EQUIPMENT"))

    assert res.status_code == 403
    assert res.json()["code"] == "SUPPLIER_NOT_APPROVED"


def test_ac_f4_01_user_role_cannot_write(client, db):
    """사용자·방문자는 쓸 수 없다. 다른 역할은 존재를 숨기려고 404 (CLAUDE.md 10)."""
    assert login_as(client, make_user(db)).post(URL, json=_body()).status_code == 404


def test_ac_f4_01_guest_cannot_write(client):
    res = client.post(URL, json=_body(), headers={"X-CSRF-Token": "x"}, cookies={"csrf_token": "x"})
    assert res.status_code == 401


def test_ac_f4_01_invalid_input_is_400(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))

    res = login_as(client, s.user).post(URL, json=_body(title="", category="INSTALL"))

    assert res.status_code == 400
    fields = {e["field"] for e in res.json()["fieldErrors"]}
    assert {"title", "category"} <= fields


def test_ac_f4_01_photos_must_be_my_temp_files(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    other = make_user(db)
    mine, theirs = _temp_file(db, s.user_id), _temp_file(db, other.id)
    api = login_as(client, s.user)

    assert api.post(URL, json=_body(fileIds=[theirs.id])).status_code == 400

    res = api.post(URL, json=_body(fileIds=[mine.id]))
    assert res.status_code == 201, res.text
    [photo] = res.json()["photos"]
    assert photo["id"] == mine.id and photo["url"]
    db.rollback()  # MariaDB(REPEATABLE READ): 앞서 연 트랜잭션을 닫아야 API 가 바꾼 값이 보인다
    assert db.get(StoredFile, mine.id).status == "ATTACHED"


# ---- AC-F4-02 부문당 활성 글 1개 (서비스 검사) ----

def test_ac_f4_02_second_active_post_in_same_category_is_blocked(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "ENGINEER"))
    api = login_as(client, s.user)
    assert api.post(URL, json=_body("EQUIPMENT")).status_code == 201

    res = api.post(URL, json=_body("EQUIPMENT", title="두 번째 글"))

    assert res.status_code == 409
    assert res.json()["code"] == "ACTIVE_POST_EXISTS"
    assert api.post(URL, json=_body("ENGINEER")).status_code == 201  # 다른 부문은 된다


def test_ac_f4_02_deleted_post_does_not_block(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    _post(db, s, "EQUIPMENT", status="DELETED")

    assert login_as(client, s.user).post(URL, json=_body("EQUIPMENT")).status_code == 201


@pytest.mark.parametrize("first", ["ACTIVE", "BLINDED"])
def test_ac_f4_02_db_guard_blocks_second_post_in_same_category(db, first):
    """서비스 검사를 거치지 않아도 DB 가 막는다 (active_guard, 가린 글도 포함 — AC-F4-10)."""
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    _post(db, s, "EQUIPMENT", status=first)

    with pytest.raises(IntegrityError):
        _post(db, s, "EQUIPMENT")
    db.rollback()


@pytest.mark.parametrize("first", ["HIDDEN", "DELETED"])
def test_ac_f4_02_db_guard_ignores_hidden_and_deleted(db, first):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    _post(db, s, "EQUIPMENT", status=first)
    _post(db, s, "EQUIPMENT", status=first)  # 내린·지운 글은 여러 개여도 된다

    assert _post(db, s, "EQUIPMENT").active_guard == 1


def test_ac_f4_02_db_guard_allows_other_category_and_other_supplier(db):
    a = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "ENGINEER"))
    b = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    _post(db, a, "EQUIPMENT")

    _post(db, a, "ENGINEER")
    _post(db, b, "EQUIPMENT")


def test_ac_f4_02_race_past_service_check_still_returns_409(client, db, monkeypatch):
    """두 요청이 동시에 서비스 검사를 지나도, DB 가 막은 쪽은 500 이 아니라 409 로 답한다."""
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    _post(db, s, "EQUIPMENT", title="먼저 들어온 글")
    real, calls = service._raise_if_blocked, []

    def first_call_misses(*args):
        calls.append(args)
        if len(calls) > 1:
            real(*args)

    monkeypatch.setattr(service, "_raise_if_blocked", first_call_misses)
    res = login_as(client, s.user).post(URL, json=_body("EQUIPMENT"))

    assert res.status_code == 409 and res.json()["code"] == "ACTIVE_POST_EXISTS"
    db.rollback()
    assert db.query(PrPost).count() == 1


# ---- AC-F4-04 방문자도 로그인 없이 본다 ----

def test_ac_f4_04_visitor_can_read_list_and_detail(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    post = _post(db, s, "EQUIPMENT")

    res = client.get(URL)
    assert res.status_code == 200
    data = res.json()
    assert (data["page"], data["size"], data["total"]) == (1, 20, 1)
    assert [i["id"] for i in data["items"]] == [post.id]

    detail = client.get(f"{URL}/{post.id}")
    assert detail.status_code == 200
    assert detail.json()["title"] == post.title


def test_ac_f4_04_no_contact_fields_in_responses(client, db):
    """결제 전 연락처 비공개 (CLAUDE.md 20)."""
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    post = _post(db, s, "EQUIPMENT")
    banned = {"phone", "email", "name", "birthDate", "mainPhone", "businessRegNo"}

    item = client.get(URL).json()["items"][0]
    detail = client.get(f"{URL}/{post.id}").json()

    assert not banned & set(item) and not banned & set(detail)


def test_ac_f4_04_hidden_posts_are_not_shown(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("VENUE", "EQUIPMENT", "ENGINEER"))
    hidden = [_post(db, s, "VENUE", status="HIDDEN"), _post(db, s, "EQUIPMENT", status="BLINDED"), _post(db, s, "ENGINEER", status="DELETED")]

    assert client.get(URL).json()["total"] == 0
    for p in hidden:
        assert client.get(f"{URL}/{p.id}").status_code == 404
    assert client.get(f"{URL}/999999").status_code == 404


def test_ac_f4_04_list_is_newest_bumped_first(client, db):
    a = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    b = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    old = _post(db, a, "EQUIPMENT", bumped_at=datetime(2026, 11, 1, 9, 0))
    new = _post(db, b, "EQUIPMENT", bumped_at=datetime(2026, 11, 17, 9, 0))

    assert [i["id"] for i in client.get(URL).json()["items"]] == [new.id, old.id]


# ---- AC-F4-09 말머리 필터 ----

def test_ac_f4_09_category_filter(client, db):
    v = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    e = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    g = make_supplier(db, review_status="APPROVED", categories=("ENGINEER",))
    venue, equip, eng = _post(db, v, "VENUE"), _post(db, e, "EQUIPMENT"), _post(db, g, "ENGINEER")

    only = client.get(URL, params={"category": "ENGINEER"}).json()
    assert [i["id"] for i in only["items"]] == [eng.id]
    assert only["items"][0]["category"] == "ENGINEER"

    everything = client.get(URL).json()  # [전체] = category 생략
    assert {i["id"] for i in everything["items"]} == {venue.id, equip.id, eng.id}


def test_ac_f4_09_unknown_category_is_400(client):
    assert client.get(URL, params={"category": "INSTALL"}).status_code == 400


def test_ac_f4_09_sido_filter(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("VENUE", "EQUIPMENT"))
    gwangju = _post(db, s, "VENUE")
    seoul = _post(db, s, "EQUIPMENT")
    seoul.sido = "서울특별시"
    db.commit()

    items = client.get(URL, params={"sido": "서울특별시"}).json()["items"]
    assert [i["id"] for i in items] == [seoul.id] != [gwangju.id]
