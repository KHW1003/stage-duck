"""업체 찾기 소개 글 판정용 순수 함수 (DB 를 모른다)."""
import re
from datetime import datetime, timedelta

from app.chat.calc import has_contact_pattern

BUMP_INTERVAL_DAYS = 7  # 끌어올리기는 7일에 1회 (FR-BOARD-03, D-38)

# 외부 링크: http(s):// 로 시작하거나 www. 로 시작하는 주소 (AC-F4-03)
_LINK = re.compile(r"https?://|(?<![\w.])www\.[\w-]", re.IGNORECASE)


def has_contact_or_link(title: str, body: str) -> bool:
    """AC-F4-03: 제목·본문에 전화번호·계좌번호(채팅 FR-CHAT-06 과 같은 규칙)나 외부 링크가 있으면 True.

    막지는 않고 응답의 contactWarning 으로 경고만 한다 (커뮤니티 글과 같은 방식).
    """
    text = f"{title}\n{body}"
    return has_contact_pattern(text) or bool(_LINK.search(text))


def next_bump_at(last_bumped_at: datetime) -> datetime:
    """FR-BOARD-03: 다시 끌어올릴 수 있는 시각. 마지막으로 끌어올린 시각(처음엔 쓴 시각)에서 7일 뒤."""
    return last_bumped_at + timedelta(days=BUMP_INTERVAL_DAYS)


def can_bump(last_bumped_at: datetime, now: datetime) -> bool:
    """FR-BOARD-03: 딱 7일이 된 순간부터 된다."""
    return now >= next_bump_at(last_bumped_at)
