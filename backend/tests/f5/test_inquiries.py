"""1:1 문의 (T2-09 #102, FR-CS-01, AC-F5-18~20, D-48). 정지 계정도 문의할 수 있다."""
from itertools import count

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import StoredFile
from app.models.support import Inquiry
from tests.conftest import login_as, make_supplier, make_user

_keys = count(1)


def _photo(db, user, purpose="INQUIRY") -> int:
    """POST /files 를 거친 것과 같은 임시 사진 (attach_files 는 DB 행만 본다)."""
    f = StoredFile(owner_user_id=user.id, purpose=purpose, visibility="PRIVATE", status="TEMP",
                   storage_key=f"inquiry/test-{next(_keys)}.jpg", original_name="a.jpg", mime_type="image/jpeg",
                   size_bytes=100)
    db.add(f)
    db.commit()
    return f.id


def _body(**kw) -> dict:
    return {"category": "ACCOUNT", "performanceId": None, "title": "정지 사유 문의", "body": "정지 사유를 알고 싶어요.",
            "fileIds": [], **kw}


def _as(user) -> TestClient:
    return login_as(TestClient(app), user)


def _write(db, user=None, **kw) -> tuple[TestClient, int]:
    user = user or make_user(db)
    c = _as(user)
    res = c.post("/api/v1/inquiries", json=_body(**kw))
    assert res.status_code == 201, res.text
    return c, res.json()["id"]


def test_ac_f5_18_suspended_supplier_writes_inquiry_with_photo(db):
    supplier = make_supplier(db, review_status="SUSPENDED")
    supplier.user.status = "SUSPENDED"
    db.commit()
    photo = _photo(db, supplier.user)

    c = _as(supplier.user)
    res = c.post("/api/v1/inquiries", json=_body(fileIds=[photo]))

    assert res.status_code == 201, res.text
    out = res.json()
    assert (out["category"], out["status"], out["answer"]) == ("ACCOUNT", "WAITING", None)
    assert out["photos"] == [{"id": photo, "url": f"/api/v1/files/{photo}"}]
    assert db.get(StoredFile, photo).status == "ATTACHED"
    assert [i["id"] for i in c.get("/api/v1/me/inquiries").json()] == [out["id"]]


@pytest.mark.parametrize(("kw", "field"), [
    ({"title": "가" * 51}, "title"),
    ({"body": "가" * 2001}, ""),  # core/errors.py 가 loc 의 "body" 를 모두 빼서 칸 이름이 빈다 — 해원님께 알림
    ({"title": "   "}, "title"),
    ({"category": "REFUND"}, "category"),
])
def test_ac_f5_18_rejects_bad_input(db, kw, field):
    res = _as(make_user(db)).post("/api/v1/inquiries", json=_body(**kw))
    assert res.status_code == 400
    assert field in {e["field"] for e in res.json()["fieldErrors"]}


def test_ac_f5_18_photo_rules(db):
    user = make_user(db)
    c = _as(user)
    four = [_photo(db, user) for _ in range(4)]
    assert c.post("/api/v1/inquiries", json=_body(fileIds=four)).status_code == 400  # 3장까지
    others = _photo(db, make_user(db))
    assert c.post("/api/v1/inquiries", json=_body(fileIds=[others])).status_code == 400  # 남의 사진
    wrong_purpose = _photo(db, user, purpose="COMMUNITY")
    assert c.post("/api/v1/inquiries", json=_body(fileIds=[wrong_purpose])).status_code == 400


def test_ac_f5_18_performance_must_be_mine(db):
    res = _as(make_user(db)).post("/api/v1/inquiries", json=_body(performanceId=999999))
    assert res.status_code == 400
    assert res.json()["fieldErrors"][0]["field"] == "performanceId"


def test_ac_f5_18_login_required(db):
    assert TestClient(app).get("/api/v1/me/inquiries").status_code == 401
    gone = make_user(db, status="WITHDRAWN")
    assert _as(gone).get("/api/v1/me/inquiries").status_code == 401


def test_ac_f5_19_waiting_inquiry_can_be_edited_and_deleted(db):
    user = make_user(db)
    old, new = _photo(db, user), _photo(db, user)
    c, inquiry_id = _write(db, user, fileIds=[old])

    res = c.put(f"/api/v1/inquiries/{inquiry_id}", json=_body(category="ETC", title="고친 제목", fileIds=[new]))
    assert res.status_code == 200, res.text
    assert (res.json()["category"], res.json()["title"], [p["id"] for p in res.json()["photos"]]) == ("ETC", "고친 제목", [new])
    db.expire_all()
    assert db.get(StoredFile, old).status == "DELETED"

    assert c.delete(f"/api/v1/inquiries/{inquiry_id}").status_code == 204
    assert c.get(f"/api/v1/inquiries/{inquiry_id}").status_code == 404


def test_ac_f5_19_admin_answer_locks_inquiry(db, admin_client):
    c, inquiry_id = _write(db)

    res = admin_client.post(f"/admin/reason?op=inquiry_answer&pks={inquiry_id}&back=inquiry",
                            data={"reason": "운영 정책 3조 위반으로 정지됐어요."}, follow_redirects=False)
    assert res.status_code == 302

    out = c.get(f"/api/v1/inquiries/{inquiry_id}").json()
    assert (out["status"], out["answer"]) == ("ANSWERED", "운영 정책 3조 위반으로 정지됐어요.")
    assert out["answeredAt"] is not None
    for res in (c.put(f"/api/v1/inquiries/{inquiry_id}", json=_body()), c.delete(f"/api/v1/inquiries/{inquiry_id}")):
        assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")


def test_ac_f5_19_admin_list_has_answer_button_per_row(db, admin_client):
    """체크박스 → 작업 메뉴를 거치지 않게 행마다 [답변]. 답변 뒤에는 버튼이 없다."""
    _, inquiry_id = _write(db)
    link = f"/admin/reason?op=inquiry_answer&pks={inquiry_id}&back=inquiry"
    assert link in admin_client.get("/admin/inquiry/list").text
    admin_client.post(f"/admin/reason?op=inquiry_answer&pks={inquiry_id}&back=inquiry", data={"reason": "답변"})
    assert link not in admin_client.get("/admin/inquiry/list").text


def test_ac_f5_19_answer_needs_text_and_only_once(db, admin_client):
    _, inquiry_id = _write(db)
    admin_client.post(f"/admin/reason?op=inquiry_answer&pks={inquiry_id}&back=inquiry", data={"reason": "  "})
    db.expire_all()
    assert db.get(Inquiry, inquiry_id).status == "WAITING"  # 빈 답변은 저장하지 않는다

    for text in ("첫 답변", "두 번째 답변"):
        admin_client.post(f"/admin/reason?op=inquiry_answer&pks={inquiry_id}&back=inquiry", data={"reason": text})
    db.expire_all()
    assert db.get(Inquiry, inquiry_id).answer == "첫 답변"


def test_ac_f5_20_other_members_inquiry_is_404(db):
    _, inquiry_id = _write(db)
    for other in (make_user(db), make_supplier(db, review_status="APPROVED").user):
        c = _as(other)
        assert c.get(f"/api/v1/inquiries/{inquiry_id}").status_code == 404
        assert c.put(f"/api/v1/inquiries/{inquiry_id}", json=_body()).status_code == 404
        assert c.delete(f"/api/v1/inquiries/{inquiry_id}").status_code == 404
        assert c.get("/api/v1/me/inquiries").json() == []
    assert db.get(Inquiry, inquiry_id) is not None
