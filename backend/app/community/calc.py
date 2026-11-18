"""커뮤니티 글 입력 규칙 (DB를 모르는 순수 함수)."""
from app.models.community import BODY_MAX, FREE_POST_CATEGORIES, TITLE_MAX


def post_field_errors(category: str, title: str, body: str) -> list[dict]:
    """말머리·제목(100자)·본문(5,000자) 검사. 문제가 없으면 빈 목록."""
    errors: list[dict] = []
    if category not in FREE_POST_CATEGORIES:
        errors.append({"field": "category", "reason": "말머리를 골라 주세요."})
    if not title:
        errors.append({"field": "title", "reason": "제목을 적어 주세요."})
    elif len(title) > TITLE_MAX:
        errors.append({"field": "title", "reason": f"제목은 {TITLE_MAX}자까지 적을 수 있어요."})
    if not body:
        errors.append({"field": "body", "reason": "내용을 적어 주세요."})
    elif len(body) > BODY_MAX:
        errors.append({"field": "body", "reason": f"내용은 {BODY_MAX:,}자까지 적을 수 있어요."})
    return errors
