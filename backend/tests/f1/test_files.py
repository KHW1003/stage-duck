"""파일 업로드 (#29, uploads.md 8장, D-51)."""
import io
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.core.errors import AppError
from app.files import service
from app.main import create_app
from app.models import StoredFile
from tests.conftest import login_as, make_supplier, make_user

URL = "/api/v1/files"
NOW = datetime(2026, 11, 17, 12, 0)
GPS_IFD = 0x8825


def _image(fmt: str, size=(40, 30), *, gps: bool = False, mode: str = "RGB") -> bytes:
    img = Image.new(mode, size, "red")
    out = io.BytesIO()
    kw = {}
    if gps:
        exif = img.getexif()
        exif[0x010F] = "가상카메라"  # Make
        exif.get_ifd(GPS_IFD).update({1: "N", 2: (35.0, 9.0, 0.0), 3: "E", 4: (126.0, 55.0, 0.0)})
        kw["exif"] = exif
    img.save(out, fmt, **kw)
    return out.getvalue()


PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture
def root(tmp_path, monkeypatch) -> Path:
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
def api(root) -> TestClient:
    """업로드 폴더를 임시 폴더로 바꾼 앱 (/media 도 그 폴더를 본다)."""
    return TestClient(create_app())


def _post(client, data: bytes, purpose: str, name="photo.jpg", ctype="image/jpeg"):
    return client.post(URL, files={"file": (name, data, ctype)}, data={"purpose": purpose})


def _upload(db, user, purpose, data, now=NOW) -> StoredFile:
    return service.upload(db, user, purpose=purpose, filename="a.png", stream=io.BytesIO(data), now=now)


# --- 올리기 ---------------------------------------------------------------


def test_public_photo_loses_gps_and_is_resized_to_1600(api, db, root):
    """uploads.md 4장: GPS가 든 3000×2000 jpg → 위치 정보 없이 1600×1067 webp + 480px 썸네일, /media 로 열린다."""
    user = make_user(db)
    original = _image("JPEG", (3000, 2000), gps=True)
    with Image.open(io.BytesIO(original)) as src:
        assert src.getexif().get_ifd(GPS_IFD)  # 올리는 사진에는 위치 정보가 있다
    res = _post(login_as(api, user), original, "VENUE")
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["width"], body["height"]) == (1600, 1067)
    assert body["url"].startswith("/media/venue/")
    assert body["url"].endswith(".webp") and body["thumbUrl"].endswith("_t.webp")

    f = db.get(StoredFile, body["id"])
    assert (f.status, f.visibility, f.mime_type, f.owner_user_id) == ("TEMP", "PUBLIC", "image/webp", user.id)
    with Image.open(root / f.storage_key) as saved:
        assert saved.format == "WEBP"
        assert len(saved.getexif()) == 0 and not saved.getexif().get_ifd(GPS_IFD)
    with Image.open(root / f.thumb_key) as thumb:
        assert max(thumb.size) == 480

    page = api.get(body["url"])
    assert page.status_code == 200 and page.headers["content-type"] == "image/webp"


def test_small_photo_is_not_enlarged(api, db):
    res = _post(login_as(api, make_user(db)), _image("PNG", (300, 200)), "PR_POST", "a.png", "image/png")
    assert res.status_code == 201
    assert (res.json()["width"], res.json()["height"]) == (300, 200)


@pytest.mark.parametrize(
    ("data", "name", "ctype"),
    [
        (b"MZ\x90\x00 not an image", "virus.jpg", "image/jpeg"),  # 확장자만 .jpg
        (b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "a.svg", "image/svg+xml"),
        (b"GIF89a\x01\x00\x01\x00", "a.gif", "image/gif"),
        (b"\xff\xd8\xff\xe0 broken jpeg", "broken.jpg", "image/jpeg"),  # 앞부분만 jpg
    ],
    ids=["fake-jpg", "svg", "gif", "broken-jpg"],
)
def test_not_a_real_photo_is_rejected(api, db, root, data, name, ctype):
    res = _post(login_as(api, make_user(db)), data, "VENUE", name, ctype)
    assert res.status_code == 400
    assert res.json()["fieldErrors"] == [{"field": "file", "reason": "jpg·png·webp 파일만 올릴 수 있어요."}]
    assert db.query(StoredFile).count() == 0 and not any(root.rglob("*.*"))


def test_pdf_is_only_for_purposes_that_allow_it(api, db):
    client = login_as(api, make_user(db))
    assert _post(client, PDF, "VENUE", "a.pdf", "application/pdf").status_code == 400
    assert _post(client, PDF, "CHAT", "a.pdf", "application/pdf").status_code == 201


