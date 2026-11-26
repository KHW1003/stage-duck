"""오리 프로필 (11/26 해원 승인): 가입하면 계정에 맞는 오리가 정해지고, 사진 바꾸기에서 같은 역할의 오리 중 고른다."""
import pytest

from app.models.user import User
from app.profile import calc
from tests.conftest import login_as, make_supplier, make_user

# 화면(frontend/src/shared/ui/duck.ts duckPicks)과 같은 표 — 한쪽만 바꾸면 이 테스트와 화면 테스트가 실패한다
PICKS = {
    "USER": {f"{w}-{h}" for w in range(6) for h in range(4)},
    "VENUE": {f"{w}-{h}" for w in range(3) for h in range(3)} - {"2-2"},
    "EQUIPMENT": {f"{w}-{h}" for w in range(3) for h in range(3)},
    "INSTALL": {f"{w}-{h}" for w in range(3) for h in range(4)} - {"1-3"},
    "ENGINEER": {f"{w}-{h}" for w in range(3) for h in range(3)} - {"2-0", "2-1"},
}


def test_pick_table_matches_screen():
    assert {k: set(v) for k, v in calc.DUCK_PICKS.items()} == PICKS


def test_seed_is_fixed_per_account_and_differs_between_accounts():
    assert calc.duck_seed(7) == calc.duck_seed(7)
    assert len({calc.duck_seed(i) for i in range(1, 1001)}) == 1000
    assert calc.duck_seed(7) != "7"  # 계정 번호를 그대로 쓰지 않는다


@pytest.mark.parametrize(
    "role,categories,kind",
    [
        ("USER", [], "USER"),
        ("ADMIN", [], "USER"),
        ("SUPPLIER", ["ENGINEER", "VENUE"], "VENUE"),  # 여러 분야면 공연장 → 장비 → 설치 → 엔지니어 순서의 첫 분야
        ("SUPPLIER", ["INSTALL"], "INSTALL"),
        ("SUPPLIER", [], "EQUIPMENT"),  # 분야를 아직 안 고른 업체
    ],
)
def test_duck_role(role, categories, kind):
    assert calc.duck_role(role, categories) == kind


def test_new_user_gets_auto_duck_and_me_shows_it(client, db):
    user = make_user(db, nickname="광주밴드")
    me = login_as(client, user).get("/api/v1/me").json()
    assert me["duck"] == {"role": "USER", "seed": calc.duck_seed(user.id), "pick": None}
    assert me["avatarUrl"] is None


def test_user_picks_duck_and_photo_is_removed(client, db):
    user = make_user(db, nickname="광주밴드")
    api = login_as(client, user)
    res = api.patch("/api/v1/me/profile", json={"duckAvatar": "3-1", "profileFileId": None})
    assert res.status_code == 200, res.text
    assert res.json()["duck"] == {"role": "USER", "seed": calc.duck_seed(user.id), "pick": "3-1"}
    assert res.json()["profileImageUrl"] is None
    assert api.get("/api/v1/me").json()["duck"]["pick"] == "3-1"
    db.expire_all()
    assert db.get(User, user.id).duck_avatar == "3-1"


@pytest.mark.parametrize("pick", ["6-0", "0-4", "a-b", "1", "1-1-1", "", "<b>"])
def test_wrong_pick_is_refused(client, db, pick):
    api = login_as(client, make_user(db))
    res = api.patch("/api/v1/me/profile", json={"duckAvatar": pick})
    assert res.status_code == 400
    assert [e["field"] for e in res.json()["fieldErrors"]] == ["duckAvatar"]


def test_null_pick_goes_back_to_auto(client, db):
    api = login_as(client, make_user(db, duck_avatar="2-2"))
    assert api.patch("/api/v1/me/profile", json={"duckAvatar": None}).json()["duck"]["pick"] is None


def test_supplier_picks_duck_of_its_category_only(client, db):
    supplier = make_supplier(db, review_status="APPROVED", categories=["ENGINEER"])
    api = login_as(client, supplier.user)
    assert api.patch("/api/v1/supplier/profile", json={"imageFileId": None, "duckAvatar": "2-0"}).status_code == 400  # 목걸이 + 배 앞 물건
    res = api.patch("/api/v1/supplier/profile", json={"imageFileId": None, "duckAvatar": "2-2"})
    assert res.status_code == 200, res.text
    duck = {"role": "ENGINEER", "seed": calc.duck_seed(supplier.user_id), "pick": "2-2"}
    assert res.json()["duck"] == duck
    assert client.get(f"/api/v1/suppliers/{supplier.id}/profile").json()["duck"] == duck  # 방문자도 같은 오리
    assert api.get("/api/v1/me").json()["duck"] == duck


