"""파일 업로드·내려받기·붙이기·정리 (uploads.md, D-51). 다른 묶음은 이 파일의 함수만 쓴다 (CLAUDE.md 5장).

흐름: 화면이 먼저 올린다(upload → TEMP) → 글·공간·문의를 저장하는 서비스가 attach_files 로 붙인다(ATTACHED).
붙지 않은 TEMP 는 24시간 뒤 purge_temp_files 가 지운다 (스케줄러 등록은 plan.md 5.7 담당이 한다).
"""
import io
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, invalid_state, not_found
from app.files import calc
from app.models.file import StoredFile
from app.models.user import User

# 크기 폭탄은 calc.is_pixel_bomb 으로 먼저 거른다. Pillow 기본 경고 한도는 그보다 넉넉하게 둔다.
Image.MAX_IMAGE_PIXELS = calc.MAX_PIXEL_SUM * calc.MAX_PIXEL_SUM // 4

_PIL_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


SUSPENDED_PURPOSE = "INQUIRY"  # 정지 계정이 올릴 수 있는 유일한 용도 (uploads.md 6장)

def _bad_file(message: str) -> AppError:
    return AppError(400, "VALIDATION_FAILED", message, [{"field": "file", "reason": message}])


def _bad_ids(message: str) -> AppError:
    return AppError(400, "VALIDATION_FAILED", message, [{"field": "fileIds", "reason": message}])


def _root() -> Path:
    return Path(get_settings().upload_dir)


def _path(key: str) -> Path:
    return _root() / key


def _remove(*keys: str | None) -> None:
    for key in keys:
        if key:
            _path(key).unlink(missing_ok=True)


def remove_stored(f: StoredFile) -> None:
    """[1번 프로필용] DELETED 로 바꿔 커밋한 뒤 디스크에서 지운다 (uploads.md 1장: 사진을 빼면 지운다)."""
    _remove(f.storage_key, f.thumb_key)


def file_url(f: StoredFile) -> str:
    return calc.public_url(f.storage_key) if f.visibility == "PUBLIC" else f"/api/v1/files/{f.id}"


def thumb_url(f: StoredFile) -> str:
    return calc.public_url(f.thumb_key) if f.visibility == "PUBLIC" and f.thumb_key else file_url(f)


def _encode(img: Image.Image, ext: str) -> bytes:
    """EXIF·GPS·기기 정보 없이 다시 저장한다 (exif 인자를 넘기지 않으면 Pillow 가 쓰지 않는다)."""
    out = io.BytesIO()
    if ext == "webp":
        img.save(out, "WEBP", quality=80)
    else:
        if img.mode != "RGB":
            background = Image.new("RGB", img.size, "white")
            background.paste(img, mask=img.getchannel("A") if "A" in img.getbands() else None)
            img = background
        img.save(out, "JPEG", quality=85)
    return out.getvalue()


def _resized(img: Image.Image, max_side: int) -> Image.Image:
    size = calc.fit_within(img.width, img.height, max_side)
    return img if size == img.size else img.resize(size, Image.Resampling.LANCZOS)


def _process_image(data: bytes, sniffed: str, rule: calc.Rule, ext: str) -> tuple[bytes, bytes | None, int, int]:
    """진짜 사진인지 Pillow 로 열어 확인 → 방향 맞추기 → 1600px·480px 로 줄여 다시 저장 (uploads.md 4장)."""
    try:
        with Image.open(io.BytesIO(data)) as src:
            if _PIL_FORMATS.get(src.format or "") != sniffed:
                raise _bad_file(calc.format_message(rule))
            if calc.is_pixel_bomb(src.width, src.height):
                raise _bad_file("사진이 너무 커요. 가로·세로를 줄여서 올려 주세요.")
            src.seek(0)  # 움직이는 webp 는 첫 장만 쓴다
            img = ImageOps.exif_transpose(src)
            img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError, ValueError):
        raise _bad_file(calc.format_message(rule)) from None
    main = _resized(img, calc.MAX_SIDE)
    thumb = _encode(_resized(img, calc.THUMB_SIDE), ext) if rule.public else None
    return _encode(main, ext), thumb, main.width, main.height


