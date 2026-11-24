"""서버(Docker)에서 약한 서명 키로 뜨지 않게 막기 (app/core/config.py check_secrets, 11/24 배포 점검)."""
import pytest

from app.core.config import Settings, check_secrets, weak_secrets

STRONG = "a" * 64  # openssl rand -hex 32 와 같은 길이


def _settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def test_default_secrets_are_weak():
    assert weak_secrets(_settings()) == ["ADMIN_SESSION_SECRET", "JWT_SECRET"]


def test_short_secret_is_weak_but_32_bytes_is_enough():
    s = _settings(admin_session_secret="x" * 31, jwt_secret="y" * 32)
    assert weak_secrets(s) == ["ADMIN_SESSION_SECRET"]


def test_check_does_nothing_unless_required():
    check_secrets(_settings())  # 로컬·테스트는 기본값으로도 뜬다


def test_server_refuses_to_start_with_weak_secret_and_does_not_print_value():
    s = _settings(require_strong_secrets=True, admin_session_secret=STRONG, jwt_secret="short-secret")
    with pytest.raises(RuntimeError) as e:
        check_secrets(s)
    assert "JWT_SECRET" in str(e.value) and "short-secret" not in str(e.value)


def test_server_starts_with_strong_secrets():
    check_secrets(_settings(require_strong_secrets=True, admin_session_secret=STRONG, jwt_secret=STRONG))
