"""시드 데이터 넣기 (backend 폴더에서): python -m app.demo"""
from datetime import datetime

from app.core.db import SessionLocal
from app.demo.service import is_seeded, seed_demo

if __name__ == "__main__":
    with SessionLocal() as db:
        if is_seeded(db):
            print("시드 데이터가 이미 있어요.")
        else:
            seed_demo(db, datetime.now())
            print("시드 데이터를 넣었어요 (사용자 1명, 업체 A~G).")
