"""입점 신청 규칙 — DB 를 모르는 순수 함수 (FR-SUP-02, CLAUDE.md 6.1)."""
import re
from dataclasses import dataclass

from app.auth.calc import PHONE_RE
from app.models.supplier import BUSINESS_TYPES, CATEGORIES

BUSINESS_NO_WEIGHTS = (1, 3, 7, 1, 3, 7, 1, 3, 5)
BAD_BUSINESS_NO = "번호가 맞지 않아요. 등록증의 10자리를 다시 확인해 주세요."


def normalize_business_no(value: str) -> str:
    """'123-45-67891' → '1234567891'. 숫자·하이픈·공백 밖의 글자는 그대로 둬서 검사에서 걸리게 한다."""
    return re.sub(r"[-\s]", "", value)


def is_valid_business_no(value: str) -> bool:
    """AC-F1-18: 사업자등록번호 10자리 체크섬 (국세청 조회는 후속).

    앞 9자리에 가중치 1·3·7·1·3·7·1·3·5 를 곱해 더하고, 9번째 자리 × 5 의 십의 자리를 한 번 더 더한다.
    (10 − 합의 일의 자리) 의 일의 자리가 마지막 숫자와 같아야 한다.
    """
    if not re.fullmatch(r"[0-9]{10}", value):  # \d 는 전각 숫자(１２３)도 받아서 쓰지 않는다
        return False
    d = [int(c) for c in value]
    total = sum(x * w for x, w in zip(d, BUSINESS_NO_WEIGHTS)) + (d[8] * 5) // 10
    return (10 - total % 10) % 10 == d[9]


@dataclass(frozen=True)
class ApplicationInput:
    business_type: str | None
    company_name: str | None
    representative_name: str | None
    business_reg_no: str | None
    business_address: str | None
    main_phone: str | None
    mail_order_no: str | None
    categories: list[str] | None


def _blank(v: str | None) -> bool:
    return v is None or not v.strip()


def application_field_errors(a: ApplicationInput) -> list[dict]:
    """FR-SUP-02: 비었거나 형식이 틀린 칸마다 이유 하나. 사업자번호 체크섬은 따로 (INVALID_BUSINESS_NO).

    개인(프리랜서)은 사업자등록번호·사업장 주소를 받지 않는다 (AC-F1-17, 보내면 무시).
    """
    errors: list[dict] = []

    def add(field: str, reason: str) -> None:
        errors.append({"field": field, "reason": reason})

    if a.business_type not in BUSINESS_TYPES:
        add("businessType", "사업자 유형을 골라 주세요")
    business = a.business_type in ("SOLE_PROPRIETOR", "CORPORATION")
    required = [
        ("companyName", a.company_name, "상호(활동명)를 입력해 주세요", 100),
        ("representativeName", a.representative_name, "대표자 이름을 입력해 주세요", 50),
        ("mainPhone", a.main_phone, "대표 전화를 입력해 주세요", 20),
    ]
    if business:
        required += [
            ("businessRegNo", a.business_reg_no, "사업자등록번호를 입력해 주세요", 20),
            ("businessAddress", a.business_address, "사업장 주소를 입력해 주세요", 255),
        ]
    for field, value, reason, limit in required:
        if _blank(value):
            add(field, reason)
        elif len(value.strip()) > limit:
            add(field, f"{limit}자까지 입력할 수 있어요")
    if not _blank(a.main_phone) and not PHONE_RE.fullmatch(a.main_phone.strip()):
        add("mainPhone", "전화번호는 숫자만 9~11자리로 입력해 주세요 (예: 0621234567)")
    if a.mail_order_no is not None and len(a.mail_order_no.strip()) > 50:
        add("mailOrderNo", "50자까지 입력할 수 있어요")
    cats = a.categories or []
    if not cats:
        add("categories", "제공할 서비스를 하나 이상 골라 주세요")
    elif len(set(cats)) != len(cats) or any(c not in CATEGORIES for c in cats):
        add("categories", "서비스를 다시 골라 주세요")
    return errors


def business_no_error(a: ApplicationInput) -> dict | None:
    """칸 검사를 통과한 사업자 신청서의 번호가 체크섬에 맞지 않으면 오류 한 줄."""
    if a.business_type not in ("SOLE_PROPRIETOR", "CORPORATION") or _blank(a.business_reg_no):
        return None
    if is_valid_business_no(normalize_business_no(a.business_reg_no.strip())):
        return None
    return {"field": "businessRegNo", "reason": BAD_BUSINESS_NO}
