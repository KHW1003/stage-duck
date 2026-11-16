"""채팅 메시지 판정용 순수 함수 (DB를 모른다)."""

import re

# 전화번호: 휴대폰 01X, 서울 02, 지역번호 0XX. 구분자는 '-', '.', 공백 또는 없음.
_PHONE = re.compile(
    r"(?<!\d)(?:01[016789]|02|0[3-6][1-5])[-. ]?\d{3,4}[-. ]?\d{4}(?!\d)"
)
# 계좌번호(구분자 있음): 숫자 묶음 3개 이상을 '-'로 이은 것. 숫자 개수는 따로 센다.
_HYPHEN_GROUPS = re.compile(r"(?<![\d-])\d+(?:-\d+){2,}(?![\d-])")
# 계좌번호(구분자 없음): 숫자만 10~14자리. 뒤에 '원'이 오면(공백을 두어도) 금액이라 제외한다.
_BARE_DIGITS = re.compile(r"(?<!\d)\d{10,14}(?!\d)(?!\s*원)")

_ACCOUNT_MIN_DIGITS = 10
_ACCOUNT_MAX_DIGITS = 14


def _has_hyphen_account(body: str) -> bool:
    for match in _HYPHEN_GROUPS.finditer(body):
        digits = len(match.group().replace("-", ""))
        if _ACCOUNT_MIN_DIGITS <= digits <= _ACCOUNT_MAX_DIGITS:
            return True
    return False


def has_contact_pattern(body: str | None) -> bool:
    """AC-F3-15, FR-CHAT-06: 글에 전화번호·계좌번호 모양이 있으면 True.

    막지는 않고 chat_messages.contact_warning에 표시만 한다.
    금액(1,250,000원, 1000000000원), 시간, 날짜, 인원, 장비 수량은 잡지 않는다.
    """
    if not body:
        return False
    return bool(
        _PHONE.search(body)
        or _has_hyphen_account(body)
        or _BARE_DIGITS.search(body)
    )
