"""업체 찾기 소개 글 — 연락처 경고·블라인드 뒤 수정·정지 업체 숨김 (AC-F4-03·10·11, 이슈 #31).

- 신고 → 블라인드 → 경고 1회와 블라인드 중 새 글 막기는 4번 #54 테스트(tests/f4/test_pr_blind.py)에 있다.
  여기서는 #31 에 남은 것만 본다: 작성·수정 때 연락처 경고, 해제 뒤 수정(PUT), 정지 업체 글 숨김·복귀.
- 연락처·계좌·외부 링크가 있어도 저장은 하고 응답에 contactWarning 만 켠다 (커뮤니티·채팅과 같은 방식).
- 말머리(부문)는 수정으로 바꿀 수 없다 (#31 에서 정함).
"""
import pytest

from app.board import calc
from app.board.router import get_now
from app.main import app
from app.models import PrPost
from app.policy import service as policy_service
from app.supplier import service as supplier_service
from tests.conftest import login_as, make_supplier
from tests.f2.test_quotes import _as
from tests.f4.test_pr_posts import NOW, _body, _post

URL = "/api/v1/pr-posts"


@pytest.fixture(autouse=True)
def _fixed_now():
    app.dependency_overrides[get_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_now, None)


@pytest.fixture
def supplier(db):
    return make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))


def _put_body(**kw) -> dict:
    return _body("EQUIPMENT", title=kw.pop("title", "고친 소개 글"), **kw)


# ---------- AC-F4-03 본문에 전화번호·계좌번호·외부 링크 → 경고 표시 ----------


@pytest.mark.parametrize(
    "text",
    [
        "문의는 010-0000-0000 으로 주세요",
        "입금은 110-123-456789 계좌로",
        "자세한 장비 목록은 https://example.com/list 에 있어요",
        "블로그 www.example.com 참고",
    ],
)
def test_ac_f4_03_contact_or_link_in_post_shows_warning_but_saves(client, db, supplier, text):
    owner = login_as(client, supplier.user)

    res = owner.post(URL, json=_body("EQUIPMENT", body=text))

    assert res.status_code == 201, res.text
    assert res.json()["contactWarning"] is True
    assert client.get(f"{URL}/{res.json()['id']}").status_code == 200  # 막지 않고 저장된다


@pytest.mark.parametrize(
    "text",
    ["500명 이하 공연, 장비 40~60만 원", "기본 1,250,000원 · 설치 90분", "11월 28일 19:00 공연 가능", "마이크 12개, 스피커 2조"],
)
def test_ac_f4_03_ordinary_text_has_no_warning(client, db, supplier, text):
    owner = login_as(client, supplier.user)

    res = owner.post(URL, json=_body("EQUIPMENT", body=text))

    assert res.status_code == 201, res.text
    assert res.json()["contactWarning"] is False


def test_ac_f4_03_title_is_checked_too():
    assert calc.has_contact_or_link("연락 010 0000 0000", "본문") is True
    assert calc.has_contact_or_link("장비 대여", "http://example.com") is True
    assert calc.has_contact_or_link("장비 대여", "공연 장비를 갖추고 있어요") is False


# ---------- AC-F4-10 블라인드가 풀린 뒤에는 수정·재게시할 수 있다 ----------


def test_ac_f4_10_blinded_post_cannot_be_edited_until_unblind(client, db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    policy_service.blind_post(db, post.id, actor_id=admin_user.id, reason="연락처 노출")
    owner = login_as(client, supplier.user)

    res = owner.put(f"{URL}/{post.id}", json=_put_body())
    assert res.status_code == 409, res.text
    assert res.json()["code"] == "INVALID_STATE"
    assert client.get(f"{URL}/{post.id}").status_code == 404  # 가려져 있는 동안 안 보인다

    policy_service.unblind_post(db, post.id, actor_id=admin_user.id)
    res = owner.put(f"{URL}/{post.id}", json=_put_body(body="연락처는 채팅으로 이야기해요"))
    assert res.status_code == 200, res.text
    assert (res.json()["title"], res.json()["contactWarning"]) == ("고친 소개 글", False)

    shown = client.get(f"{URL}/{post.id}")  # 다시 게시되어 누구나 본다
    assert shown.status_code == 200 and shown.json()["title"] == "고친 소개 글"
    assert [p["id"] for p in client.get(URL).json()["items"]] == [post.id]


def test_ac_f4_10_edit_with_contact_shows_warning(client, db, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    owner = login_as(client, supplier.user)

    res = owner.put(f"{URL}/{post.id}", json=_put_body(body="문의 010-0000-0000"))

    assert res.status_code == 200, res.text
    assert res.json()["contactWarning"] is True


def test_ac_f4_10_category_cannot_be_changed(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "ENGINEER"))
    post = _post(db, s, "EQUIPMENT")
    owner = login_as(client, s.user)

    res = owner.put(f"{URL}/{post.id}", json=_body("ENGINEER"))

    assert res.status_code == 400, res.text
    assert res.json()["code"] == "VALIDATION_FAILED"
    assert [e["field"] for e in res.json()["fieldErrors"]] == ["category"]
    db.expire_all()
    assert db.get(PrPost, post.id).category == "EQUIPMENT"


def test_ac_f4_10_other_supplier_cannot_edit(client, db, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    other = _as(db, make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",)).user)

    res = other.put(f"{URL}/{post.id}", json=_put_body())

    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"
    db.expire_all()
    assert db.get(PrPost, post.id).title == "EQUIPMENT 소개 글"


# ---------- AC-F4-11 정지된 업체의 글은 보이지 않고, 정지가 풀리면 다시 보인다 ----------


def test_ac_f4_11_suspended_supplier_posts_hidden_then_shown_again(client, db, admin_user, supplier):
    hidden = _post(db, supplier, "EQUIPMENT")
    other = _post(db, make_supplier(db, review_status="APPROVED", categories=("ENGINEER",)), "ENGINEER")

    supplier_service.suspend(db, supplier.id, actor_id=admin_user.id, reason="경고 3회")
    assert [p["id"] for p in client.get(URL).json()["items"]] == [other.id]
    assert client.get(f"{URL}/{hidden.id}").status_code == 404
    assert client.get(URL, params={"category": "EQUIPMENT"}).json()["total"] == 0

    supplier_service.unsuspend(db, supplier.id, actor_id=admin_user.id)
    assert sorted(p["id"] for p in client.get(URL).json()["items"]) == sorted([hidden.id, other.id])
    assert client.get(f"{URL}/{hidden.id}").status_code == 200
