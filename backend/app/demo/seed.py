"""시드 데이터 값 (data-model.md 12장, docs/guides/시연_예시값.md). 모든 이름·연락처는 가상이다."""
from datetime import time

DEMO_PHONE = "01000000000"

HOST = {
    "email": "host@stageduck.test",
    "name": "시연사용자",
    "nickname": "광주밴드",
    "musician_type": "밴드",
}

# (영문 기호, 부문, 소개, 설치 분)
SUPPLIERS = [
    ("a", ("VENUE",), "공연장 · 풀스펙 (상주 엔지니어, 기본 장비)", None),
    ("b", ("VENUE",), "공연장 · 입실·설치 가능 17:00", None),
    ("c", ("VENUE",), "공연장 · 입실·설치 가능 15:00, 기본 보컬 마이크 2", None),
    ("d", ("EQUIPMENT", "INSTALL", "ENGINEER"), "장비 + 설치 + 엔지니어 · 설치 90분", 90),
    ("e", ("EQUIPMENT",), "장비", None),
    ("f", ("ENGINEER",), "엔지니어 단독", None),
    ("g", ("ENGINEER",), "엔지니어 단독", None),
]

# 공연장 업체 A·B·C 의 공간 (AC-F5-01: 광주 / 80명 / 밴드 가능으로 걸러지면 셋 다 나온다). 주소는 가상.
_COMMON = {"sido": "광주광역시", "checkout_time": time(23, 0), "band_allowed": True}
VENUES = {
    "a": {**_COMMON, "name": "공간 A", "sigungu": "동구", "address": "가상로 1", "venue_type": "CONCERT_HALL",
          "max_capacity": 200, "checkin_time": time(14, 0), "rental_fee": 4_000_000, "has_resident_engineer": True,
          "external_equipment_allowed": True, "has_waiting_room": True, "has_stage_platform": True,
          "equipment": [("스피커", "메인 스피커", 2), ("믹서", "디지털 믹서", 1), ("마이크", "보컬 마이크", 4)]},
    "b": {**_COMMON, "name": "공간 B", "sigungu": "서구", "address": "가상로 2", "venue_type": "CULTURE_SPACE",
          "max_capacity": 100, "checkin_time": time(17, 0), "rental_fee": 400_000,
          "external_equipment_allowed": True, "equipment": []},
    "c": {**_COMMON, "name": "공간 C", "sigungu": "동구", "address": "가상로 3", "venue_type": "CULTURE_SPACE",
          "max_capacity": 120, "checkin_time": time(15, 0), "rental_fee": 500_000,
          "external_equipment_allowed": True, "has_stage_platform": True, "equipment": [("마이크", "유선 보컬 마이크", 2)]},
}
