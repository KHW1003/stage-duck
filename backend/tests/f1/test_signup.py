"""사용자 이메일 가입 — AC-F1-01, AC-F1-02, AC-F1-03 (FR-AUTH-01, 이슈 #24)."""
from datetime import date, datetime

import pytest
from sqlalchemy import select

from app.auth import calc, service
from app.auth.schemas import SignupIn
from app.auth.tokens import ACCESS_COOKIE, read_access_token
from app.core.errors import AppError
from app.models import TermsAgreement, User
from tests.conftest import make_user

URL = "/api/v1/auth/signup"
NOW = datetime(2026, 11, 16, 9, 0)
TODAY = NOW.date()


def _body(**over) -> dict:
    body = {
        "name": "김덕구",
        "phone": "01000000000",
        "email": "host2@stageduck.test",
        "birthDate": "1999-03-02",
        "nickname": "덕구밴드",
        "password": "duck1234",
        "signupPurpose": "PERFORMANCE",
        "musicianType": "BAND",
        "signupChannel": "SNS",
        "agreements": {"service": True, "privacyRequired": True, "privacyOptional": False, "marketing": False},
    }
    body.update(over)
    return body


def _fields(res) -> set[str]:
    return {e["field"] for e in res.json()["fieldErrors"]}


# ---------- AC-F1-01 필수 항목이 비면 가입되지 않고 그 칸에 이유가 보인다 ----------

REQUIRED = ["name", "phone", "email", "birthDate", "nickname", "password", "signupPurpose"]


@pytest.mark.parametrize("field", REQUIRED)
@pytest.mark.parametrize("how", ["missing", "empty"])
def test_ac_f1_01_required_field_blank_is_rejected(client, db, field, how):
    body = _body()
    if how == "missing":
        del body[field]
    else:
        body[field] = "   " if field != "birthDate" else None
    res = client.post(URL, json=body)
    assert res.status_code == 400, res.text
    assert res.json()["code"] == "VALIDATION_FAILED"
    assert _fields(res) == {field}
    assert all(e["reason"] for e in res.json()["fieldErrors"])  # 이유가 비어 있지 않다
    assert db.scalar(select(User.id)) is None  # 저장되지 않았다
    assert ACCESS_COOKIE not in res.cookies


def test_ac_f1_01_all_blank_reports_every_field(client):
    res = client.post(URL, json={})
    assert res.status_code == 400
    assert _fields(res) == set(REQUIRED)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("phone", "010-0000-0000"),  # 숫자만
        ("phone", "0100000"),  # 너무 짧음
        ("phone", "1012345678"),  # 0으로 시작하지 않음
        ("email", "not-an-email"),
        ("password", "duckduck"),  # 숫자 없음
        ("password", "12345678"),  # 영문 없음
        ("password", "duck123"),  # 7자 (경계)
        ("password", "a1" * 37),  # 74자 (bcrypt 한도 72 초과)
        ("nickname", "가" * 31),  # 31자 (경계)
        ("birthDate", "2026-11-17"),  # 오늘보다 뒤
    ],
)
def test_ac_f1_01_bad_format_is_rejected_with_reason(db, field, value):
    body = SignupIn.model_validate(_body(**{field: value}))
    with pytest.raises(AppError) as exc:
        service.signup(db, body, now=NOW)
    assert exc.value.code == "VALIDATION_FAILED"
    assert {e["field"] for e in exc.value.field_errors} == {field}


@pytest.mark.parametrize(
    ("field", "value"),
    [("password", "duck1234"), ("password", "a1" * 36), ("nickname", "가" * 30), ("phone", "021234567")],
)
def test_ac_f1_01_boundary_values_are_accepted(db, field, value):
    service.signup(db, SignupIn.model_validate(_body(**{field: value})), now=NOW)


# ---------- AC-F1-02 마케팅 동의 없이 가입된다 ----------

