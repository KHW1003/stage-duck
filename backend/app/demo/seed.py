"""시드 데이터 값 (data-model.md 12장, docs/guides/시연_예시값.md). 모든 이름·연락처는 가상이다."""
from datetime import date, time

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

# 지난 공연 후기 (specs/reviews.md). 후기를 쓴 가상 사용자·끝난 공연을 함께 넣는다.
# (닉네임, 공연 제목, 공연일, [(업체 기호, 단계, 별점, 후기)])
PAST_REVIEWS = [
    ("가을소리", "가을밤 어쿠스틱 라이브", date(2026, 10, 11), [
        ("a", "VENUE", 5, "상주 엔지니어분이 리허설 때부터 모니터를 꼼꼼히 잡아 주셔서 공연 내내 소리가 편했어요."),
        ("d", "EQUIPMENT", 5, "설치가 약속한 시간보다 일찍 끝나서 리허설을 여유 있게 했습니다. 장비 상태도 좋았어요."),
    ]),
    ("동구연극회", "소극장 낭독극 〈봄밤〉", date(2026, 10, 25), [
        ("c", "VENUE", 4, "무대 단이 있어서 배우 동선이 잘 보였어요. 대기실이 없어 조금 아쉬웠지만 가격 대비 만족합니다."),
        ("f", "ENGINEER", 5, "대사 위주 공연이라 마이크 음량이 걱정이었는데 끝까지 안정적으로 잡아 주셨어요."),
    ]),
    ("북구청년밴드", "청년 밴드 연합 공연", date(2026, 11, 8), [
        ("a", "VENUE", 4, "객석 200석이라 여유로웠고 장비도 충분했어요. 입실 시간이 빨라서 준비하기 좋았습니다."),
        ("d", "EQUIPMENT", 4, "드럼 마이킹까지 세심하게 해 주셨어요. 철수도 빨랐습니다."),
        ("g", "ENGINEER", 5, "밴드 경험이 많으셔서 사운드 체크가 빨리 끝났어요. 다음에도 부탁드리고 싶어요."),
    ]),
]
