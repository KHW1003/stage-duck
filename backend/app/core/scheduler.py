"""1분마다 도는 일 (plan.md 5.7): 결제 마감 리마인드·자동 취소 (D-57, payment/deadline.py), 공연이 끝난 청구서 정산 예정 (AC-F5-07).

APScheduler 대신 데몬 스레드 하나로 돈다 (uvicorn --workers 1 이라 한 프로세스에 하나). 테스트·관리 명령에서는
SCHEDULER_ENABLED=false 로 끈다 (tests/conftest.py). 한 번 돌다 실패해도 다음 분에 다시 돈다 (로그만 남긴다).
"""
import logging
import threading
from datetime import datetime

from app.core.config import get_settings
from app.core.db import SessionLocal

log = logging.getLogger("stageduck.scheduler")
INTERVAL_SECONDS = 60
_stop = threading.Event()
_thread: threading.Thread | None = None


def run_once(now: datetime | None = None) -> None:
    from app.payment.deadline import run_due
    from app.payment.service import settle_completed_orders

    now = now or datetime.now()
    with SessionLocal() as db:
        reminded, expired = run_due(db, now)
        if reminded or expired:
            log.info("결제 마감: 리마인드 %d건, 자동 취소 %d건", reminded, expired)
        settled = settle_completed_orders(db, now=now)
        if settled:
            log.info("공연 완료: 정산 예정 %d건", settled)


def _loop() -> None:
    while not _stop.wait(INTERVAL_SECONDS):
        try:
            run_once()
        except Exception:  # noqa: BLE001 — 다음 분에 다시
            log.exception("스케줄러 한 번 실패")


def start() -> None:
    global _thread
    if not get_settings().scheduler_enabled or (_thread is not None and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, daemon=True, name="scheduler")
    _thread.start()


def stop() -> None:
    _stop.set()
