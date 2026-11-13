"""공연 요청서·순차 배정 서비스 (2번 묶음 — 해원).

지금은 다른 묶음이 부를 **약속 함수의 모양만** 있다 (roles.md 3장, 이슈 #35).
본문은 T2-04(#38)에서 채운다. 그 전까지 다른 묶음은 테스트에서 이 함수를 목업으로 바꿔 쓴다:

    monkeypatch.setattr("app.request.service.get_open_stage", lambda db, pid: OpenStage(...))

이름·인자·돌려주는 모양을 바꾸려면 쓰는 쪽과 먼저 합의한다.
"""
from dataclasses import dataclass

from sqlalchemy.orm import Session

STAGE_TYPES = ("VENUE", "EQUIPMENT", "ENGINEER")  # 배정 순서 (constitution 3)


@dataclass(frozen=True)
class OpenStage:
    """공연에서 지금 열려 있는 단계 하나 (공연당 최대 1개, AC-F3-01)."""

    stage_id: int
    performance_id: int
    stage_type: str  # VENUE · EQUIPMENT · ENGINEER
    status: str  # OPEN · NEGOTIATING
    performance_version: int  # 지금 공고의 요청서 버전 (CHK-12, 견적서 based_on_perf_version)


@dataclass(frozen=True)
class ConfirmedLine:
    """확정된 단계 하나의 청구서 줄 (data-model.md order_lines). 금액은 원 단위 정수."""

    stage_id: int
    stage_type: str
    supplier_id: int
    quote_version_id: int
    amount: int


def get_open_stage(db: Session, performance_id: int) -> OpenStage | None:
    """[약속 2 → 1·3] 공연에서 지금 열린 단계. 열린 단계가 없으면(모집 전·모두 확정·취소) None.

    쓰는 곳: 1번 직접 오퍼(그 부문 업체에게만, AC-F3-16), 3번 공고 목록·견적서 전송(AC-F2-11, F3-01).
    권한 검사는 하지 않는다 — 부르는 쪽이 이미 검사했다고 본다.
    구현: 2번 해원 — T2-04 (#38).
    """
    raise NotImplementedError("2번 묶음 T2-04(#38)에서 구현한다")


def stage_confirmed(db: Session, stage_id: int, quote_version_id: int, *, actor_id: int) -> None:
    """[약속 3 → 2] 3번의 컨펌 처리 안에서 부른다. 단계를 CONFIRMED 로 바꾸고 확정 견적서 버전을 저장한다.

    - 3번이 연 트랜잭션 안에서 실행되고 **커밋하지 않는다** (커밋은 3번이 한 번에).
    - 단계 행은 부르는 쪽이 이미 `SELECT … FOR UPDATE` 로 잠갔다고 본다 (plan.md 5.3).
    - 상태 이력(status_histories)은 이 함수가 남긴다.
    - 다음 단계는 열지 않는다 — 사용자가 [다음 단계로]를 눌러야 열린다 (D-1, AC-F3-02).
    구현: 2번 해원 — T2-04 (#38).
    """
    raise NotImplementedError("2번 묶음 T2-04(#38)에서 구현한다")


def confirmed_lines(db: Session, performance_id: int) -> list[ConfirmedLine]:
    """[약속 2·3 → 4] 확정된 단계마다 한 줄. 건너뛴 단계는 넣지 않는다. 순서는 배정 순서(공연장 → 장비 → 엔지니어).

    쓰는 곳: 4번 통합 청구서(AC-F5-03)·위약금 배분(AC-F5-08).
    금액은 확정 견적서 버전의 total_amount (견적서 금액은 3번 quote 서비스로 읽는다).
    구현: 2번 해원 — T2-04 (#38).
    """
    raise NotImplementedError("2번 묶음 T2-04(#38)에서 구현한다")
