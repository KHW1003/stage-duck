"""시연 서버 api 이미지가 화면 주소·robots.txt·API 를 제대로 보내는지 (deploy-check.yml, 서버에 올리기 전에).

이미지 안에서 임시 SQLite 로 표를 만들고 uvicorn 을 띄운 뒤 표준 라이브러리(urllib)로 확인한다.
실행: docker run --rm -e DATABASE_URL=sqlite:////tmp/check.db -e PYTHONPATH=/app -v "$PWD/deploy/smoke_check.py:/tmp/smoke_check.py:ro" \
      --entrypoint python stageduck-api:check /tmp/smoke_check.py
"""
import threading
import time
import urllib.error
import urllib.request

import uvicorn

from app.core.db import Base, engine
from app.main import app

Base.metadata.create_all(engine)
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="warning"))
threading.Thread(target=server.run, daemon=True).start()
for _ in range(50):
    if server.started:
        break
    time.sleep(0.1)


def get(path: str) -> tuple[int, str]:
    req = urllib.request.Request(f"http://127.0.0.1:8765{path}", headers={"Accept": "text/html"})
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


status, body = get("/")
assert status == 200 and "<title>STAGE DUCK" in body and '<div id="root">' in body, body[:300]
status, body = get("/me/performances")
assert status == 200 and "noindex" in body, body[:300]
status, body = get("/community/999999")
assert status == 404 and "noindex" in body, (status, body[:300])
status, body = get("/robots.txt")
assert status == 200 and body.startswith("User-agent: *"), body
status, body = get("/api/v1/health")
assert status == 200 and '"ok"' in body, body
status, _ = get("/api/v1/nope")
assert status == 404
print("smoke ok")
server.should_exit = True
