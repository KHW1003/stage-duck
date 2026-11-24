"""중요 알림을 메일로도 (specs/notifications.md 10장)."""
import pytest

from app.core import mail
from app.core.config import get_settings
from app.notification import mailer
from app.notification import service as notification
from tests.conftest import login_as, make_user

API = "/api/v1/me/notifications/settings"


@pytest.fixture()
def sent(monkeypatch):
    box: list[tuple[str, str, str]] = []
    monkeypatch.setattr(mail, "send_mail", lambda to, subject, text, **kw: box.append((to, subject, text)))
    return box


def test_important_notification_is_mailed_after_commit_with_link(db, sent):
    user = make_user(db, email="host@example.com")
    notification.notify(db, user.id, "INVOICE_READY", link="/performances/5/order", params={"amount": "1,942,500"})
    assert sent == []  # 커밋 전에는 보내지 않는다
    db.commit()
    [(to, subject, text)] = sent
    assert to == "host@example.com"
    assert subject == "[STAGE DUCK] 통합 청구서가 발행되었습니다"
    assert "합계 1,942,500원" in text
    assert f"{get_settings().public_base_url}/performances/5/order" in text
    assert "[알림] 화면에서 끄실 수 있습니다" in text


def test_rolled_back_or_minor_notifications_are_not_mailed(db, sent):
    user = make_user(db, email="host@example.com")
    notification.notify(db, user.id, "PAID", link="/x", params={"title": "공연"})
    db.rollback()
    notification.notify(db, user.id, "COMMUNITY_COMMENT", link="/x", params={"title": "글", "snippet": "댓글"})
    db.commit()
    assert sent == []


def test_user_can_turn_mail_off_and_on(client, db, sent):
    user = make_user(db, email="host@example.com")
    c = login_as(client, user)
    assert c.get(API).json() == {"emailEnabled": True, "email": "host@example.com"}

    assert c.put(API, json={"emailEnabled": False}).json()["emailEnabled"] is False
    notification.notify(db, user.id, "PAID", link="/x", params={"title": "공연"})
    db.commit()
    assert sent == []

    c.put(API, json={"emailEnabled": True})
    db.expire_all()
    notification.notify(db, user.id, "PAID", link="/x", params={"title": "공연"})
    db.commit()
    assert len(sent) == 1


def test_demo_test_addresses_are_skipped_only_when_really_sending(db, sent, monkeypatch):
    user = make_user(db, email="demo@stageduck.test")
    monkeypatch.setattr(get_settings(), "mail_backend", "smtp")
    notification.notify(db, user.id, "PAID", link="/x", params={"title": "공연"})
    db.commit()
    assert sent == []


def test_mail_types_all_have_templates():
    from app.notification.templates import TEMPLATES

    assert mailer.MAIL_TYPES <= TEMPLATES.keys()
