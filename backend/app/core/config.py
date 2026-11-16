"""앱 설정. 값은 환경 변수 또는 backend/.env 에서 읽는다 (plan.md 8장)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"  # local / test / prod
    database_url: str = "mariadb+pymysql://stageduck:stageduck@localhost:3306/stageduck?charset=utf8mb4"
    admin_session_secret: str = "dev-only-change-me"
    jwt_secret: str = "dev-only-change-me-jwt"  # 로그인 쿠키(JWT) 서명 키
    access_token_minutes: int = 30  # plan.md 4장 Access 30분
    refresh_token_days: int = 14  # plan.md 4장 Refresh 14일
    login_max_failures: int = 5  # FR-AUTH-06 연속 실패 횟수
    login_lock_minutes: int = 10  # FR-AUTH-06 잠금 시간

    @property
    def is_test_env(self) -> bool:
        """시연 계정 전환·데이터 초기화는 test 환경에서만 (NFR-OPS-01)."""
        return self.app_env == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