def test_ac_f1_02_signup_without_marketing_succeeds(client, db):
    res = client.post(URL, json=_body())
    assert res.status_code == 201, res.text
    body = res.json()
    user = db.get(User, body["id"])
    assert body == {"id": user.id, "role": "USER", "nickname": "덕구밴드", "landing": "/me/performances"}
    assert read_access_token(res.cookies.get(ACCESS_COOKIE)) == user.id  # 가입하면 바로 로그인
    assert user.password_hash and user.password_hash != "duck1234"  # 해시로만 저장 (NFR-SEC-01)
    assert user.email == "host2@stageduck.test" and user.phone == "01000000000"
    rows = {t.terms_type: t for t in db.scalars(select(TermsAgreement).where(TermsAgreement.user_id == user.id))}
    assert {k: v.agreed for k, v in rows.items()} == {
        "SERVICE": True,
        "PRIVACY_REQUIRED": True,
        "PRIVACY_OPTIONAL": False,
        "MARKETING": False,
    }
    assert {v.terms_version for v in rows.values()} == {"v1"}
    assert all(v.agreed_at is not None for v in rows.values())


def test_ac_f1_02_response_has_no_contact_info(client):
    body = client.post(URL, json=_body()).json()
    for key in ("name", "email", "phone", "birthDate"):
        assert key not in body


@pytest.mark.parametrize("missing", ["service", "privacyRequired"])
def test_ac_f1_02_required_terms_must_be_agreed(client, db, missing):
    agreements = {"service": True, "privacyRequired": True, missing: False}
    res = client.post(URL, json=_body(agreements=agreements))
    assert res.status_code == 400
    assert res.json()["code"] == "TERMS_REQUIRED"
    assert _fields(res) == {f"agreements.{missing}"}
    assert db.scalar(select(User.id)) is None


# ---------- AC-F1-03 만 14세 미만은 가입되지 않는다 ----------

def test_ac_f1_03_under_14_is_rejected(client, db):
    res = client.post(URL, json=_body(birthDate="2020-01-01"))
    assert res.status_code == 400
    assert res.json()["code"] == "UNDER_AGE"
    assert _fields(res) == {"birthDate"}
    assert db.scalar(select(User.id)) is None


@pytest.mark.parametrize(
    ("birth", "allowed"),
    [
        (date(2012, 11, 17), False),  # 내일이 14번째 생일 (경계 -1일)
        (date(2012, 11, 16), True),  # 오늘이 14번째 생일 (경계)
        (date(2012, 11, 15), True),
        (date(2012, 2, 29), True),  # 윤일생: 2026-02-28 이 지났으니 만 14세
    ],
)
def test_ac_f1_03_14th_birthday_boundary(db, birth, allowed):
    body = SignupIn.model_validate(_body(birthDate=birth.isoformat()))
    if allowed:
        service.signup(db, body, now=NOW)
    else:
        with pytest.raises(AppError) as exc:
            service.signup(db, body, now=NOW)
        assert exc.value.code == "UNDER_AGE"


def test_ac_f1_03_age_function_matches_birthday_rule():
    assert calc.age_on(date(2012, 11, 16), TODAY) == 14
    assert calc.age_on(date(2012, 11, 17), TODAY) == 13
    assert calc.age_on(date(2008, 2, 29), date(2022, 2, 28)) == 13  # 윤일생은 3월 1일부터 한 살 더
    assert calc.age_on(date(2008, 2, 29), date(2022, 3, 1)) == 14


# ---------- 중복 (FR-AUTH-01 예외: 이미 가입된 이메일·닉네임) ----------

def test_duplicate_email_is_409_case_insensitive(client, db):
    make_user(db, email="host2@stageduck.test")
    res = client.post(URL, json=_body(email="Host2@StageDuck.test", nickname="새닉네임"))
    assert res.status_code == 409
    assert res.json()["code"] == "EMAIL_TAKEN"
    assert _fields(res) == {"email"}


def test_duplicate_nickname_is_409(client, db):
    make_user(db, nickname="덕구밴드")
    res = client.post(URL, json=_body())
    assert res.status_code == 409
    assert res.json()["code"] == "NICKNAME_TAKEN"
    assert _fields(res) == {"nickname"}


def test_signup_always_creates_user_role_only(client, db):
    """가입 API로 업체·관리자를 만들 수 없다 (plan.md 4장: role=ADMIN 은 시드로만)."""
    res = client.post(URL, json=_body(role="ADMIN"))
    assert res.status_code == 201
    assert db.get(User, res.json()["id"]).role == "USER"
