"""F5 프로필 — AC-F5-15·16·17 (FR-PROFILE-01·02, T1-12 #33).

- 업체 프로필은 방문자도 본다. 연락처·사업자 정보는 응답에 없다 (CLAUDE.md 20).
- 개인 프로필은 관계있는 업체(2번 request.service.is_related)·관리자만. 그 밖은 404, 방문자 401.
- 이용·반려 횟수는 2번 request.rejection.user_counts 를 그대로 쓴다.
- "거래 n건"은 4번 함수가 없어 이번에 뺐다 (#33 결정).
"""
import uuid
from datetime import datetime, time

import pytest
from sqlalchemy import select

from app.demo.service import reset_demo, seed_demo
from app.models import PrPost, StoredFile, User, Venue
from tests.conftest import login_as, make_supplier, make_user

NOW = datetime(2026, 11, 19, 10, 0)
SUPPLIER_URL = "/api/v1/suppliers/{}/profile"
USER_URL = "/api/v1/users/{}/profile"
ME_URL = "/api/v1/me/profile"
CONTACT_KEYS = {"name", "phone", "email", "birthDate", "mainPhone", "businessRegNo", "businessAddress", "representativeName"}


def _file(db, owner_id, purpose, *, status="TEMP"):
    f = StoredFile(
        owner_user_id=owner_id,
        purpose=purpose,
        visibility="PUBLIC",
        status=status,
        storage_key=f"public/{purpose.lower()}/2026/11/{uuid.uuid4().hex}.webp",
        thumb_key=f"public/{purpose.lower()}/2026/11/{uuid.uuid4().hex}_t.webp",
        original_name="photo.jpg",
        mime_type="image/webp",
        size_bytes=100,
        created_at=NOW,
    )
    db.add(f)
    db.commit()
    return f


def _post(db, supplier, category, *, status="ACTIVE"):
    post = PrPost(supplier_id=supplier.id, category=category, title=f"{category} 소개 글", body="소개", photos=[],
                  sido="광주광역시", status=status, bumped_at=NOW)
    db.add(post)
    db.commit()
    return post


def _venue(db, supplier, *, name, status="ACTIVE"):
    v = Venue(supplier_id=supplier.id, name=name, sido="광주광역시", sigungu="동구", address="가상로 9", venue_type="ETC",
              max_capacity=120, checkin_time=time(15), checkout_time=time(23), rental_fee=500_000, band_allowed=True,
              status=status)
    db.add(v)
    db.commit()
    return v


def _keys(obj) -> set[str]:
    """응답 JSON 의 모든 키 (안쪽 목록까지)."""
    if isinstance(obj, dict):
        return set(obj) | {k for v in obj.values() for k in _keys(v)}
    if isinstance(obj, list):
        return {k for v in obj for k in _keys(v)}
    return set()


# ---- AC-F5-15 업체 프로필 (방문자) ----

def test_ac_f5_15_visitor_sees_supplier_profile_without_contact(client, db):
    s = make_supplier(db, review_status="APPROVED", categories=("VENUE", "EQUIPMENT"), company_name="업체 C",
                      intro="광주 밴드 공연 공간이에요.", setup_minutes=90, teardown_minutes=60, engineer_years=7,
                      has_liability_insurance=True, business_reg_no="1234567891", business_address="가상시 비밀로 1")
    s.image_file_id = _file(db, s.user_id, "SUPPLIER_IMAGE", status="ATTACHED").id
    db.commit()
    shown = _post(db, s, "EQUIPMENT")
    _post(db, s, "VENUE", status="HIDDEN")  # 내린 글은 안 보임
    space = _venue(db, s, name="공간 C")
    _venue(db, s, name="숨긴 공간", status="HIDDEN")

    res = client.get(SUPPLIER_URL.format(s.id))  # 로그인 없이

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["companyName"] == "업체 C"
    assert body["categories"] == ["VENUE", "EQUIPMENT"]
    assert body["intro"] == "광주 밴드 공연 공간이에요."
    assert (body["setupMinutes"], body["teardownMinutes"], body["engineerYears"]) == (90, 60, 7)
    assert body["hasLiabilityInsurance"] is True
    assert body["imageUrl"].startswith("/media/supplier_image/")
    assert body["joinedAt"]
    assert [p["id"] for p in body["posts"]] == [shown.id]
    assert [v["id"] for v in body["venues"]] == [space.id]
    # 연락처·사업자 정보는 키도 값도 없다 (CLAUDE.md 20). 공간의 name 은 공간 이름이라 뺀다
    assert "name" not in body and not _keys(body) & (CONTACT_KEYS - {"name"})
    for secret in ("0620000000", "1234567891", "가상시 비밀로 1", "대표"):
        assert secret not in res.text


