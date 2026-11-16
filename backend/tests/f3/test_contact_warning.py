"""AC-F3-15: 채팅 연락처·계좌번호 감지 (단위: 정규식)."""

import pytest

from app.chat.calc import has_contact_pattern


@pytest.mark.parametrize(
    "body",
    [
        "010-1234-5678",
        "010 1234 5678",
        "010.1234.5678",
        "01012345678",
        "010-0000-0000",
        "02-123-4567",
        "031-123-4567",
        "110-123-456789",
        "3333-01-1234567",
        "1002123456789",
        "1002123456789 입금",
        "제 번호 010-1234-5678로 연락 주세요",
        "입금은 110-123-456789 신한으로요",
    ],
)
def test_ac_f3_15_detects_contact_pattern(body: str) -> None:
    assert has_contact_pattern(body) is True


@pytest.mark.parametrize(
    "body",
    [
        "1,250,000원",
        "1250000원",
        "1000000000원",
        "12500000000원",
        "12500000000 원",
        "1000000000 원",
        "₩1,250,000",
        "17:00",
        "17:00~21:00",
        "17시 30분",
        "2026-11-21",
        "2026.11.21",
        "80명",
        "500석",
        "SM58 4개",
        "모니터 스피커 2대",
        "XLR 케이블 10m 6개",
        "드럼 마이크도 추가돼요?",
        "",
        None,
    ],
)
def test_ac_f3_15_ignores_non_contact_numbers(body: str | None) -> None:
    assert has_contact_pattern(body) is False
