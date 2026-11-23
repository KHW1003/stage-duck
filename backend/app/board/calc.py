"""업체 찾기 소개 글 판정용 순수 함수 (DB 를 모른다)."""
import re

from app.chat.calc import has_contact_pattern

# 외부 링크: http(s):// 로 시작하거나 www. 로 시작하는 주소 (AC-F4-03)
_LINK = re.compile(r"https?://|(?<![\w.])www\.[\w-]", re.IGNORECASE)


def has_contact_or_link(title: str, body: str) -> bool:
    """AC-F4-03: 제목·본문에 전화번호·계좌번호(채팅 FR-CHAT-06 과 같은 규칙)나 외부 링크가 있으면 True.

    막지는 않고 응답의 contactWarning 으로 경고만 한다 (커뮤니티 글과 같은 방식).
    """
    text = f"{title}\n{body}"
    return has_contact_pattern(text) or bool(_LINK.search(text))