@pytest.mark.parametrize(("purpose", "limit_mb"), [("VENUE", 10), ("PROFILE", 5), ("INQUIRY", 5)])
def test_too_large_is_413_with_limit(api, db, purpose, limit_mb):
    """경계: 한도 + 1바이트 → 413 FILE_TOO_LARGE."""
    data = b"\xff\xd8\xff" + b"\0" * (limit_mb * 1024 * 1024 - 2)
    res = _post(login_as(api, make_user(db)), data, purpose)
    assert res.status_code == 413
    assert res.json()["code"] == "FILE_TOO_LARGE"
    assert res.json()["message"] == f"{limit_mb}MB 이하 파일만 올릴 수 있어요."


def test_pixel_bomb_is_rejected(api, db):
    """가로 + 세로 20,001px → 400 (파일은 작아도 펼치면 큰 사진)."""
    res = _post(login_as(api, make_user(db)), _image("PNG", (20_000, 1), mode="L"), "VENUE", "a.png", "image/png")
    assert res.status_code == 400


def test_unknown_purpose_and_login_required(api, db):
    assert _post(login_as(api, make_user(db)), _image("PNG"), "MEME").json()["fieldErrors"][0]["field"] == "purpose"
    anonymous = TestClient(api.app)
    anonymous.cookies.set("csrf_token", "t")
    anonymous.headers["X-CSRF-Token"] = "t"
    assert _post(anonymous, _image("PNG"), "VENUE").status_code == 401


def test_rate_limit_31st_upload_in_a_minute(db, root):
    user = make_user(db)
    for i in range(30):
        _upload(db, user, "PR_POST", _image("PNG", (8, 8)), NOW + timedelta(seconds=i))
    with pytest.raises(AppError) as exc:
        _upload(db, user, "PR_POST", _image("PNG", (8, 8)), NOW + timedelta(seconds=30))
    assert (exc.value.status, exc.value.code) == (429, "UPLOAD_RATE_LIMITED")
    assert _upload(db, user, "PR_POST", _image("PNG", (8, 8)), NOW + timedelta(seconds=61)).id  # 1분 지나면 다시


# --- 비공개 파일 -----------------------------------------------------------


def test_business_doc_is_private_owner_and_admin_only(api, db, root):
    """남의 사업자등록증 주소 → 404. /media 로는 나가지 않는다."""
    owner = make_supplier(db).user
    res = _post(login_as(api, owner), PDF, "BUSINESS_DOC", "등록증.pdf", "application/pdf")
    assert res.status_code == 201
    file_id = res.json()["id"]
    assert res.json()["url"] == res.json()["thumbUrl"] == f"/api/v1/files/{file_id}"
    assert not (root / "public").exists()

    mine = api.get(f"{URL}/{file_id}")
    assert mine.status_code == 200 and mine.content == PDF
    assert mine.headers["content-type"] == "application/pdf"
    assert mine.headers["cache-control"] == "private, no-store"

    assert login_as(TestClient(api.app), make_user(db)).get(f"{URL}/{file_id}").status_code == 404
    assert login_as(TestClient(api.app), make_supplier(db).user).get(f"{URL}/{file_id}").status_code == 404
    assert login_as(TestClient(api.app), make_user(db, role="ADMIN")).get(f"{URL}/{file_id}").status_code == 200


def test_private_photo_is_saved_as_jpg_without_thumb(api, db, root):
    res = _post(login_as(api, make_user(db)), _image("PNG", mode="RGBA"), "INQUIRY", "a.png", "image/png")
    f = db.get(StoredFile, res.json()["id"])
    assert (f.visibility, f.mime_type, f.thumb_key) == ("PRIVATE", "image/jpeg", None)
    assert f.storage_key.startswith("private/inquiry/") and (root / f.storage_key).is_file()


def test_ac_f5_18_suspended_user_uploads_only_inquiry_photos(api, db):
    """uploads.md 6장: 정지 계정은 1:1 문의 사진(INQUIRY)만 올리고, 자기 파일만 보고 지운다."""
    user = make_user(db, status="SUSPENDED")
    c = login_as(api, user)

    res = _post(c, _image("PNG"), "INQUIRY", "a.png", "image/png")
    assert res.status_code == 201, res.text
    assert c.get(f"{URL}/{res.json()['id']}").status_code == 200
    assert c.delete(f"{URL}/{res.json()['id']}").status_code == 204

    other = _post(c, _image("PNG"), "PROFILE", "a.png", "image/png")
    assert other.status_code == 403
    assert other.json()["code"] == "ACCOUNT_SUSPENDED"


