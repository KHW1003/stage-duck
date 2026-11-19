"""메일 보내기 (D-55 후속). MAIL_BACKEND 로 고른다.

- console (기본): 보내지 않고 서버 로그에 남긴다 — 로컬·테스트
- smtp: SMTP 서버로 보낸다 (Gmail 앱 비밀번호·AWS SES SMTP 등). 값은 서버 .env 에만 둔다 (deploy/env.prod.example)
  - 465 = SSL, 그 밖(587 등)은 STARTTLS (SMTP_STARTTLS=false 로 끌 수 있음)
보내기는 요청 스레드 밖(백그라운드 스레드)에서 한다 — 응답 시간으로 가입 여부를 알 수 없게 하고, 메일 서버가 느려도 화면이 기다리지 않게.
실패해도 사용자 응답은 같다 (로그에만 남긴다). 받는 주소·링크는 로그에 남기지 않는다 (SMTP 일 때).
"""
import logging
import re
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid

from app.core.config import Settings, get_settings

log = logging.getLogger("stageduck.mail")
EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def build_message(settings: Settings, to: str, subject: str, text: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.mail_from_name, settings.mail_from))
    msg["To"] = to
    # Gmail 등은 Date·Message-ID 가 없는 메일을 거절하거나 스팸으로 보낸다 (RFC 5322)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=settings.mail_from.rsplit("@", 1)[-1] or None)
    msg.set_content(text)
    return msg


class MailError(Exception):
    """보내기 실패 — 사람이 읽을 이유가 담긴다 (send_test_mail)."""


def _connect_and_send(settings: Settings, msg: EmailMessage) -> None:
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


def _reason(exc: Exception) -> str:
    """흔한 실패를 고칠 곳이 보이게 바꾼다."""
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        server = exc.smtp_error.decode("utf-8", "replace") if isinstance(exc.smtp_error, bytes) else str(exc.smtp_error)
        return (
            "로그인에 실패했어요. SMTP_USER(보내는 주소)와 SMTP_PASSWORD 를 확인해 주세요. "
            "Gmail 은 앱 비밀번호 16자리(띄어쓰기 없이), 네이버는 메일 환경설정에서 IMAP/SMTP '사용함' + "
            "2단계 인증 계정이면 애플리케이션 비밀번호가 필요해요. "
            f"(메일 서버 답: {exc.smtp_code} {server[:120]})"
        )
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "받는 주소를 메일 서버가 거절했어요. 주소를 확인해 주세요."
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return "보내는 주소(MAIL_FROM)를 메일 서버가 거절했어요. SMTP 계정이 보낼 수 있는 주소인지 확인해 주세요."
    if isinstance(exc, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, OSError)):
        return f"메일 서버에 연결하지 못했어요. SMTP_HOST·SMTP_PORT 와 인터넷 연결을 확인해 주세요. ({exc.__class__.__name__})"
    return f"메일을 보내지 못했어요: {exc.__class__.__name__}: {exc}"


def _deliver(settings: Settings, msg: EmailMessage) -> None:
    try:
        _connect_and_send(settings, msg)
        log.info("메일 보냄: %s", msg["Subject"])
    except Exception as exc:  # noqa: BLE001 — 메일 실패가 요청을 깨지 않게. 원인만 로그에
        log.error("메일을 보내지 못했어요: %s — %s", msg["Subject"], _reason(exc))


TEST_SUBJECT = "[STAGE DUCK] 메일 보내기 시험"


def send_test_mail(to: str) -> str:
    """이메일 하나에 시험 메일을 바로(기다려서) 보낸다. 설정이 smtp 가 아니거나 실패하면 MailError (이유 포함).

    쓰는 곳: python -m app.cli send-test-mail --to 받는주소  (서버 .env 를 채운 뒤 확인용)
    돌려주는 값: 보낸 결과 한 줄 (받는 주소·보낸 주소·서버)
    """
    to = (to or "").strip()
    if not EMAIL_RE.fullmatch(to):
        raise MailError(f"이메일 주소 모양이 아니에요: {to!r}")
    settings = get_settings()
    if settings.mail_backend != "smtp":
        raise MailError(f"MAIL_BACKEND 가 {settings.mail_backend!r} 예요. 실제로 보내려면 .env 에 MAIL_BACKEND=smtp 로 바꿔 주세요.")
    missing = [k for k, v in (("SMTP_HOST", settings.smtp_host), ("MAIL_FROM", settings.mail_from)) if not v]
    if settings.smtp_user and not settings.smtp_password:
        missing.append("SMTP_PASSWORD")
    if missing:
        raise MailError(f".env 에 비어 있는 값이 있어요: {', '.join(missing)}")
    not_email = [k for k, v in (("SMTP_USER", settings.smtp_user), ("MAIL_FROM", settings.mail_from)) if v and not EMAIL_RE.fullmatch(v)]
    if not_email:
        raise MailError(f".env 의 {', '.join(not_email)} 가 이메일 주소가 아니에요. 예시 문구 대신 실제 Gmail 주소를 넣어 주세요.")
    if settings.smtp_password and not settings.smtp_password.isascii():
        raise MailError(".env 의 SMTP_PASSWORD 가 예시 문구 그대로예요. Gmail 앱 비밀번호 16자리를 띄어쓰기 없이 넣어 주세요.")
    text = chr(10).join([
        "STAGE DUCK 메일 발송 시험입니다.",
        "",
        "이 메일을 받으셨다면 서버의 메일 설정이 올바릅니다. 비밀번호 찾기 메일도 같은 방법으로 발송됩니다.",
        "",
        f"보낸 서버: {settings.smtp_host}:{settings.smtp_port}",
    ])
    msg = build_message(settings, to, TEST_SUBJECT, text)
    try:
        _connect_and_send(settings, msg)
    except Exception as exc:  # noqa: BLE001
        raise MailError(_reason(exc)) from exc
    return f"{to} 에 시험 메일을 보냈어요 (보낸 주소 {settings.mail_from}, 서버 {settings.smtp_host}:{settings.smtp_port}). 받은편지함·스팸함을 확인해 주세요."


def send_mail(to: str, subject: str, text: str, *, background: bool = True) -> None:
    """메일 한 통. console 이면 로그, smtp 면 (기본) 백그라운드 스레드로 보낸다."""
    settings = get_settings()
    if settings.mail_backend != "smtp":
        log.warning("[메일 대신 로그] %s → %s\n%s", subject, to, text)
        return
    if not settings.smtp_host or not settings.mail_from:
        log.error("MAIL_BACKEND=smtp 인데 SMTP_HOST·MAIL_FROM 이 비어 있어 보내지 않았어요.")
        return
    try:
        msg = build_message(settings, to, subject, text)
    except (ValueError, UnicodeError) as exc:  # MAIL_FROM 에 예시 문구가 남은 경우 등 — 응답은 그대로 두고 로그만
        log.error("메일을 만들지 못했어요 (MAIL_FROM·받는 주소 확인): %s", exc.__class__.__name__)
        return
    if background:
        threading.Thread(target=_deliver, args=(settings, msg), daemon=True, name="mail").start()
    else:
        _deliver(settings, msg)
