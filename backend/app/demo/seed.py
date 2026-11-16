"""시드 데이터 값 (data-model.md 12장, docs/guides/시연_예시값.md). 모든 이름·연락처는 가상이다.

공간 A·B·C는 venues 모델(1번)이 생기면 더한다.
"""

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
