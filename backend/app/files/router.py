"""파일 업로드 API (uploads.md 6장, api-contract.md 3.1, 이슈 #29)."""
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.core.db import get_db
from app.files import service
from app.files.schemas import FileOut
from app.models.user import User

router = APIRouter(prefix="/files", tags=["files"])


@router.post("", response_model=FileOut, status_code=status.HTTP_201_CREATED)
def upload(
    file: UploadFile = File(...),
    purpose: str = Form(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FileOut:
    """D-51: 먼저 올려서 id 를 받고, 글을 저장할 때 fileIds 로 붙인다. 비공개 파일의 url 은 /api/v1/files/{id}."""
    f = service.upload(db, user, purpose=purpose, filename=file.filename, stream=file.file, now=datetime.now())
    return FileOut(id=f.id, url=service.file_url(f), thumb_url=service.thumb_url(f), width=f.width, height=f.height)


@router.get("/{file_id}")
def download(file_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> FileResponse:
    """비공개 파일(사업자등록증·문의·채팅) 내려받기. 남의 것은 404 (CLAUDE.md 10)."""
    path, f = service.get_private_file(db, user, file_id)
    return FileResponse(
        path,
        media_type=f.mime_type,
        filename=f.original_name,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(file_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    """올렸다가 뺀 사진 지우기. 본인의 TEMP 만."""
    service.delete_temp(db, user, file_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
