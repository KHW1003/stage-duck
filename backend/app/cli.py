"""관리 명령. 관리자 계정은 가입 화면으로 만들 수 없으므로 이 명령으로 만든다 (FR-AUTH-01).

사용 (backend 폴더에서):
    python -m app.cli create-admin --email admin@stageduck.test --name 관리자
    (비밀번호는 입력 프롬프트로 받는다)
"""
import argparse
import getpass

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User


def create_admin(email: str, name: str, password: str) -> int:
    with SessionLocal() as db:
        if db.query(User).filter(User.email == email).first():
            raise SystemExit(f"이미 있는 이메일이에요: {email}")
        user = User(role="ADMIN", email=email, name=name, phone="00000000000", password_hash=hash_password(password))
        db.add(user)
        db.commit()
        return user.id


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create-admin", help="관리자 계정 만들기")
    p.add_argument("--email", required=True)
    p.add_argument("--name", default="관리자")
    args = parser.parse_args()

    if args.cmd == "create-admin":
        password = getpass.getpass("비밀번호 (8자 이상): ")
        if len(password) < 8:
            raise SystemExit("비밀번호는 8자 이상이어야 해요.")
        print(f"관리자 계정을 만들었어요. id={create_admin(args.email, args.name, password)}")


if __name__ == "__main__":
    main()
