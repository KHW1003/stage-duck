"""F4 신고 — FR-POL-04, AC-F4-03·15의 신고 부분 (블라인드는 pr_posts·free_posts 가 생긴 뒤)."""
import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models import Report, Sanction, StatusHistory, User
from app.policy import service
from tests.conftest import login_as, make_user


def _report(db, reporter, target, **kw):
    return service.report(db, reporter_id=reporter.id, target_type="USER", target_id=target.id, reason=kw.get("reason", "외부 거래 유도"))


def test_ac_f4_03_report_api_creates_open_report(client, db):
    reporter = make_user(db)
    res = login_as(client, reporter).post("/api/v1/reports", json={"targetType": "PR_POST", "targetId": 3, "reason": "연락처 노출"})
    assert res.status_code == 201
    rep = db.get(Report, res.json()["id"])
    assert (rep.reporter_user_id, rep.target_type, rep.target_id, rep.status) == (reporter.id, "PR_POST", 3, "OPEN")


def test_ac_f4_15_report_free_comment_target_allowed(client, db):
    res = login_as(client, make_user(db)).post("/api/v1/reports", json={"targetType": "FREE_COMMENT", "targetId": 9, "reason": "욕설"})
    assert res.status_code == 201


def test_ac_f4_03_same_report_twice_is_one(client, db):
    reporter, target = make_user(db), make_user(db)
    first = _report(db, reporter, target)
    second = _report(db, reporter, target, reason="다른 사유")
    assert first == second
    assert db.scalar(select(Report).where(Report.id == first)).reason == "외부 거래 유도"
    assert len(db.scalars(select(Report)).all()) == 1


@pytest.mark.parametrize(("body", "field"), [
    ({"targetType": "USER", "targetId": 1, "reason": "  "}, "reason"),
    ({"targetType": "QUOTE", "targetId": 1, "reason": "사유"}, None),
    ({"targetType": "USER", "targetId": 0, "reason": "사유"}, None),
])
def test_ac_f4_03_report_rejects_bad_input(client, db, body, field):
    res = login_as(client, make_user(db)).post("/api/v1/reports", json=body)
    assert res.status_code == 400 and res.json()["code"] == "VALIDATION_FAILED"
    if field:
        assert res.json()["fieldErrors"][0]["field"] == field


def test_ac_f4_03_report_requires_login(client):
    res = client.post("/api/v1/reports", json={"targetType": "USER", "targetId": 1, "reason": "사유"})
    assert res.status_code in (401, 403)  # CSRF 쿠키도 없으면 CSRF 검사에서 먼저 막힌다


def test_ac_f4_08_warn_report_warns_target_and_suspends_on_third(db, admin_user):
    target = make_user(db)
    for i in range(3):
        rid = _report(db, make_user(db), target)
        rep = service.warn_report(db, rid, actor_id=admin_user.id, reason=f"확인 {i + 1}")
        assert (rep.status, rep.handled_by) == ("WARNED", admin_user.id) and rep.handled_at
    db.expire_all()
    user = db.get(User, target.id)
    assert (user.warning_count, user.status) == (3, "SUSPENDED")
    warns = db.scalars(select(Sanction).where(Sanction.user_id == target.id, Sanction.type == "WARNING")).all()
    assert all(s.report_id for s in warns)
    hist = db.scalars(select(StatusHistory).where(StatusHistory.entity_type == "report")).all()
    assert {(h.from_status, h.to_status) for h in hist} == {("OPEN", "WARNED")}


def test_dismiss_report_does_not_warn(db, admin_user):
    target = make_user(db)
    rid = _report(db, make_user(db), target)
    assert service.dismiss_report(db, rid, actor_id=admin_user.id, reason="사실 아님").status == "DISMISSED"
    db.expire_all()
    assert db.get(User, target.id).warning_count == 0


@pytest.mark.parametrize("second", ["warn_report", "dismiss_report"])
def test_handled_report_cannot_be_handled_again(db, admin_user, second):
    rid = _report(db, make_user(db), make_user(db))
    service.dismiss_report(db, rid, actor_id=admin_user.id, reason="사실 아님")
    with pytest.raises(AppError) as exc:
        getattr(service, second)(db, rid, actor_id=admin_user.id, reason="다시")
    assert exc.value.code == "INVALID_STATE"


def test_warn_report_needs_reason_and_existing_report(db, admin_user):
    rid = _report(db, make_user(db), make_user(db))
    with pytest.raises(AppError) as exc:
        service.warn_report(db, rid, actor_id=admin_user.id, reason=" ")
    assert exc.value.code == "VALIDATION_FAILED"
    with pytest.raises(AppError) as exc:
        service.warn_report(db, 999, actor_id=admin_user.id, reason="사유")
    assert exc.value.code == "NOT_FOUND"


def test_warn_report_on_post_target_points_to_blind(db, admin_user):
    rid = service.report(db, reporter_id=make_user(db).id, target_type="PR_POST", target_id=3, reason="연락처")
    with pytest.raises(AppError) as exc:
        service.warn_report(db, rid, actor_id=admin_user.id, reason="확인")
    assert exc.value.code == "INVALID_STATE"
    assert db.get(Report, rid).status == "OPEN"


def test_admin_report_warn_action(admin_client, db):
    target = make_user(db)
    rid = _report(db, make_user(db), target)
    assert "신고된 회원에게 경고" in admin_client.get(f"/admin/report/action/warn?pks={rid}").text
    res = admin_client.post(f"/admin/reason?op=report_warn&pks={rid}&back=report", data={"reason": "확인됨"}, follow_redirects=False)
    assert res.status_code == 302
    db.expire_all()
    assert db.get(Report, rid).status == "WARNED" and db.get(User, target.id).warning_count == 1


def test_report_admin_requires_admin_login(client, db):
    login_as(client, make_user(db))
    res = client.get("/admin/report/list", follow_redirects=False)
    assert res.status_code in (302, 303)  # 일반 회원 쿠키로는 관리자 로그인 화면으로 보낸다
