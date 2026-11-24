"""비밀번호 해시 (NFR-SEC-01)."""
import bcrypt


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
