"""오리 프로필 읽기 (11/26). 머리줄·프로필·채팅·관심 업체·소개 글이 같이 쓴다.

다른 묶음은 이 함수만 부른다 (CLAUDE.md 5장). board 를 import 하지 않아 board 쪽에서 불러도 순환이 없다.
"""
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.supplier import Supplier, SupplierCategory
from app.models.user import User
from app.profile import calc
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class DuckOut(BaseModel):
    """오리 프로필 (11/26). 사진이 없을 때 화면이 이 값으로 오리를 그린다. pick 이 null 이면 seed 로 자동."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)

    role: str  # USER · VENUE · EQUIPMENT · INSTALL · ENGINEER
    seed: str
    pick: str | None


def _out(user_id: int, role: str, categories: list[str], pick: str | None) -> DuckOut:
    kind = calc.duck_role(role, categories)
    # 분야가 바뀌어 그 종류에 없는 조합이면 자동 오리로
    return DuckOut(role=kind, seed=calc.duck_seed(user_id), pick=pick if calc.valid_pick(kind, pick) else None)


def ducks(db: Session, user_ids: Iterable[int]) -> dict[int, DuckOut]:
    """계정 번호 → 오리. 없는 계정은 빠진다."""
    ids = set(user_ids)
    if not ids:
        return {}
    users = db.execute(select(User.id, User.role, User.duck_avatar).where(User.id.in_(ids))).all()
    cats: dict[int, list[str]] = {}
    for uid, cat in db.execute(
        select(Supplier.user_id, SupplierCategory.category)
        .join(SupplierCategory, SupplierCategory.supplier_id == Supplier.id)
        .where(Supplier.user_id.in_(ids))
    ):
        cats.setdefault(uid, []).append(cat)
    return {uid: _out(uid, role, cats.get(uid, []), pick) for uid, role, pick in users}


def duck_of(db: Session, user_id: int) -> DuckOut:
    return ducks(db, [user_id])[user_id]


def kind_of(db: Session, user: User) -> str:
    return duck_of(db, user.id).role
