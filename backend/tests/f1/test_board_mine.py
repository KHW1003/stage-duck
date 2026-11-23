"""업체 찾기 — 내 소개 글 목록 GET /pr-posts/mine (FR-BOARD-02·03, AC-F4-10 의 블라인드 안내).

계약서에 아직 없는 API 라 제안한 모양으로 먼저 만든다 (해원 승인 대기, 11/23):
- 업체 본인만. 내린(DELETED) 글은 빼고, 가려진(BLINDED) 글은 사유와 함께 준다 (공개 목록에는 안 나오는 글).
- 끌어올리기 가능 여부(canBump)와 다시 할 수 있는 시각(nextBumpAt)은 서버가 계산한다 (CLAUDE.md 12).
"""
from datetime import timedelta

import pytest

from app.board.router import get_now
from app.main import app
from app.policy import service as policy_service
from app.supplier import service as supplier_service
from tests.conftest import login_as, make_supplier, make_user
from tests.f2.test_quotes import _as
from tests.f4.test_pr_posts import NOW, _post

URL = "/api/v1/pr-posts/mine"


@pytest.fixture(autouse=True)
def _fixed_now():
    app.dependency_overrides[get_now] = lambda: NOW
    yield
    app.dependency_overrides.pop(get_now, None)


@pytest.fixture
def supplier(db):
    return make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT", "ENGINEER"))


def test_fr_board_02_mine_lists_only_my_active_and_blinded_posts(client, db, admin_user, supplier):
    equipment = _post(db, supplier, "EQUIPMENT", bumped_at=NOW - timedelta(days=3))
    engineer = _post(db, supplier, "ENGINEER", bumped_at=NOW - timedelta(days=10))
    gone = _post(db, supplier, "VENUE", status="DELETED")
    others = _post(db, make_supplier(db, review_status="APPROVED", categories=("EQUIPMENT",)), "EQUIPMENT")
    policy_service.blind_post(db, engineer.id, actor_id=admin_user.id, reason="본문에 외부 연락처가 있어요")
    owner = login_as(client, supplier.user)

    res = owner.get(URL)

    assert res.status_code == 200, res.text
    items = {i["id"]: i for i in res.json()["items"]}
    assert set(items) == {equipment.id, engineer.id}
    assert gone.id not in items and others.id not in items
    eq, en = items[equipment.id], items[engineer.id]
    assert (eq["status"], eq["blindReason"], eq["category"]) == ("ACTIVE", None, "EQUIPMENT")
    assert (en["status"], en["blindReason"]) == ("BLINDED", "본문에 외부 연락처가 있어요")
    assert {"title", "body", "photos", "sido", "priceRange", "bumpedAt", "createdAt"} <= set(eq)
    assert not {"phone", "email", "name", "birthDate"} & set(eq)  # CLAUDE.md 20


@pytest.mark.parametrize(
    ("bumped_ago", "can_bump"),
    [(timedelta(days=3), False), (timedelta(days=6, hours=23, minutes=59), False), (timedelta(days=7), True), (timedelta(days=10), True)],
)
def test_fr_board_03_mine_tells_when_bump_is_possible(client, db, supplier, bumped_ago, can_bump):
    post = _post(db, supplier, "EQUIPMENT", bumped_at=NOW - bumped_ago)
    owner = login_as(client, supplier.user)

    item = owner.get(URL).json()["items"][0]

    assert item["id"] == post.id
    assert item["canBump"] is can_bump
    assert item["nextBumpAt"].startswith((NOW - bumped_ago + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M"))


def test_fr_board_02_mine_is_empty_without_posts(client, db, supplier):
    assert login_as(client, supplier.user).get(URL).json() == {"items": []}


def test_fr_board_02_mine_is_for_suppliers_only(client, db, supplier):
    _post(db, supplier, "EQUIPMENT")
    assert client.get(URL).status_code == 401  # 로그인 안 함
    assert _as(db, make_user(db)).get(URL).status_code == 404  # 사용자 계정은 존재도 숨긴다


def test_fr_board_02_suspended_supplier_still_sees_own_posts(client, db, admin_user, supplier):
    post = _post(db, supplier, "EQUIPMENT")
    supplier_service.suspend(db, supplier.id, actor_id=admin_user.id, reason="경고 3회")
    owner = login_as(client, supplier.user)

    res = owner.get(URL)

    assert res.status_code == 200, res.text
    assert [i["id"] for i in res.json()["items"]] == [post.id]  # 공개 목록에서는 빠져도 본인은 본다
