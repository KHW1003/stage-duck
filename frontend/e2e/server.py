"""E2E 테스트용 서버 (playwright.config.ts webServer 가 띄운다).

- 임시 SQLite DB 에 표를 만들고 시연 데이터(사용자·업체 A~G·공간 A·B·C)를 넣는다. 개발 DB 는 건드리지 않는다
- 시연 사용자(host@stageduck.test)에 E2E 전용 비밀번호를 넣는다 (시드 계정은 비밀번호가 없다)
- 빌드된 화면(frontend/dist)을 FastAPI 가 보낸다 — 시연 서버와 같은 길 (SEO head 채우기 포함)
실행: backend 가상환경 python 으로 frontend 폴더에서 `python e2e/server.py` (먼저 `npm run build`)
"""
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
BACKEND = FRONTEND.parent / "backend"
PORT = int(os.environ.get("E2E_PORT", "8010"))
E2E_PASSWORD = "e2e-pass-1234"

tmp = Path(tempfile.mkdtemp(prefix="sd-e2e-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(tmp / 'e2e.db').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["UPLOAD_DIR"] = (tmp / "uploads").as_posix()
os.environ["FRONTEND_DIST"] = (FRONTEND / "dist").as_posix()
os.environ["PUBLIC_BASE_URL"] = f"http://127.0.0.1:{PORT}"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import uvicorn  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.demo.service import seed_demo  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

Base.metadata.create_all(engine)
with SessionLocal() as db:
    seed_demo(db, datetime.now())
    host = db.scalar(select(User).where(User.email == "host@stageduck.test"))
    host.password_hash = hash_password(E2E_PASSWORD)
    db.commit()

uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
