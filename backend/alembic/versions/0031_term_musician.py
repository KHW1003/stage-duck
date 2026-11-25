"""용어 바꾸기: 화면 문구 '사용자' → '뮤지션' (11/25 해원). 이미 저장된 안내 문장도 같이 바꾼다.

- chat_messages(NOTICE) 본문, notifications 제목, status_histories 사유에 남은 서버 안내 문장만 바꾼다.
- 회원이 직접 쓴 글·채팅(사람이 보낸 메시지)은 건드리지 않는다.
- 되돌리기(downgrade)는 같은 문장을 반대로 바꾼다.

Revision ID: 0031
Revises: 0030
Create Date: 2026-11-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

# (표, 칸, 조건) — 서버가 남긴 안내만
TARGETS = [
    ("chat_messages", "body", "type = 'NOTICE' AND sender_user_id IS NULL"),
    ("notifications", "title", "1 = 1"),
    ("status_histories", "reason", "1 = 1"),
]
# 조사까지 같이 (사용자가 → 뮤지션이). 긴 것부터
PAIRS = [("사용자에게", "뮤지션에게"), ("사용자가", "뮤지션이"), ("사용자는", "뮤지션은"), ("사용자를", "뮤지션을")]


def _run(pairs: list[tuple[str, str]]) -> None:
    conn = op.get_bind()
    for table, col, where in TARGETS:
        for old, new in pairs:
            conn.execute(
                sa.text(f"UPDATE {table} SET {col} = REPLACE({col}, :old, :new) WHERE {where} AND {col} LIKE :pat"),
                {"old": old, "new": new, "pat": f"%{old}%"},
            )


def upgrade() -> None:
    _run(PAIRS)


def downgrade() -> None:
    _run([(new, old) for old, new in PAIRS])
