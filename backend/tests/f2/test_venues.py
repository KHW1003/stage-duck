"""F2 공간 등록·수정·스냅샷 — AC-F2-01·02·03 (FR-SPACE-01·02, T1-06 #27)."""
from dataclasses import asdict
from datetime import time

import pytest
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.errors import AppError
from app.models import Venue
from app.supplier.service import get_venue_snapshot
from tests.conftest import login_as, make_supplier, make_user

URL = "/api/v1/supplier/venues"


def _body(**kw):
    """공간 C (시연_예시값.md): 입실 15:00, 기본 보컬 마이크 2."""
    body = {
        "name": "공간 C", "sido": "광주광역시", "sigungu": "동구", "address": "가상로 3", "venueType": "CULTURE_SPACE",
        "maxCapacity": 120, "checkinTime": "15:00", "checkoutTime": "23:00", "rentalFee": 500000,
        "bandAllowed": True, "hasParking": None,
        "equipment": [{"category": "MIC", "name": "보컬 마이크", "quantity": 2}],
    }
    return body | kw


@pytest.fixture
def venue_owner(db, client):
    return login_as(client, make_supplier(db, review_status="APPROVED", categories=("VENUE",)).user)


def test_ac_f2_01_capacity_501_rejected(venue_owner, db):
    res = venue_owner.post(URL, json=_body(maxCapacity=501))
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_FAILED"
    assert res.json()["fieldErrors"][0]["field"] == "maxCapacity"
    assert venue_owner.post(URL, json=_body(maxCapacity=500)).status_code == 201  # 경계 값
    assert db.query(Venue).count() == 1


def test_ac_f2_01_db_check_blocks_501_even_without_api(db):
    supplier = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    db.add(Venue(supplier_id=supplier.id, name="x", sido="광주광역시", sigungu="동구", address="x", venue_type="ETC",
                 max_capacity=501, checkin_time=time(15), checkout_time=time(23), rental_fee=1))
    with pytest.raises((IntegrityError, OperationalError)):  # MariaDB 의 CHECK 위반은 OperationalError(4025)
        db.commit()
    db.rollback()


@pytest.mark.parametrize("checkout", ["14:00", "15:00"])
def test_ac_f2_02_checkout_before_checkin(venue_owner, checkout):
    res = venue_owner.post(URL, json=_body(checkoutTime=checkout))
    assert res.status_code == 400 and res.json()["fieldErrors"][0]["field"] == "checkoutTime"


def test_ac_f2_03_snapshot_kept_after_edit(venue_owner, db):
    venue_id = venue_owner.post(URL, json=_body()).json()["id"]
    # 확정 공연(견적서 버전)에는 그때의 스냅샷이 복사돼 있다 (quote_versions.venue_snapshot)
    confirmed = asdict(get_venue_snapshot(db, venue_id))
    assert confirmed["equipment"][0]["quantity"] == 2

    res = venue_owner.put(f"{URL}/{venue_id}", json=_body(equipment=[{"category": "MIC", "name": "보컬 마이크", "quantity": 1}]))
    assert res.status_code == 200 and res.json()["equipment"][0]["quantity"] == 1

    db.expire_all()
    assert confirmed["equipment"][0]["quantity"] == 2  # 확정 공연은 2개 그대로
    assert get_venue_snapshot(db, venue_id).equipment[0]["quantity"] == 1  # 원본은 1개


def test_snapshot_conditions_keep_unknown_as_none(venue_owner, db):
    venue_id = venue_owner.post(URL, json=_body()).json()["id"]
    snap = get_venue_snapshot(db, venue_id)
    assert snap.conditions["BAND_ALLOWED"] is True and snap.conditions["HAS_PARKING"] is None
    assert (snap.checkin_time, snap.max_capacity) == (time(15), 120)


def test_snapshot_hidden_or_missing_is_not_found(venue_owner, db):
    venue_id = venue_owner.post(URL, json=_body()).json()["id"]
    db.get(Venue, venue_id).status = "HIDDEN"
    db.commit()
    for vid in (venue_id, 999):
        with pytest.raises(AppError) as exc:
            get_venue_snapshot(db, vid)
        assert exc.value.code == "NOT_FOUND"


@pytest.mark.parametrize(("review_status", "categories", "code"), [
    ("PENDING", ("VENUE",), "SUPPLIER_NOT_APPROVED"),
    ("SUSPENDED", ("VENUE",), "ACCOUNT_SUSPENDED"),
    ("APPROVED", ("EQUIPMENT",), "CATEGORY_NOT_APPROVED"),
])
def test_only_approved_venue_supplier_can_register(client, db, review_status, categories, code):
    res = login_as(client, make_supplier(db, review_status=review_status, categories=categories).user).post(URL, json=_body())
    assert res.status_code == 403 and res.json()["code"] == code


def test_user_role_cannot_register(client, db):
    assert login_as(client, make_user(db)).post(URL, json=_body()).status_code == 404


def test_other_suppliers_venue_is_not_found(venue_owner, client, db):
    venue_id = venue_owner.post(URL, json=_body()).json()["id"]
    other = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    res = login_as(client, other.user).put(f"{URL}/{venue_id}", json=_body(name="남의 공간"))
    assert res.status_code == 404
    db.expire_all()
    assert db.get(Venue, venue_id).name == "공간 C"