def upload(db: Session, user: User, *, purpose: str, filename: str | None, stream: BinaryIO, now: datetime) -> StoredFile:
    """D-51: 용도별 형식·크기 검사, 사진은 위치 정보를 지우고 크기를 줄여 저장. 상태는 TEMP.

    정지 계정은 1:1 문의 사진(INQUIRY)만 올린다 (uploads.md 6장, AC-F5-18).
    """
    if user.status == "SUSPENDED" and purpose != SUSPENDED_PURPOSE:
        raise AppError(403, "ACCOUNT_SUSPENDED", "이용이 정지된 계정은 1:1 문의 사진만 올릴 수 있어요.")
    rule = calc.RULES.get(purpose)
    if rule is None:
        msg = "올릴 곳을 다시 골라 주세요."
        raise AppError(400, "VALIDATION_FAILED", msg, [{"field": "purpose", "reason": msg}])

    recent = db.scalar(
        select(func.count())
        .select_from(StoredFile)
        .where(StoredFile.owner_user_id == user.id, StoredFile.created_at > now - timedelta(seconds=calc.RATE_LIMIT_SECONDS))
    )
    if recent >= calc.RATE_LIMIT_COUNT:
        raise AppError(429, "UPLOAD_RATE_LIMITED", "잠시 뒤에 다시 올려 주세요. 1분에 30개까지 올릴 수 있어요.")

    data = stream.read(rule.max_bytes + 1)
    if len(data) > rule.max_bytes:
        raise AppError(413, "FILE_TOO_LARGE", calc.size_message(rule))
    sniffed = calc.sniff(data[:16])
    if sniffed not in rule.formats:
        raise _bad_file(calc.format_message(rule))

    ext = calc.saved_ext(rule, sniffed)
    if sniffed == "pdf":
        main, thumb, width, height = data, None, None, None
    else:
        main, thumb, width, height = _process_image(data, sniffed, rule, ext)

    key, thumb_key = calc.storage_keys(purpose, rule.public, uuid.uuid4().hex, ext, now, thumb is not None)
    for k, body in ((key, main), (thumb_key, thumb)):
        if k and body is not None:
            _path(k).parent.mkdir(parents=True, exist_ok=True)
            _path(k).write_bytes(body)

    f = StoredFile(
        owner_user_id=user.id,
        purpose=purpose,
        visibility="PUBLIC" if rule.public else "PRIVATE",
        status="TEMP",
        storage_key=key,
        thumb_key=thumb_key,
        original_name=(Path(filename or "").name or "file")[:255],
        mime_type=calc.MIME[ext],
        size_bytes=len(main),
        width=width,
        height=height,
        created_at=now,
    )
    db.add(f)
    try:
        db.commit()
    except Exception:
        _remove(key, thumb_key)  # DB에 못 남겼으면 디스크에도 남기지 않는다
        raise
    return f


def _readable(db: Session, f: StoredFile, user: User) -> bool:
    """비공개 파일: 올린 사람과 관리자. 채팅 파일은 그 방 참여자도 — 판단은 채팅 서비스가 한다 (3번 #42).

    정지 계정은 자기 파일만 (1:1 문의에 붙인 사진 보기).
    """
    if f.owner_user_id == user.id or user.role == "ADMIN":
        return True
    if user.status == "SUSPENDED":
        return False
    if f.purpose == "CHAT":
        from app.chat import service as chat_service  # 채팅 서비스가 이 모듈을 부르므로 여기서 가져온다 (순환 import 방지)

        return chat_service.can_read_chat_file(db, user, f.id)
    return False


def get_private_file(db: Session, user: User, file_id: int) -> tuple[Path, StoredFile]:
    """GET /files/{id}: 비공개 파일 내려받기. 남의 것·지운 것·공개 파일(→ /media 주소)은 404."""
    f = db.get(StoredFile, file_id)
    if f is None or f.status == "DELETED" or f.visibility != "PRIVATE" or not _readable(db, f, user):
        raise not_found()
    path = _path(f.storage_key)
    if not path.is_file():
        raise not_found()
    return path, f


def delete_temp(db: Session, user: User, file_id: int) -> None:
    """DELETE /files/{id}: 올렸다가 뺀 사진을 바로 지운다. 본인의 TEMP 만."""
    f = db.get(StoredFile, file_id, with_for_update=True)
    if f is None or f.owner_user_id != user.id or f.status == "DELETED":
        raise not_found()
    if f.status != "TEMP":
        raise invalid_state("글에 붙은 파일은 여기서 지울 수 없어요. 글을 고쳐서 빼 주세요.")
    f.status = "DELETED"
    db.commit()
    _remove(f.storage_key, f.thumb_key)


def attach_files(db: Session, *, owner_id: int, file_ids: list[int], purpose: str, now: datetime) -> list[StoredFile]:
    """[다른 묶음용] 글·공간·문의를 저장할 때 fileIds 를 붙인다. 커밋하지 않는다 — 부른 서비스가 같은 트랜잭션에서 커밋한다.

    내 TEMP 파일이 아니거나, 용도가 다르거나, 개수를 넘으면 400 VALIDATION_FAILED (field fileIds).
    돌려주는 순서 = file_ids 순서 (보여 주는 순서).
    """
    rule = calc.RULES[purpose]
    if len(file_ids) > rule.max_count:
        raise _bad_ids(f"{rule.max_count}개까지 올릴 수 있어요.")
    if len(set(file_ids)) != len(file_ids):
        raise _bad_ids("같은 파일이 두 번 들어 있어요.")
    if not file_ids:
        return []
    found = {
        f.id: f
        for f in db.scalars(select(StoredFile).where(StoredFile.id.in_(file_ids)).with_for_update())
    }
    files = [found.get(i) for i in file_ids]
    if any(f is None or f.owner_user_id != owner_id or f.status != "TEMP" or f.purpose != purpose for f in files):
        raise _bad_ids("올린 파일을 다시 확인해 주세요.")
    for f in files:
        f.status = "ATTACHED"
        f.attached_at = now
    return files


def purge_temp_files(db: Session, *, now: datetime) -> int:
    """24시간 지난 TEMP 를 디스크에서 지우고 DELETED 로 바꾼다. 지운 개수를 돌려준다 (스케줄러가 1시간마다 부른다)."""
    old = list(
        db.scalars(
            select(StoredFile).where(
                StoredFile.status == "TEMP", StoredFile.created_at < now - timedelta(hours=calc.TEMP_TTL_HOURS)
            )
        )
    )
    for f in old:
        f.status = "DELETED"
    db.commit()
    for f in old:
        _remove(f.storage_key, f.thumb_key)
    return len(old)