@pytest.mark.parametrize("review_status", ["PENDING", "REJECTED", "SUSPENDED"])
def test_ac_f5_15_not_approved_supplier_is_404(client, db, review_status):
    s = make_supplier(db, review_status=review_status)
    res = client.get(SUPPLIER_URL.format(s.id))
    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"


def test_ac_f5_15_suspended_account_and_missing_id_are_404(client, db):
    s = make_supplier(db, review_status="APPROVED")
    s.user.status = "SUSPENDED"
    db.commit()
    assert client.get(SUPPLIER_URL.format(s.id)).status_code == 404
    assert client.get(SUPPLIER_URL.format(999_999)).status_code == 404


# ---- AC-F5-16 개인 프로필 (관계있는 업체) ----

@pytest.fixture
def related(monkeypatch):
    """2번 is_related 를 '이 (사용자, 업체) 쌍만 관계있음'으로 바꾼다."""
    pairs: set[tuple[int, int]] = set()
    monkeypatch.setattr("app.request.service.is_related", lambda db, user_id, supplier_id: (user_id, supplier_id) in pairs)
    return pairs


def test_ac_f5_16_related_supplier_sees_only_public_fields(client, db, related, monkeypatch):
    user = make_user(db, nickname="가을밤밴드")
    user.profile_file_id = _file(db, user.id, "PROFILE", status="ATTACHED").id
    db.commit()
    s = make_supplier(db, review_status="APPROVED")
    related.add((user.id, s.id))
    monkeypatch.setattr(
        "app.request.rejection.user_counts",
        lambda db, user_ids, *, now: {uid: {"rejection_count": 2, "usage_count": 3} for uid in user_ids},
    )

    res = login_as(client, s.user).get(USER_URL.format(user.id))

    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == {"id", "nickname", "profileImageUrl", "joinedAt", "usageCount", "rejectionCount"}
    assert (body["id"], body["nickname"], body["usageCount"], body["rejectionCount"]) == (user.id, "가을밤밴드", 3, 2)
    assert body["profileImageUrl"].startswith("/media/profile/")
    for secret in (user.name, user.email, user.phone):
        assert secret not in res.text


def test_ac_f5_16_admin_sees_profile_with_real_counts(client, db):
    admin = make_user(db, role="ADMIN")
    user = make_user(db)
    body = login_as(client, admin).get(USER_URL.format(user.id)).json()
    assert (body["usageCount"], body["rejectionCount"], body["profileImageUrl"]) == (0, 0, None)


# ---- AC-F5-17 만난 적 없는 업체·다른 역할 ----

def test_ac_f5_17_unrelated_supplier_gets_404(client, db):
    user = make_user(db)
    s = make_supplier(db, review_status="APPROVED")  # 견적서·채팅 없음 → 2번 is_related 가 False
    res = login_as(client, s.user).get(USER_URL.format(user.id))
    assert res.status_code == 404
    assert res.json()["code"] == "NOT_FOUND"


def test_ac_f5_17_other_supplier_of_related_pair_gets_404(client, db, related):
    user = make_user(db)
    met = make_supplier(db, review_status="APPROVED")
    stranger = make_supplier(db, review_status="APPROVED")
    related.add((user.id, met.id))
    assert login_as(client, stranger.user).get(USER_URL.format(user.id)).status_code == 404


def test_ac_f5_17_user_role_gets_404_and_visitor_401(client, db):
    me = make_user(db)
    other = make_user(db)
    assert client.get(USER_URL.format(other.id)).status_code == 401  # 방문자
    login_as(client, me)
    assert client.get(USER_URL.format(other.id)).status_code == 404  # 다른 사용자
    assert client.get(USER_URL.format(me.id)).status_code == 404  # 본인도 이 주소는 404 (본인은 GET /me/profile)


def test_ac_f5_17_supplier_or_missing_target_is_404_even_for_admin(client, db):
    admin = make_user(db, role="ADMIN")
    s = make_supplier(db, review_status="APPROVED")
    login_as(client, admin)
    assert client.get(USER_URL.format(s.user_id)).status_code == 404  # 사용자 역할이 아닌 회원
    assert client.get(USER_URL.format(999_999)).status_code == 404


# ---- 내 프로필 GET·PATCH /me/profile (FR-PROFILE-02) ----

