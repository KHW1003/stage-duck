"""실제 메일 보내기 (MAIL_BACKEND=smtp, app/core/mail.py) — 비밀번호 재설정 링크 (FR-AUTH-09, D-55 후속)."""
import smtplib

import pytest

from app.core import mail
from app.core.config import get_settings
from tests.conftest import make_user
from tests.f1.test_password_reset import NOW, OLD_PW, REQ, clock  # noqa: F401 (픽스처)


class FakeSMTP:
    """smtplib.SMTP·SMTP_SSL 자리. 보낸 메일과 호출 순서를 적어 둔다."""

    sent: list = []
    calls: list = []
    fail = False

    def __init__(self, host, port, timeout=None, context=None):
        FakeSMTP.calls.append(("connect", type(self).__name__, host, port))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self, context=None):
        FakeSMTP.calls.append(("starttls",))

    def login(self, user, password):
        FakeSMTP.calls.append(("login", user))

    def send_message(self, msg):
        if FakeSMTP.fail:
            raise smtplib.SMTPAuthenticationError(535, b"bad credentials")
        FakeSMTP.sent.append(msg)


class FakeSMTPSSL(FakeSMTP):
    pass


@pytest.fixture
def smtp(monkeypatch):
    """smtp 로 켜고, 보내기를 같은 스레드에서 바로 (테스트가 기다릴 수 있게)."""
    s = get_settings()
    for k, v in {
        "mail_backend": "smtp", "smtp_host": "smtp.example.test", "smtp_port": 587, "smtp_user": "mailer",
        "smtp_password": "app-password", "smtp_starttls": True, "mail_from": "no-reply@stageduck.test",
        "public_base_url": "https://demo.stageduck.test",
    }.items():
        monkeypatch.setattr(s, k, v)
    FakeSMTP.sent, FakeSMTP.calls, FakeSMTP.fail = [], [], False
    monkeypatch.setattr(mail.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL", FakeSMTPSSL)

    class SyncThread:
        def __init__(self, target, args=(), **kw):
            self.target, self.args = target, args

        def start(self):
            self.target(*self.args)

    monkeypatch.setattr(mail.threading, "Thread", SyncThread)
    return s


def test_smtp_sends_reset_link_mail_and_no_demo_link(client, db, clock, smtp):
    user = make_user(db, password=OLD_PW)

    res = client.post(REQ, json={"email": user.email})

    assert res.status_code == 202 and res.json() == {"demoLink": None}  # 메일로 가니 화면에는 링크 없음
    assert [c[0] for c in FakeSMTP.calls] == ["connect", "starttls", "login"]
    (msg,) = FakeSMTP.sent
    assert msg["To"] == user.email and msg["Subject"] == "[STAGE DUCK] 비밀번호 재설정 링크"
    assert "no-reply@stageduck.test" in msg["From"] and "STAGE DUCK" in msg["From"]
    body = msg.get_content()
    assert "https://demo.stageduck.test/password/reset?token=" in body and "30분" in body


def test_port_465_uses_ssl(client, db, clock, smtp, monkeypatch):
    monkeypatch.setattr(smtp, "smtp_port", 465)
    user = make_user(db, password=OLD_PW)
    client.post(REQ, json={"email": user.email})
    assert FakeSMTP.calls[0][:2] == ("connect", "FakeSMTPSSL") and ("starttls",) not in FakeSMTP.calls
    assert len(FakeSMTP.sent) == 1


def test_unknown_email_gets_no_mail_and_same_response(client, db, clock, smtp):
    res = client.post(REQ, json={"email": "nobody@stageduck.test"})
    assert res.status_code == 202 and res.json() == {"demoLink": None}
    assert FakeSMTP.sent == []


def test_smtp_failure_keeps_same_response(client, db, clock, smtp):
    FakeSMTP.fail = True
    user = make_user(db, password=OLD_PW)
    res = client.post(REQ, json={"email": user.email})
    assert res.status_code == 202 and res.json() == {"demoLink": None}


def test_smtp_without_host_does_not_send(client, db, clock, smtp, monkeypatch):
    monkeypatch.setattr(smtp, "smtp_host", "")
    user = make_user(db, password=OLD_PW)
    assert client.post(REQ, json={"email": user.email}).status_code == 202
    assert FakeSMTP.calls == []


def test_console_backend_logs_instead_of_sending(client, db, clock, monkeypatch, caplog):
    monkeypatch.setattr(get_settings(), "mail_backend", "console")
    called = []
    monkeypatch.setattr(mail.smtplib, "SMTP", lambda *a, **k: called.append(a))
    user = make_user(db, password=OLD_PW)
    with caplog.at_level("WARNING", logger="stageduck.mail"):
        client.post(REQ, json={"email": user.email})
    assert called == [] and "[메일 대신 로그]" in caplog.text
