"""대표 시나리오 통합 테스트 — 초안 (이슈 #35, 요구사항 명세서 6장).

공연장 C 컨펌 → [다음 단계로] → 장비 D 컨펌 → 엔지니어 건너뛰기 → 통합 청구서 → 테스트 결제 → 최종 담당표.
세 묶음이 만나는 곳(3번 컨펌 ↔ 2번 다음 단계 ↔ 4번 검사·청구서)을 **API만으로** 끝까지 지나간다.

- 지금은 API가 없어서 실패한다 → `xfail`. 각 묶음이 자기 API를 만들면 이 테스트가 점점 더 멀리 간다.
  실패한 줄을 보면 "다음에 막힌 곳"이 어디인지 알 수 있다: `pytest tests/scenario -rx`.
- **모두 통과하면(XPASS) `xfail` 표시를 지운다** — 그때부터 이 테스트가 시연 시나리오를 지킨다.
- 요청 본문은 api-contract.md 를 따랐다. 계약서에 예시가 없는 곳(로그인·공간 등록·청구서 응답 등)은
  `# 계약 예시 없음` 으로 표시했다 — 그 API를 만드는 묶음이 실제 모양에 맞춰 이 테스트를 고친다.
- 값은 docs/guides/시연_예시값.md (공연장 C 500,000 + 장비 D 1,350,000 = 1,850,000, 이용료 5% 92,500, 합계 1,942,500).
"""
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.main import app
from app.models import Supplier, SupplierCategory
from tests.conftest import make_user

PASSWORD = "scenario-pass-1234"
pytestmark = pytest.mark.xfail(reason="대표 시나리오 — 각 묶음 API가 모두 생기면 통과한다 (이슈 #35)", strict=False)


class Actor:
    """한 사람 = 쿠키를 따로 가진 클라이언트 하나. 상태를 바꾸는 요청에 CSRF 헤더를 붙인다."""

    def __init__(self, email: str):
        self.email = email
        self.c = TestClient(app)

    def login(self) -> "Actor":
        res = self.c.post("/api/v1/auth/login", json={"email": self.email, "password": PASSWORD})  # 계약 예시 없음
        assert res.status_code == 200, res.text
        return self

    def _headers(self, idem: bool) -> dict:
        h = {}
        if csrf := self.c.cookies.get("csrf_token"):
            h["X-CSRF-Token"] = csrf
        if idem:
            h["Idempotency-Key"] = uuid.uuid4().hex
        return h

    def get(self, path: str, expect: int = 200) -> dict:
        res = self.c.get(f"/api/v1{path}")
        assert res.status_code == expect, f"GET {path} → {res.status_code} {res.text}"
        return res.json() if res.content else {}

    def post(self, path: str, body: dict | None = None, expect: int = 200, idem: bool = False, headers: dict | None = None) -> dict:
        res = self.c.post(f"/api/v1{path}", json=body or {}, headers={**self._headers(idem), **(headers or {})})
        assert res.status_code == expect, f"POST {path} → {res.status_code} {res.text}"
        return res.json() if res.content else {}


def _approved_supplier(db, name: str, category: str) -> str:
    user = make_user(db, role="SUPPLIER", password=PASSWORD)
    s = Supplier(user_id=user.id, business_type="SOLE_PROPRIETOR", company_name=name, representative_name="대표",
                 main_phone="0620000000", review_status="APPROVED")
    s.categories = [SupplierCategory(category=category)]
    db.add(s)
    db.commit()
    return user.email


