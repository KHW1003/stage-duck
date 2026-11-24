"""기술 확인 순수 함수: 입력 검사, 표시 말."""
from app.models.tech import DETAIL_MAX, ITEM_MAX, MEMO_MAX, TECH_ANSWERS

# 담당 표시 "업체 C (공간)" 의 괄호 말
STAGE_WORD = {"VENUE": "공간", "EQUIPMENT": "장비", "ENGINEER": "엔지니어"}

# 공연 상태 → 화면 말 (목업 p-tech.html "결제 대기")
STATUS_LABEL = {
    "DRAFT": "작성 중",
    "PUBLISHED": "공고 중",
    "ASSIGNING": "섭외 중",
    "AWAITING_PAYMENT": "결제 대기",
    "CONFIRMED": "섭외 확정",
    "COMPLETED": "공연 끝",
    "CANCELLED": "취소",
    "WITHDRAWN": "내림",
}


def owner_label(company: str, stage_type: str) -> str:
    return f"{company} ({STAGE_WORD.get(stage_type, stage_type)})"


def item_errors(item: str | None, detail: str | None) -> list[dict]:
    errors = []
    if not item or not item.strip():
        errors.append({"field": "item", "reason": "확인할 항목을 적어 주세요"})
    elif len(item.strip()) > ITEM_MAX:
        errors.append({"field": "item", "reason": f"항목은 {ITEM_MAX}자까지 적을 수 있어요"})
    if detail and len(detail.strip()) > DETAIL_MAX:
        errors.append({"field": "detail", "reason": f"설명은 {DETAIL_MAX}자까지 적을 수 있어요"})
    return errors


def answer_errors(answer: str | None, memo: str | None) -> list[dict]:
    errors = []
    if answer not in TECH_ANSWERS or answer == "UNCONFIRMED":
        errors.append({"field": "answer", "reason": "답변을 골라 주세요"})
    if memo and len(memo.strip()) > MEMO_MAX:
        errors.append({"field": "memo", "reason": f"답변 내용은 {MEMO_MAX}자까지 적을 수 있어요"})
    return errors
