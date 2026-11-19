"""메일 보내기 (D-55 후속). MAIL_BACKEND 로 고른다.

- console (기본): 보내지 않고 서버 로그에 남긴다 — 로컬·테스트
- smtp: SMTP 서버로 보낸다 (Gmail 앱 비밀번호·AWS SES SMTP 등). 값은 서버 .env 에만 둔다 (deploy/env.prod.example)
  - 465 = SSL, 그 밖(587 등)은 STARTTLS (SMTP_STARTTLS=false 로 끌 수 있음)
보내기는 요청 스레드 밖(백그라운드 스레드)에서 한다 — 응답 시간으로 가입 여부를 알 수 없게 하고, 메일 서버가 느려도 화면이 기다리지 않게.
실패해도 사용자 응답은 같다 (로그에만 남긴다). 받는 주소·링크는 로그에 남기지 않는다 (SMTP 일 때).
"""
import logging
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import Settings, get_settings

log = logging.getLogger("stageduck.mail")


def build_message(settings: Settings, to: str, subject: str, text: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.mail_from_name, settings.mail_from))
    msg["To"] = to
    msg.set_content(text)
    return msg


def _deliver(settings: Settings, msg: EmailMessage) -> None:
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15, context=ssl.create_default_context()) as s:
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
                if settings.smtp_starttls:
                    s.starttls(context=ssl.create_default_context())
                if settings.smtp_user:
                    s.login(settings.smtp_user, settings.smtp_password)
                s.send_message(msg)
        log.info("메일 보냄: %s", msg["Subject"])
    except Exception:  # noqa: BLE001 — 메일 실패가 요청을 깨지 않게. 원인만 로그에
        log.exception("메일을 보내지 못했어요: %s", msg["Subject"])


def send_mail(to: str, subject: str, text: str, *, background: bool = True) -> None:
    """메일 한 통. console 이면 로그, smtp 면 (기본) 백그라운드 스레드로 보낸다."""
    settings = get_settings()
    if settings.mail_backend != "smtp":
        log.warning("[메일 대신 로그] %s → %s\n%s", subject, to, text)
        return
    if not settings.smtp_host or not settings.mail_from:
        log.error("MAIL_BACKEND=smtp 인데 SMTP_HOST·MAIL_FROM 이 비어 있어 보내지 않았어요.")
        return
    msg = build_message(settings, to, subject, text)
    if background:
        threading.Thread(target=_deliver, args=(settings, msg), daemon=True, name="mail").start()
    else:
        _deliver(settings, msg)