def test_ac_f5_16_me_profile_shows_what_suppliers_see(client, db):
    user = make_user(db, nickname="가을밤밴드")
    body = login_as(client, user).get(ME_URL).json()
    assert set(body) == {"id", "nickname", "profileImageUrl", "joinedAt", "usageCount", "rejectionCount"}
    assert (body["nickname"], body["usageCount"], body["rejectionCount"]) == ("가을밤밴드", 0, 0)


def test_ac_f5_16_change_nickname(client, db):
    user = make_user(db, nickname="가을밤밴드")
    res = login_as(client, user).patch(ME_URL, json={"nickname": "  겨울밤밴드 "})
    assert res.status_code == 200, res.text
    assert res.json()["nickname"] == "겨울밤밴드"
    db.expire_all()
    assert db.get(User, user.id).nickname == "겨울밤밴드"


def test_ac_f5_16_same_nickname_as_mine_is_ok(client, db):
    user = make_user(db, nickname="가을밤밴드")
    assert login_as(client, user).patch(ME_URL, json={"nickname": "가을밤밴드"}).status_code == 200


def test_ac_f5_16_taken_nickname_is_409(client, db):
    make_user(db, nickname="덕구밴드")
    user = make_user(db, nickname="가을밤밴드")
    res = login_as(client, user).patch(ME_URL, json={"nickname": "덕구밴드"})
    assert res.status_code == 409
    body = res.json()
    assert body["code"] == "NICKNAME_TAKEN"
    assert body["fieldErrors"][0]["field"] == "nickname"


@pytest.mark.parametrize("nickname", ["", "   ", None])
def test_ac_f5_16_blank_nickname_is_400(client, db, nickname):
    user = make_user(db, nickname="가을밤밴드")
    res = login_as(client, user).patch(ME_URL, json={"nickname": nickname})
    assert res.status_code == 400
    assert res.json()["code"] == "VALIDATION_FAILED"
    assert res.json()["fieldErrors"][0]["field"] == "nickname"


def test_ac_f5_16_set_and_replace_profile_photo(client, db):
    user = make_user(db)
    first = _file(db, user.id, "PROFILE")
    login_as(client, user)

    res = client.patch(ME_URL, json={"profileFileId": first.id})
    assert res.status_code == 200, res.text
    assert res.json()["profileImageUrl"].startswith("/media/profile/")

    second = _file(db, user.id, "PROFILE")
    assert client.patch(ME_URL, json={"profileFileId": second.id}).status_code == 200
    db.expire_all()
    assert db.get(User, user.id).profile_file_id == second.id
    assert (db.get(StoredFile, first.id).status, db.get(StoredFile, second.id).status) == ("DELETED", "ATTACHED")


def test_ac_f5_16_remove_profile_photo(client, db):
    user = make_user(db)
    photo = _file(db, user.id, "PROFILE")
    login_as(client, user).patch(ME_URL, json={"profileFileId": photo.id})
    res = client.patch(ME_URL, json={"profileFileId": None})
    assert res.status_code == 200
    assert res.json()["profileImageUrl"] is None
    db.expire_all()
    assert db.get(User, user.id).profile_file_id is None
    assert db.get(StoredFile, photo.id).status == "DELETED"


def test_ac_f5_16_photo_must_be_my_temp_profile_file(client, db):
    user = make_user(db)
    others = _file(db, make_user(db).id, "PROFILE")
    wrong_purpose = _file(db, user.id, "PR_POST")
    login_as(client, user)
    for file_id in (others.id, wrong_purpose.id, 999_999):
        res = client.patch(ME_URL, json={"profileFileId": file_id})
        assert res.status_code == 400, file_id
        assert res.json()["code"] == "VALIDATION_FAILED"
    db.expire_all()
    assert db.get(User, user.id).profile_file_id is None


def test_me_profile_is_for_users_only(client, db):
    assert client.get(ME_URL).status_code == 401
    s = make_supplier(db, review_status="APPROVED")
    login_as(client, s.user)
    assert client.get(ME_URL).status_code == 404
    assert client.patch(ME_URL, json={"nickname": "새이름"}).status_code == 404


def test_profile_photo_does_not_block_demo_reset(db):
    """users.profile_file_id → files: 시연 초기화가 files 를 먼저 지워도 막히지 않는다 (SET NULL). FK 검사는 MariaDB(CI)에서."""
    seed_demo(db, NOW)
    host = db.scalar(select(User).where(User.role == "USER"))
    host.profile_file_id = _file(db, host.id, "PROFILE", status="ATTACHED").id
    db.commit()

    reset_demo(db, NOW)

    assert db.scalar(select(User).where(User.role == "USER")).profile_file_id is None
    assert len(db.scalars(select(Venue)).all()) == 3
