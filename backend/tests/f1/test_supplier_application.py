"""업체 가입 1단계·입점 신청 2단계 — AC-F1-17, AC-F1-18, AC-F1-20 (FR-SUP-01·02, 이슈 #26)."""
import pytest
from sqlalchemy import select

from app.auth.tokens import ACCESS_COOKIE
from app.models import StatusHistory, Supplier, TermsAgreement, User
from app.supplier import calc, service
from tests.conftest import login_as, make_supplier, make_user

SIGNUP = "/api/v1/auth/signup/supplier"
APP = "/api/v1/supplier/application"
VALID_NO = "1234567891"  # api-contract 예시. 체크섬이 맞는 가상 번호


def _signup_body(**over) -> dict:
    body = {
        "email": "d@stageduck.test",
        "password": "duck1234",
        "name": "이음향",
        "phone": "01000000000",
        "agreements": {"service": True, "privacyRequired": True, "privacyOptional": False, "marketing": False},
    }
    body.update(over)
    return body


def _app_body(**over) -> dict:
    body = {
        "businessType": "SOLE_PROPRIETOR",
        "companyName": "업체 D",
        "representativeName": "이음향",
        "businessRegNo": VALID_NO,
        "businessAddress": "광주 북구 가상로 1",
        "mainPhone": "0620000000",
        "mailOrderNo": None,
        "categories": ["EQUIPMENT", "INSTALL", "ENGINEER"],
    }
    body.update(over)
    return body


def _supplier_user(db) -> User:
    return make_user(db, role="SUPPLIER", nickname=None)


# ---------- 1단계: 업체 계정 가입 (FR-SUP-01) ----------


def test_supplier_signup_logs_in_and_lands_on_onboarding(client, db):
    res = client.post(SIGNUP, json=_signup_body())
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["role"], body["nickname"], body["landing"]) == ("SUPPLIER", None, "/supplier/onboarding")
    assert "email" not in body and "phone" not in body  # 연락처는 응답에 넣지 않는다 (CLAUDE.md 20)
    assert ACCESS_COOKIE in res.cookies
    user = db.scalar(select(User).where(User.email == "d@stageduck.test"))
    assert (user.role, user.nickname, user.birth_date) == ("SUPPLIER", None, None)
    assert db.scalar(select(Supplier.id).where(Supplier.user_id == user.id)) is None  # 사업자 정보는 2단계
    assert len(db.scalars(select(TermsAgreement).where(TermsAgreement.user_id == user.id)).all()) == 4

    me = client.get("/api/v1/me").json()
    assert (me["supplierReviewStatus"], me["landing"]) == (None, "/supplier/onboarding")


@pytest.mark.parametrize("field", ["email", "password", "name", "phone"])
def test_supplier_signup_blank_field_is_rejected(client, db, field):
    res = client.post(SIGNUP, json=_signup_body(**{field: " "}))
    assert res.status_code == 400
    assert [e["field"] for e in res.json()["fieldErrors"]] == [field]
    assert db.scalar(select(User.id)) is None


def test_supplier_signup_requires_terms_and_unique_email(client, db):
    res = client.post(SIGNUP, json=_signup_body(agreements={"service": True}))
    assert (res.status_code, res.json()["code"]) == (400, "TERMS_REQUIRED")
    make_user(db, email="d@stageduck.test")
    res = client.post(SIGNUP, json=_signup_body(email=" D@StageDuck.test "))
    assert (res.status_code, res.json()["code"]) == (409, "EMAIL_TAKEN")


# ---------- AC-F1-18 사업자등록번호 체크섬 ----------


@pytest.mark.parametrize("value", [VALID_NO, "123-45-67891", "9876543215", "5555500005"])
def test_ac_f1_18_valid_business_numbers(value):
    assert calc.is_valid_business_no(calc.normalize_business_no(value))


@pytest.mark.parametrize("last", [d for d in "0123456789" if d != "1"])
def test_ac_f1_18_any_other_last_digit_is_wrong(last):
    """경계: 마지막 자리만 바꾼 9가지는 모두 틀린 번호."""
    assert not calc.is_valid_business_no(VALID_NO[:9] + last)


@pytest.mark.parametrize("value", ["123456789", "12345678911", "12345678a1", "", "１２３４５６７８９１"])
def test_ac_f1_18_wrong_length_or_not_digits(value):
    assert not calc.is_valid_business_no(value)


def test_ac_f1_18_wrong_checksum_is_not_saved_and_reason_is_shown(client, db):
    user = _supplier_user(db)
    res = login_as(client, user).post(APP, json=_app_body(businessRegNo="1234567890"))
    assert res.status_code == 400
    body = res.json()
    assert body["code"] == "INVALID_BUSINESS_NO"
    assert body["fieldErrors"] == [{"field": "businessRegNo", "reason": "번호가 맞지 않아요. 등록증의 10자리를 다시 확인해 주세요."}]
    assert db.scalar(select(Supplier.id)) is None


