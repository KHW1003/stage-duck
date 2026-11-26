"""오리 프로필 규칙 (11/26 해원 승인). DB를 모르는 순수 함수.

- 오리 종류는 계정 역할로 정한다: 뮤지션(USER)·관리자 → USER, 업체 → 첫 분야 (공연장 → 장비 → 설치 → 엔지니어 순서).
- 고른 오리는 "입는 것-드는 것" 번호 ("3-1"). 고르지 않았으면 seed 로 화면이 자동으로 그린다.
- 표는 화면 frontend/src/shared/ui/duck.ts 의 duckPicks 와 같아야 한다 (두 쪽 테스트가 같은 표를 검사한다).
"""
import hashlib

from app.models.supplier import CATEGORIES

KINDS = ("USER", *CATEGORIES)


def _picks(wear: int, hold: int, chest: set[int] = frozenset(), belly: set[int] = frozenset()) -> frozenset[str]:
    """가슴에 단 것(넥타이·조끼·목걸이)과 배 앞에 드는 것은 겹치지 않게 뺀다."""
    return frozenset(f"{w}-{h}" for w in range(wear) for h in range(hold) if not (w in chest and h in belly))


DUCK_PICKS: dict[str, frozenset[str]] = {
    "USER": _picks(6, 4),
    "VENUE": _picks(3, 3, chest={2}, belly={2}),
    "EQUIPMENT": _picks(3, 3),
    "INSTALL": _picks(3, 4, chest={1}, belly={3}),
    "ENGINEER": _picks(3, 3, chest={2}, belly={0, 1}),
}


def duck_role(role: str, categories: list[str]) -> str:
    if role != "SUPPLIER":
        return "USER"
    return next((c for c in CATEGORIES if c in categories), "EQUIPMENT")


def duck_seed(user_id: int) -> str:
    """계정마다 정해진 무작위처럼 보이는 값. 계정 번호를 그대로 드러내지 않는다."""
    return hashlib.sha256(f"stageduck-duck:{user_id}".encode()).hexdigest()[:12]


def valid_pick(kind: str, pick: str | None) -> bool:
    return pick is None or pick in DUCK_PICKS.get(kind, frozenset())