def test_pick_from_other_category_falls_back_to_auto(db):
    """분야가 바뀌어 고른 오리가 그 분야에 없으면 자동 오리로 보인다."""
    supplier = make_supplier(db, review_status="APPROVED", categories=["VENUE"])
    supplier.user.duck_avatar = "3-3"  # 뮤지션에만 있는 조합
    db.commit()
    from app.profile import duck

    assert duck.duck_of(db, supplier.user_id).pick is None


def test_user_profile_seen_by_admin_has_duck(client, db):
    user = make_user(db, duck_avatar="5-0")
    out = login_as(client, make_user(db, role="ADMIN")).get(f"/api/v1/users/{user.id}/profile")
    assert out.status_code == 200, out.text
    assert out.json()["duck"]["pick"] == "5-0"


def test_ducks_for_many_accounts_in_one_call(db):
    from app.profile import duck

    user = make_user(db, duck_avatar="1-1")
    supplier = make_supplier(db, review_status="APPROVED", categories=["INSTALL"])
    out = duck.ducks(db, [user.id, supplier.user_id, 999999])
    assert (out[user.id].role, out[user.id].pick) == ("USER", "1-1")
    assert (out[supplier.user_id].role, out[supplier.user_id].pick) == ("INSTALL", None)
    assert 999999 not in out


def test_duck_shows_everywhere_chat_favorites_board(client, db, monkeypatch):
    """사진이 보이는 곳(채팅 목록·관심 업체·소개 글)에 사진이 없으면 오리가 보인다."""
    from datetime import datetime

    from app.main import app
    from app.models import PrPost
    from app.models.chat import ChatRoom
    from app.request.router import get_today
    from tests.f2.test_posting import TODAY
    from tests.f3.test_chat import API, _room

    monkeypatch.setitem(app.dependency_overrides, get_today, lambda: TODAY)
    user, d, room_id, _, supplier = _room(client, db)
    room = db.get(ChatRoom, room_id)
    mine = next(r for r in user.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)
    theirs = next(r for r in d.get(f"{API}/chat-rooms").json() if r["roomId"] == room_id)
    assert mine["partnerDuck"]["seed"] == calc.duck_seed(supplier.user_id) and mine["partnerDuck"]["role"] != "USER"
    assert theirs["partnerDuck"] == {"role": "USER", "seed": calc.duck_seed(room.user_id), "pick": None}

    post = PrPost(supplier_id=supplier.id, category="EQUIPMENT", title="소개", body="소개", photos=[], sido="광주광역시",
                  status="ACTIVE", bumped_at=datetime(2026, 11, 20, 10, 0))
    db.add(post)
    db.commit()
    assert client.get(f"/api/v1/pr-posts/{post.id}").json()["supplierDuck"] == mine["partnerDuck"]
    fan = login_as(client, make_user(db))
    assert fan.post("/api/v1/favorites", json={"supplierId": supplier.id}).status_code == 204
    fav = next(f for f in fan.get("/api/v1/favorites").json() if f["supplierId"] == supplier.id)
    assert fav["duck"] == mine["partnerDuck"]

def test_duck_shows_in_community_and_board_list(client, db):
    """커뮤니티 글·댓글 작성자 옆, 업체 찾기 목록 카드에도 사진이 없으면 오리, 있으면 사진 (11/26)."""
    from datetime import datetime

    from app.models import PrPost
    from app.models.community import FreeComment, FreePost

    fan = make_user(db, nickname="광주밴드")
    supplier = make_supplier(db, review_status="APPROVED", categories=["VENUE"])
    post = FreePost(author_user_id=fan.id, category="QUESTION", title="질문", body="본문", photos=[], status="ACTIVE",
                    created_at=datetime(2026, 11, 20, 10, 0))
    db.add(post)
    db.flush()
    db.add(FreeComment(post_id=post.id, author_user_id=supplier.user_id, body="답", status="ACTIVE",
                       created_at=datetime(2026, 11, 20, 11, 0)))
    db.add(PrPost(supplier_id=supplier.id, category="VENUE", title="소개", body="소개", photos=[], sido="광주광역시",
                  status="ACTIVE", bumped_at=datetime(2026, 11, 20, 10, 0)))
    db.commit()

    fan_duck = {"role": "USER", "seed": calc.duck_seed(fan.id), "pick": None}
    venue_duck = {"role": "VENUE", "seed": calc.duck_seed(supplier.user_id), "pick": None}
    item = client.get("/api/v1/free-posts").json()["items"][0]
    assert item["author"] == {"name": "광주밴드", "kind": "USER", "avatarUrl": None, "duck": fan_duck}
    detail = client.get(f"/api/v1/free-posts/{post.id}").json()
    assert detail["author"]["duck"] == fan_duck
    assert detail["comments"][0]["author"]["duck"] == venue_duck
    card = client.get("/api/v1/pr-posts").json()["items"][0]
    assert (card["supplierImageUrl"], card["supplierDuck"]) == (None, venue_duck)