# ---------- AC-F1-17 개인(프리랜서)은 사업자 칸이 없다 ----------


def test_ac_f1_17_individual_needs_no_business_fields_and_they_are_ignored(client, db):
    user = _supplier_user(db)
    res = login_as(client, user).post(
        APP, json=_app_body(businessType="INDIVIDUAL", businessRegNo="0000000000", businessAddress="무시될 주소")
    )
    assert res.status_code == 201, res.text
    assert (res.json()["businessRegNo"], res.json()["businessAddress"]) == (None, None)
    s = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    assert (s.business_type, s.business_reg_no, s.business_address) == ("INDIVIDUAL", None, None)


def test_ac_f1_17_business_types_require_business_fields(client, db):
    res = login_as(client, _supplier_user(db)).post(
        APP, json=_app_body(businessType="CORPORATION", businessRegNo=None, businessAddress="")
    )
    assert res.status_code == 400
    assert {e["field"] for e in res.json()["fieldErrors"]} == {"businessRegNo", "businessAddress"}


@pytest.mark.parametrize(
    ("over", "field"),
    [
        ({"businessType": "FREELANCER"}, "businessType"),
        ({"companyName": ""}, "companyName"),
        ({"representativeName": None}, "representativeName"),
        ({"mainPhone": "062-000-0000"}, "mainPhone"),
        ({"categories": []}, "categories"),
        ({"categories": ["VENUE", "VENUE"]}, "categories"),
        ({"categories": ["CATERING"]}, "categories"),
        ({"companyName": "가" * 101}, "companyName"),
    ],
)
def test_application_field_rules(client, db, over, field):
    res = login_as(client, _supplier_user(db)).post(APP, json=_app_body(**over))
    assert res.status_code == 400
    assert [e["field"] for e in res.json()["fieldErrors"]] == [field]


# ---------- 신청 → 심사 중 → 반려 → 재신청 (AC-F1-20) ----------


def test_apply_goes_pending_and_is_recorded(client, db):
    user = _supplier_user(db)
    res = login_as(client, user).post(APP, json=_app_body(businessRegNo="123-45-67891"))
    assert res.status_code == 201
    body = res.json()
    assert (body["reviewStatus"], body["businessRegNo"], body["categories"]) == (
        "PENDING", VALID_NO, ["ENGINEER", "EQUIPMENT", "INSTALL"]
    )
    s = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    [h] = db.scalars(select(StatusHistory).where(StatusHistory.entity_id == s.id)).all()
    assert (h.from_status, h.to_status, h.actor_user_id) == (None, "PENDING", user.id)
    assert client.get("/api/v1/me").json()["landing"] == "/supplier/onboarding"  # 심사 중에는 공고 목록이 안 열린다
    assert client.post(APP, json=_app_body()).status_code == 409  # 두 번째 신청


def test_ac_f1_20_rejected_reason_is_shown_and_resubmit_goes_pending(client, db, admin_user):
    user = _supplier_user(db)
    api = login_as(client, user)
    assert api.get(APP).status_code == 404  # 신청 전
    api.post(APP, json=_app_body())
    s = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    assert api.put(APP, json=_app_body()).status_code == 409  # 심사 중에는 고칠 수 없다

    service.reject(db, s.id, actor_id=admin_user.id, reason="사업자등록증 사진이 흐려요")
    got = api.get(APP).json()
    assert (got["reviewStatus"], got["rejectReason"]) == ("REJECTED", "사업자등록증 사진이 흐려요")

    res = api.put(APP, json=_app_body(companyName="업체 D 사운드"))
    assert res.status_code == 200
    assert (res.json()["reviewStatus"], res.json()["companyName"]) == ("PENDING", "업체 D 사운드")

    db.expire_all()  # API 가 다른 세션에서 바꾼 상태를 다시 읽는다
    service.approve(db, s.id, actor_id=admin_user.id)
    assert api.get("/api/v1/me").json()["landing"] == "/supplier/postings"  # AC-F1-19
    assert api.put(APP, json=_app_body()).status_code == 409


# ---------- 권한 ----------


@pytest.mark.parametrize("method", ["get", "post", "put"])
def test_users_and_admins_cannot_use_application(client, db, method):
    for role in ("USER", "ADMIN"):
        api = login_as(client, make_user(db, role=role, nickname=None))
        kw = {} if method == "get" else {"json": _app_body()}
        assert getattr(api, method)(APP, **kw).status_code == 404


def test_application_needs_login(client):
    client.cookies.set("csrf_token", "t")
    client.headers["X-CSRF-Token"] = "t"
    assert client.get(APP).status_code == 401
    assert client.post(APP, json=_app_body()).status_code == 401


def test_supplier_only_sees_own_application(client, db):
    make_supplier(db, business_reg_no=VALID_NO)  # 다른 업체의 신청서
    assert login_as(client, _supplier_user(db)).get(APP).status_code == 404
