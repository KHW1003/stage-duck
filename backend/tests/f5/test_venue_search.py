"""F5 공간 탐색 — AC-F5-01 (FR-SPACE-03, T1-07 #28). 시드 공간 A·B·C (시연_예시값.md)."""
from datetime import datetime, time

import pytest

from app.demo.service import seed_demo
from app.models import Supplier, Venue
from tests.conftest import make_supplier

URL = "/api/v1/venues"
GWANGJU_80_BAND = {"sido": "광주광역시", "minCapacity": 80, "bandAllowed": "true"}


@pytest.fixture
def seeded(db):
    seed_demo(db, datetime(2026, 11, 12, 9, 0))


def _venue(db, supplier, **kw):
    v = Venue(supplier_id=supplier.id, name=kw.pop("name", "작은 공간"), sido="광주광역시", sigungu="동구", address="가상로 9",
              venue_type="ETC", max_capacity=kw.pop("max_capacity", 50), checkin_time=time(15), checkout_time=time(23),
              rental_fee=kw.pop("rental_fee", 100_000), band_allowed=kw.pop("band_allowed", True), **kw)
    db.add(v)
    db.commit()
    return v


def test_ac_f5_01_filter_returns_a_b_c(client, db, seeded):
    other = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    _venue(db, other, name="70석 공간", max_capacity=79)  # 80명 미만 → 빠짐 (경계 79)
    _venue(db, other, name="밴드 미확인", max_capacity=100, band_allowed=None)  # 미확인 → 빠짐
    _venue(db, other, name="밴드 불가", max_capacity=100, band_allowed=False)
    busan = _venue(db, other, name="부산 공간", max_capacity=100)
    busan.sido = "부산광역시"  # 지역이 다르면 빠짐
    db.commit()

    res = client.get(URL, params=GWANGJU_80_BAND)  # 로그인 없이 (방문자)
    assert res.status_code == 200
    body = res.json()
    assert sorted(i["name"] for i in body["items"]) == ["공간 A", "공간 B", "공간 C"]
    assert body["total"] == 3 and body["page"] == 1
    assert all(i["maxCapacity"] >= 80 for i in body["items"])
    assert {i["companyName"] for i in body["items"]} == {"업체 A", "업체 B", "업체 C"}


def test_capacity_boundary_80_included(client, db, seeded):
    other = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    _venue(db, other, name="딱 80석", max_capacity=80)
    names = [i["name"] for i in client.get(URL, params=GWANGJU_80_BAND).json()["items"]]
    assert "딱 80석" in names


def test_sort_by_fee_and_region_filter(client, db, seeded):
    items = client.get(URL, params={**GWANGJU_80_BAND, "sort": "fee"}).json()["items"]
    assert [i["rentalFee"] for i in items] == [400_000, 500_000, 4_000_000]  # B, C, A
    dong = client.get(URL, params={"sido": "광주광역시", "sigungu": "동구"}).json()["items"]
    assert sorted(i["name"] for i in dong) == ["공간 A", "공간 C"]
    assert client.get(URL, params={"type": "CONCERT_HALL"}).json()["total"] == 1


def test_hidden_and_suspended_supplier_venues_are_not_listed(client, db, seeded):
    a = db.query(Venue).filter_by(name="공간 A").one()
    a.status = "HIDDEN"
    c_supplier = db.get(Supplier, db.query(Venue).filter_by(name="공간 C").one().supplier_id)
    c_supplier.review_status = "SUSPENDED"
    db.commit()
    names = [i["name"] for i in client.get(URL, params=GWANGJU_80_BAND).json()["items"]]
    assert names == ["공간 B"]
    c_supplier.review_status = "APPROVED"  # 정지가 풀리면 다시 보인다
    db.commit()
    assert sorted(i["name"] for i in client.get(URL, params=GWANGJU_80_BAND).json()["items"]) == ["공간 B", "공간 C"]


def test_venue_detail_keeps_unknown_and_has_no_contact(client, db, seeded):
    c = db.query(Venue).filter_by(name="공간 C").one()
    res = client.get(f"{URL}/{c.id}")
    assert res.status_code == 200
    body = res.json()
    assert body["companyName"] == "업체 C" and body["checkinTime"] == "15:00:00"
    assert body["bandAllowed"] is True and body["hasParking"] is None  # null = 미확인
    assert body["equipment"] == [{"category": "마이크", "name": "유선 보컬 마이크", "quantity": 2}]
    assert not ({"phone", "email", "mainPhone", "businessRegNo"} & body.keys())  # 연락처·사업자 정보 없음 (CLAUDE.md 20)


def test_hidden_or_missing_detail_is_not_found(client, db, seeded):
    a = db.query(Venue).filter_by(name="공간 A").one()
    a.status = "HIDDEN"
    db.commit()
    assert client.get(f"{URL}/{a.id}").status_code == 404
    assert client.get(f"{URL}/999").status_code == 404


@pytest.mark.parametrize("params", [{"minCapacity": 0}, {"minCapacity": 501}, {"type": "CASTLE"}, {"sort": "random"}, {"size": 51}])
def test_bad_query_is_rejected(client, params):
    res = client.get(URL, params=params)
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_FAILED"


def test_list_item_has_checkin_and_condition_fields(client, db, seeded):
    """목업 spaces.html 카드의 "15:00 입실"과 조건 필터(외부 장비·외부 엔지니어·대기실·주차)에 쓰는 칸 (미확인은 null)."""
    items = {i["name"]: i for i in client.get(URL, params={"sido": "광주광역시"}).json()["items"]}
    c = items["공간 C"]
    assert c["checkinTime"] == "15:00:00"
    assert c["externalEquipmentAllowed"] is True
    assert c["externalEngineerAllowed"] is None and c["hasParking"] is None
    assert items["공간 A"]["hasWaitingRoom"] is True
