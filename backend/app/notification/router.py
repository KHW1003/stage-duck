"""내 알림 API (specs/notifications.md 5장, 이슈 #45). 로그인한 누구나 (사용자·업체·관리자)."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.core.db import get_db
from app.models.user import User
from app.notification import service

router = APIRouter(prefix="/me/notifications", tags=["notification"])

_CFG = ConfigDict(alias_generator=to_camel, populate_by_name=True)
Category = Literal["QUOTE_CHAT", "OFFER", "POSTING", "PAYMENT", "ADMIN", "COMMUNITY"]


def get_now() -> datetime:
    return datetime.now()


class NotificationOut(BaseModel):
    model_config = _CFG

    id: int
    type: str
    category: str
    title: str
    body: str | None
    link: str
    read: bool
    created_at: datetime


class NotificationPage(BaseModel):
    model_config = _CFG

    items: list[NotificationOut]
    next_before: int | None
    unread_count: int


class CountOut(BaseModel):
    count: int


class ReadIn(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=200)
    all: bool = False


@router.get("", response_model=NotificationPage)
def list_notifications(
    category: Category | None = None,
    before: int | None = Query(default=None, ge=1),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    now: datetime = Depends(get_now),
) -> NotificationPage:
    rows, next_before = service.list_mine(db, user.id, category=category, before=before, now=now)
    return NotificationPage(
        items=[
            NotificationOut(
                id=n.id, type=n.type, category=n.category, title=n.title, body=n.body, link=n.link,
                read=n.read_at is not None, created_at=n.created_at,
            )
            for n in rows
        ],
        next_before=next_before,
        unread_count=service.unread_count(db, user.id),
    )


@router.get("/unread-count", response_model=CountOut)
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)) -> CountOut:
    return CountOut(count=service.unread_count(db, user.id))


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def read(
    body: ReadIn, user: User = Depends(current_user), db: Session = Depends(get_db), now: datetime = Depends(get_now),
) -> Response:
    service.mark_read(db, user.id, ids=body.ids, all_=body.all, now=now)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
