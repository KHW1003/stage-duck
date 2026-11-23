"""업체 찾기 소개 글 — 내리기(DELETE)·끌어올리기(bump) (FR-BOARD-02·03, 계약서 /pr-posts/{id}, 11/23 spec-sync).

- 이 두 동작은 수용 기준(AC)이 따로 없어 FR 번호로 이름을 붙인다.
- 내리기는 지우지 않고 DELETED 로 바꾼다. 그러면 그 부문에 새 글을 쓸 수 있다 (active_guard 가 비워짐).
- 가려진(BLINDED) 글은 내릴 수 없다. 내리면 "블라인드 글이 있는 부문은 관리자가 풀기 전까지 새 글 불가"(FR-BOARD-03)를 피해 갈 수 있어서다.
- 끌어올리기는 마지막으로 끌어올린 시각(처음엔 쓴 시각)에서 7일이 지나야 한다 (D-38). 지나지 않으면 429 BUMP_TOO_SOON.
"""
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.board.router import get_now
from app.main import app
from app.models import PrPost, StatusHistory
from app.policy import service as policy_service
from app.supplier import service as supplier_service
from tests.conftest import login_as, make_supplier, make_user
from tests.f2.test_quotes import _as
from tests.f4.test_pr_posts import NOW, _body, _post

URL = "/api/v1/pr-posts"
clock = {"now": NOW}


@pytest.fixture(autouse=True)
def _fixed_now():
    clock["now"] = NOW
    app.dependency_overrides[get_now] = lambda: clock["now"]
    yield
    app.dependency_overrides.pop(get_now, None)


@pytest.fixture
def supplier(db):
    return make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))


# ---------- FR-BOARD-02 내리기 (DELETE /pr-posts/{id}) ----------