def test_public_file_is_not_served_by_files_api(api, db):
    res = _post(login_as(api, make_user(db)), _image("PNG"), "VENUE", "a.png", "image/png")
    assert api.get(f"{URL}/{res.json()['id']}").status_code == 404  # 공개 사진은 /media 주소로


# --- 지우기 ----------------------------------------------------------------


def test_delete_own_temp_removes_disk_files(api, db, root):
    user = make_user(db)
    res = _post(login_as(api, user), _image("PNG"), "VENUE", "a.png", "image/png")
    f = db.get(StoredFile, res.json()["id"])
    keys = [f.storage_key, f.thumb_key]

    assert login_as(TestClient(api.app), make_user(db)).delete(f"{URL}/{f.id}").status_code == 404  # 남의 것
    assert api.delete(f"{URL}/{f.id}").status_code == 204
    db.refresh(f)
    assert f.status == "DELETED" and not any((root / k).exists() for k in keys)
    assert api.get(res.json()["url"]).status_code == 404
    assert api.delete(f"{URL}/{f.id}").status_code == 404


def test_attached_file_cannot_be_deleted_here(api, db):
    user = make_user(db)
    f = _upload(db, user, "VENUE", _image("PNG"))
    service.attach_files(db, owner_id=user.id, file_ids=[f.id], purpose="VENUE", now=NOW)
    db.commit()
    assert login_as(api, user).delete(f"{URL}/{f.id}").status_code == 409


# --- 붙이기 (다른 묶음용) ---------------------------------------------------


def test_attach_marks_attached_in_given_order(db, root):
    user = make_user(db)
    a, b = (_upload(db, user, "PR_POST", _image("PNG")) for _ in range(2))
    files = service.attach_files(db, owner_id=user.id, file_ids=[b.id, a.id], purpose="PR_POST", now=NOW)
    db.commit()
    assert [f.id for f in files] == [b.id, a.id]
    assert {(f.status, f.attached_at) for f in files} == {("ATTACHED", NOW)}


def test_attach_refuses_wrong_files(db, root):
    """남의 TEMP 파일, 다른 용도(COMMUNITY → PR 게시글), 이미 붙은 파일, 없는 id, 중복, 개수 초과 → 400."""
    me, other = make_user(db), make_user(db)
    mine = _upload(db, me, "PR_POST", _image("PNG"))
    others = _upload(db, other, "PR_POST", _image("PNG"))
    community = _upload(db, me, "COMMUNITY", _image("PNG"))
    used = _upload(db, me, "PR_POST", _image("PNG"))
    service.attach_files(db, owner_id=me.id, file_ids=[used.id], purpose="PR_POST", now=NOW)
    db.commit()
    profile = [_upload(db, me, "PROFILE", _image("PNG")) for _ in range(2)]

    cases = [
        ([others.id], "PR_POST"),
        ([community.id], "PR_POST"),
        ([used.id], "PR_POST"),
        ([999_999], "PR_POST"),
        ([mine.id, mine.id], "PR_POST"),
        ([p.id for p in profile], "PROFILE"),  # 프로필 사진은 1장
    ]
    for ids, purpose in cases:
        with pytest.raises(AppError) as exc:
            service.attach_files(db, owner_id=me.id, file_ids=ids, purpose=purpose, now=NOW)
        assert (exc.value.status, exc.value.field_errors[0]["field"]) == (400, "fileIds"), ids
        db.rollback()
    db.refresh(mine)
    assert mine.status == "TEMP"


# --- 정리 -----------------------------------------------------------------


def test_purge_deletes_only_temp_older_than_24h(db, root):
    user = make_user(db)
    old = _upload(db, user, "VENUE", _image("PNG"), NOW - timedelta(hours=25))
    fresh = _upload(db, user, "VENUE", _image("PNG"), NOW - timedelta(hours=23))
    kept = _upload(db, user, "VENUE", _image("PNG"), NOW - timedelta(hours=48))
    service.attach_files(db, owner_id=user.id, file_ids=[kept.id], purpose="VENUE", now=NOW)
    db.commit()

    assert service.purge_temp_files(db, now=NOW) == 1
    for f in (old, fresh, kept):
        db.refresh(f)
    assert (old.status, fresh.status, kept.status) == ("DELETED", "TEMP", "ATTACHED")
    assert not (root / old.storage_key).exists() and (root / fresh.storage_key).exists()
