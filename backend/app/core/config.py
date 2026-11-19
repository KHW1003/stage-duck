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
    mail_backend: str = "console"  # console = 서버 로그에 남김 (D-55) / smtp = 실제로 보냄 (app/core/mail.py)
    smtp_host: str = ""
    smtp_port: int = 587  # 465 = SSL, 587 = STARTTLS
    smtp_user: str = ""
    smtp_password: str = ""  # Gmail 은 계정 비밀번호가 아니라 "앱 비밀번호" — 서버 .env 에만
    smtp_starttls: bool = True
    mail_from: str = ""  # 보내는 주소 (SMTP 계정이 보낼 수 있는 주소)
    mail_from_name: str = "STAGE DUCK"
    upload_dir: str = "uploads"  # 업로드 파일 저장 폴더 (uploads.md, Docker 에서는 /uploads 볼륨)

    # 검색·공유 노출 (specs/seo.md 8장)
    frontend_dist: str = "../frontend/dist"  # 빌드된 화면 폴더 (Docker 에서는 /app/frontend/dist)
    public_base_url: str = "http://localhost:8000"  # canonical·og:url·sitemap 절대 주소
    seo_indexing: bool = False  # 시연 데이터가 검색에 남지 않게 기본은 끔
    site_verification_naver: str = ""
    site_verification_google: str = ""

    @property
    def is_test_env(self) -> bool:
        """시연 계정 전환·데이터 초기화는 test 환경에서만 (NFR-OPS-01)."""
        return self.app_env == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