def test_fr_board_02_owner_deletes_post_then_can_write_new_one(client, db, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    owner = login_as(client, supplier.user)

    res = owner.delete(f"{URL}/{post.id}")

    assert res.status_code == 204, res.text
    db.refresh(post)
    assert post.status == "DELETED"
    assert client.get(f"{URL}/{post.id}").status_code == 404
    assert post.id not in [i["id"] for i in client.get(URL).json()["items"]]
    history = db.scalar(select(StatusHistory).where(StatusHistory.entity_type == "pr_post", StatusHistory.entity_id == post.id))
    assert (history.from_status, history.to_status, history.actor_user_id) == ("ACTIVE", "DELETED", supplier.user_id)
    assert owner.post(URL, json=_body("EQUIPMENT")).status_code == 201  # 부문당 1개 자리가 비었다


def test_fr_board_02_delete_twice_is_404(client, db, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    owner = login_as(client, supplier.user)
    assert owner.delete(f"{URL}/{post.id}").status_code == 204

    res = owner.delete(f"{URL}/{post.id}")

    assert res.status_code == 404, res.text
    assert res.json()["code"] == "NOT_FOUND"


def test_fr_board_02_others_cannot_delete(client, db, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    other_supplier = _as(db, make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",)).user)
    res = other_supplier.delete(f"{URL}/{post.id}")
    assert res.status_code == 404, res.text

    user = _as(db, make_user(db))
    assert user.delete(f"{URL}/{post.id}").status_code == 404  # 업체가 아니면 존재도 숨긴다

    db.refresh(post)
    assert post.status == "ACTIVE"


def test_fr_board_03_blinded_post_cannot_be_deleted(client, db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    policy_service.blind_post(db, post.id, actor_id=admin_user.id, reason="연락처 노출")
    owner = login_as(client, supplier.user)

    res = owner.delete(f"{URL}/{post.id}")

    assert res.status_code == 409, res.text
    assert res.json()["code"] == "INVALID_STATE"
    db.refresh(post)
    assert post.status == "BLINDED"
    assert owner.post(URL, json=_body("EQUIPMENT")).json()["code"] == "BLINDED_POST_EXISTS"  # 계속 막힌다


def test_fr_board_02_suspended_supplier_cannot_delete(client, db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    supplier_service.suspend(db, supplier.id, actor_id=admin_user.id, reason="경고 3회")
    owner = login_as(client, supplier.user)

    res = owner.delete(f"{URL}/{post.id}")

    assert res.status_code == 403, res.text
    assert res.json()["code"] == "ACCOUNT_SUSPENDED"
    db.refresh(post)
    assert post.status == "ACTIVE"


# ---------- FR-BOARD-03 끌어올리기 7일에 1회 (POST /pr-posts/{id}/bump) ----------


@pytest.mark.parametrize(
    ("after", "expected"),
    [
        (timedelta(minutes=1), 429),
        (timedelta(days=6, hours=23, minutes=59), 429),
        (timedelta(days=7), 200),  # 경계: 딱 7일이면 된다
        (timedelta(days=30), 200),
    ],
)
def test_fr_board_03_bump_once_per_7_days(client, db, supplier, after, expected):
    post = _post(db, supplier, "EQUIPMENT", bumped_at=NOW)
    owner = login_as(client, supplier.user)
    clock["now"] = NOW + after

    res = owner.post(f"{URL}/{post.id}/bump")

    assert res.status_code == expected, res.text
    db.refresh(post)
    if expected == 200:
        assert res.json()["id"] == post.id
        assert post.bumped_at == NOW + after
    else:
        assert res.json()["code"] == "BUMP_TOO_SOON"
        assert post.bumped_at == NOW  # 바뀌지 않는다


def test_fr_board_03_new_post_counts_as_bumped(client, db, supplier):
    owner = login_as(client, supplier.user)
    post_id = owner.post(URL, json=_body("EQUIPMENT")).json()["id"]

    clock["now"] = NOW + timedelta(days=3)
    assert owner.post(f"{URL}/{post_id}/bump").status_code == 429  # 쓴 날부터 7일
    clock["now"] = NOW + timedelta(days=7)
    assert owner.post(f"{URL}/{post_id}/bump").status_code == 200
    clock["now"] = NOW + timedelta(days=8)
    assert owner.post(f"{URL}/{post_id}/bump").status_code == 429  # 끌어올린 날부터 다시 7일


def test_fr_board_03_bumped_post_goes_to_top_of_list(client, db, supplier):
    mine = _post(db, supplier, "EQUIPMENT", bumped_at=NOW - timedelta(days=10))
    other = make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",))
    newer = _post(db, other, "EQUIPMENT", bumped_at=NOW - timedelta(days=1))
    assert [i["id"] for i in client.get(URL).json()["items"]][:2] == [newer.id, mine.id]

    owner = login_as(client, supplier.user)
    assert owner.post(f"{URL}/{mine.id}/bump").status_code == 200

    assert [i["id"] for i in client.get(URL).json()["items"]][:2] == [mine.id, newer.id]


def test_fr_board_03_bump_refused_for_others_deleted_blinded_suspended(client, db, admin_user, supplier):
    old = NOW - timedelta(days=10)
    owner = login_as(client, supplier.user)

    post = _post(db, supplier, "EQUIPMENT", bumped_at=old)
    other_supplier = _as(db, make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",)).user)
    assert other_supplier.post(f"{URL}/{post.id}/bump").status_code == 404  # 남의 글

    policy_service.blind_post(db, post.id, actor_id=admin_user.id, reason="연락처 노출")
    res = owner.post(f"{URL}/{post.id}/bump")
    assert res.status_code == 409 and res.json()["code"] == "INVALID_STATE"  # 가려진 글

    policy_service.unblind_post(db, post.id, actor_id=admin_user.id)
    supplier_service.suspend(db, supplier.id, actor_id=admin_user.id, reason="경고 3회")
    res = owner.post(f"{URL}/{post.id}/bump")
    assert res.status_code == 403 and res.json()["code"] == "ACCOUNT_SUSPENDED"  # 정지 계정

    supplier_service.unsuspend(db, supplier.id, actor_id=admin_user.id)
    assert owner.delete(f"{URL}/{post.id}").status_code == 204
    assert owner.post(f"{URL}/{post.id}/bump").status_code == 404  # 내린 글
    db.refresh(post)
    assert post.bumped_at == old