def test_representative_scenario_venue_equipment_skip_engineer_pay(db):
    # ---- 준비: 사용자 1명, 승인된 업체 3곳 (요구사항 6장 1번) --------------------------------------
    user_email = make_user(db, role="USER", password=PASSWORD).email
    c_email = _approved_supplier(db, "공연장 C 컬처스페이스", "VENUE")
    b_email = _approved_supplier(db, "공연장 B 라이브홀", "VENUE")  # 견적을 보내지 않는 업체 — 담당표를 못 봐야 한다
    d_email = _approved_supplier(db, "장비 D 사운드", "EQUIPMENT")
    user, c, b, d = (Actor(e).login() for e in (user_email, c_email, b_email, d_email))

    # 공연장 C의 공간 등록 (1번 T1-06) — 계약 예시 없음, 칸 이름은 data-model.md venues
    venue = c.post("/supplier/venues", {
        "name": "공연장 C", "sido": "광주광역시", "sigungu": "동구", "address": "가상로 1",
        "venueType": "CULTURE_SPACE", "maxCapacity": 120, "checkinTime": "15:00", "checkoutTime": "23:00",
        "rentalFee": 500000, "hasResidentEngineer": False, "bandAllowed": True,
    }, expect=201)

    # ---- 2. 요청서 작성·게시 (2번 T2-02·03) ------------------------------------------------------
    show_date = (date.today() + timedelta(days=10)).isoformat()  # 3일 전까지만 요청 가능 (D-16)
    perf = user.post("/performances", {
        "title": "가을밤 밴드 공연", "form": "BAND",
        "lineup": [{"part": "보컬", "count": 1}, {"part": "기타", "count": 2}, {"part": "베이스", "count": 1}, {"part": "드럼", "count": 1}],
        "showDate": show_date, "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
        "audience": 80, "sido": "광주광역시", "sigungu": "동구", "contactPhone": None,
        "needs": {
            "venue": {"needed": True, "types": ["CULTURE_SPACE"], "capacity": 80, "mustHave": ["BAND_ALLOWED"]},
            "equipment": {"needed": True, "proposalWanted": True, "items": [{"name": "보컬 마이크", "qty": 4}], "services": ["TRANSPORT", "INSTALL"], "owned": []},
            "engineer": {"needed": True, "tasks": ["FOH", "INSTALL_ASSIST"], "conditions": ["BAND_EXPERIENCE"]},
        },
    }, expect=201)
    perf_id = perf["id"]  # 계약 예시 없음
    user.post(f"/performances/{perf_id}/publish")

    # AC-F3-01: 공연장 단계일 때 장비 업체에게는 공고가 보이지 않는다
    assert all(p["performanceId"] != perf_id for p in d.get("/postings")["items"])

    # ---- 3·4. 공연장 C 견적서 → 비교 화면의 검사 결과 (3번 T3-01, 4번 T4-02) -------------------------
    venue_posting = next(p for p in c.get("/postings")["items"] if p["performanceId"] == perf_id)
    venue_stage = venue_posting["stageId"]
    q_c = c.post(f"/stages/{venue_stage}/quotes", {
        "label": "기본형", "venueId": venue["id"], "checkinTime": "15:00", "setupAvailableTime": "15:00",
        "items": [], "staff": [], "setupStart": None, "setupMinutes": None, "teardownMinutes": None,
        "includes": {"equipment": False, "engineer": False, "install": False, "transport": False},
        "amounts": {"items": 500000, "transport": 0, "install": 0, "labor": 0, "etc": 0},
        "totalAmount": 500000, "extraCostNote": "", "validUntil": show_date, "techNote": "",
    }, expect=201)
    compare = user.get(f"/stages/{venue_stage}/quotes")
    checks_c = {ch["id"]: ch["result"] for ch in next(q for q in compare["items"] if q["quoteId"] == q_c["quoteId"])["checks"]}
    assert checks_c["CHK-02"] == "PASS"  # 설치 가능 15:00 ~ 리허설 17:00 = 120분 (AC-F3-20)

    # ---- 5. 채팅 시작 → 견적 내역 확인 → 컨펌 → [다음 단계로] (3번 T3-02·03, 2번 T2-04) -----------------
    user.post(f"/chat-rooms/{q_c['chatRoomId']}/start")
    card = c.post(f"/quotes/{q_c['quoteId']}/confirm-requests", expect=201)
    user.post(f"/confirm-requests/{card['id']}/view")
    accepted = user.post(f"/confirm-requests/{card['id']}/accept", idem=True)
    assert accepted["stageStatus"] == "CONFIRMED"
    assert accepted["next"]["stageType"] == "EQUIPMENT"
    assert accepted["checkoutAvailable"] is False
    user.post(f"/stages/{venue_stage}/advance", {"action": "OPEN_NEXT"}, idem=True)  # D-1: 눌러야 열린다

    # ---- 6. 장비 단계: D가 공연장 정보를 보고 견적 (AC-F3-03) ---------------------------------------
    eq_posting = next(p for p in d.get("/postings")["items"] if p["performanceId"] == perf_id)
    eq_stage = eq_posting["stageId"]
    detail = d.get(f"/postings/{eq_stage}")
    assert detail  # 앞 단계 확정 정보(공연장 입실 15:00 등) — 응답 모양은 계약 예시 없음
    q_d = d.post(f"/stages/{eq_stage}/quotes", {
        "label": "기본형", "venueId": None,
        "items": [{"name": "보컬 마이크", "category": "SOUND", "qty": 4, "unitPrice": 30000, "amount": 120000}],
        "staff": [{"role": "ENGINEER", "count": 1, "start": "15:00", "end": "22:00"}],
        "setupStart": "15:00", "setupMinutes": 45, "teardownMinutes": 60,  # 15:45 설치 완료
        "includes": {"equipment": True, "engineer": True, "install": True, "transport": True},
        "amounts": {"items": 700000, "transport": 150000, "install": 200000, "labor": 300000, "etc": 0},
        "totalAmount": 1350000, "extraCostNote": "", "validUntil": show_date, "techNote": "",
    }, expect=201)

    # ---- 8. D 컨펌 → 엔지니어 건너뛰기(D에 엔지니어 포함) → 결제 가능 -----------------------------------
    user.post(f"/chat-rooms/{q_d['chatRoomId']}/start")
    card_d = d.post(f"/quotes/{q_d['quoteId']}/confirm-requests", expect=201)
    user.post(f"/confirm-requests/{card_d['id']}/view")
    accepted_d = user.post(f"/confirm-requests/{card_d['id']}/accept", idem=True)
    assert accepted_d["next"]["stageType"] == "ENGINEER"
    assert accepted_d["next"]["suggestSkip"] is True  # CHK-09: 앞 단계 견적에 엔지니어 포함
    skipped = user.post(f"/stages/{eq_stage}/advance",
                        {"action": "SKIP_NEXT", "acknowledgement": "STAGE_SKIP_OWNED", "noticeVersion": "1"}, idem=True)
    assert skipped["checkoutAvailable"] is True  # 계약 예시 없음 (AC-F3-14)

    # ---- 11. 통합 청구서 → 테스트 결제 (중복 응답 포함) (4번 T4-05·06) ------------------------------
    order = user.post(f"/performances/{perf_id}/order", expect=201)  # 계약 예시 없음
    assert order["itemsTotal"] == 1_850_000
    assert order["feeAmount"] == 92_500  # 5%, 원 미만 버림 (D-39)
    assert order["totalAmount"] == 1_942_500
    key = {"Idempotency-Key": uuid.uuid4().hex}
    first = user.post(f"/orders/{order['id']}/payments", {"amount": 1_942_500, "mockResult": "SUCCESS"}, headers=key)
    again = user.post(f"/orders/{order['id']}/payments", {"amount": 1_942_500, "mockResult": "SUCCESS"}, headers=key)
    assert first == again  # 같은 키 → 처음 응답 그대로, 결제는 한 번 (AC-F5-06)

    # ---- 12. 최종 담당표: 사용자·C·D는 같은 표, 확정 안 된 B는 404 (AC-F5-11) ----------------------------
    sheet_user = user.get(f"/performances/{perf_id}/sheet")
    assert sheet_user == c.get(f"/performances/{perf_id}/sheet") == d.get(f"/performances/{perf_id}/sheet")
    b.get(f"/performances/{perf_id}/sheet", expect=404)
