# STAGE DUCK API 계약 (api-contract.md)

| 항목 | 내용 |
|---|---|
| 버전 | 0.1 (초안) |
| 작성일 | 2026-11-12 |
| 서버 | FastAPI — 실행 중에는 `/docs`(Swagger)에서 같은 내용을 확인한다 |
| 입력 | [spec.md](spec.md), [data-model.md](data-model.md) |

---

## 1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| Base URL | `/api/v1` |
| 형식 | JSON, UTF-8. 필드명 **camelCase** (DB는 snake_case, Pydantic alias로 변환) |
| 인증 | httpOnly 쿠키(`access_token`, `refresh_token`). 로그인 안 함 → `401` |
| CSRF | POST·PUT·PATCH·DELETE는 `X-CSRF-Token` 헤더 필수 (쿠키 `csrf_token` 값) |
| 시간 | 날짜 `2026-11-21`, 시각 `17:00`, 일시 `2026-11-12T15:30:00+09:00` |
| 금액 | 원 단위 정수 `1850000`. 합계·결제·위약금은 서버가 계산 |
| 목록 | `?page=1&size=20` → `{ "items": [], "page": 1, "size": 20, "total": 57 }` |
| 권한 | 남의 리소스는 `404 NOT_FOUND` (존재 여부 숨김) |
| 버전 충돌 | 수정 요청 본문에 `version`(현재 버전) → 다르면 `409 VERSION_CONFLICT` |
| 멱등 | 결제·컨펌·다음 단계 요청은 `Idempotency-Key` 헤더 필수. 같은 키 → 처음 응답 그대로 |

### 1.1 오류 응답

```json
{
  "code": "STAGE_NOT_OPEN",
  "message": "아직 장비 단계가 열리지 않았어요. 공연장이 정해지면 견적을 보낼 수 있어요.",
  "fieldErrors": [ { "field": "audience", "reason": "1~500 사이로 입력해 주세요" } ],
  "traceId": "a1b2c3d4"
}
```

| HTTP | code | 상황 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | 입력 형식·범위 오류 (fieldErrors 포함) |
| 400 | `TOTAL_MISMATCH` · `AMOUNT_MISMATCH` | 견적 합계·결제 금액 조작 |
| 400 | `UNDER_AGE` · `TERMS_REQUIRED` · `INVALID_BUSINESS_NO` | 가입·입점 규칙 |
| 401 | `UNAUTHENTICATED` · `LOGIN_LOCKED` | 로그인 필요 / 5회 실패 잠금 |
| 403 | `SUPPLIER_NOT_APPROVED` · `ACCOUNT_SUSPENDED` · `POSTING_RATE_LIMITED` · `CHAT_NOT_STARTED` · `CATEGORY_NOT_APPROVED` | 내 리소스지만 지금 할 수 없음 |
| 404 | `NOT_FOUND` | 없음 또는 권한 없음 |
| 409 | `INVALID_STATE` · `STAGE_NOT_OPEN` · `STAGE_ALREADY_CONFIRMED` · `VERSION_CONFLICT` · `CHECK_CONFLICT` · `OFFER_LIMIT` · `ACTIVE_POST_EXISTS` · `ORDER_EXISTS` | 상태 흐름 위반 |
| 422 | `CONFIRM_REQUEST_STALE` · `DETAIL_NOT_VIEWED` · `CONFIRM_REQUEST_EXPIRED` | 다른 버전·미열람·만료 카드로 컨펌 |

### 1.2 권한 표기
🌐 누구나 · **U** 사용자(본인) · **S** 업체(승인) · **S\*** 업체(심사 중 포함) · **P** 참여자(그 채팅·공연의 사용자 또는 해당 업체) · **A** 관리자 · **T** 테스트 환경만

---

## 2. F1 회원·인증

| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| POST | `/auth/signup` | 🌐 | 사용자 이메일 가입 | F1-01~03 |
| POST | `/auth/signup/supplier` | 🌐 | 업체 1단계 (이메일·담당자·약관) | F1-17 |
| POST | `/auth/login` | 🌐 | 로그인 → 쿠키 발급, 응답에 `role`, `landing` | F1-11 |
| POST | `/auth/logout` | 로그인 | 쿠키 삭제 | F1-12 |
| POST | `/auth/refresh` | 쿠키 | Access 재발급 | |
| GET | `/auth/naver/start` | 🌐 | 네이버 로그인 이동 (`state` 쿠키) | F1-04 |
| GET | `/auth/naver/callback` | 🌐 | 기존 회원 → 로그인 / 처음 → `signupToken` 발급 후 추가 정보 화면으로 | F1-04, F1-10 |
| GET | `/auth/kakao/start` · `/auth/kakao/callback` | 🌐 | `KAKAO_LOGIN_ENABLED=false`면 404 | F1-08, F1-09 |
| POST | `/auth/social/complete` | signupToken | 추가 정보 + 약관 동의 → 가입 완료 | F1-05~07 |
| GET | `/me` | 로그인 | 내 정보, 역할, 업체 심사 상태 | F1-11 |
| POST | `/supplier/application` | S\* | 2단계 입점 신청 (사업자 정보, 등록증 파일 id) | F1-17, F1-18 |
| GET | `/supplier/application` | S\* | 심사 상태·반려 사유 | F1-20 |
| PUT | `/supplier/application` | S\* | 반려 후 수정·재신청 | F1-20 |
| POST | `/dev/switch-account` | **T** | 시연 계정 전환 | F1-16 |

**POST /auth/signup**
```json
// 요청
{
  "name": "김덕구", "phone": "01012345678", "email": "host@stageduck.test",
  "birthDate": "1999-03-02", "nickname": "덕구밴드", "password": "duck1234",
  "signupPurpose": "PERFORMANCE", "musicianType": "BAND", "signupChannel": "SNS",
  "agreements": { "service": true, "privacyRequired": true, "privacyOptional": false, "marketing": false }
}
// 201 응답
{ "id": 12, "role": "USER", "nickname": "덕구밴드", "landing": "/me/performances" }
// 400 — 만 14세 미만
{ "code": "UNDER_AGE", "message": "만 14세 이상만 가입할 수 있어요.", "fieldErrors": [{"field":"birthDate","reason":"만 14세 미만"}] }
```

**POST /supplier/application**
```json
{
  "businessType": "SOLE_PROPRIETOR", "companyName": "D 사운드", "representativeName": "이음향",
  "businessRegNo": "1234567891", "businessRegFileId": 301, "businessAddress": "광주 북구 가상로 1",
  "mainPhone": "0621234567", "mailOrderNo": null, "categories": ["EQUIPMENT","INSTALL","ENGINEER"]
}
```
- `businessType=INDIVIDUAL`이면 `businessRegNo`·`businessRegFileId`·`businessAddress`는 보내지 않는다 (보내면 무시).
- 체크섬 오류 → `400 INVALID_BUSINESS_NO`.

---

## 3. F2 기본 자원

### 3.1 업체 서비스·공간
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| PUT | `/supplier/profile` | S | 3단계: 지역, 소개, 사진, 설치·철수 시간, 엔지니어 정보, 신뢰 지표 | |
| PUT | `/supplier/equipment` | S | 보유 장비 목록 (자유 입력, 전체 교체) | |
| POST | `/supplier/venues` | S(VENUE) | 공간 등록 | F2-01, F2-02 |
| PUT | `/supplier/venues/{venueId}` | S(본인) | 공간 수정 (확정 공연 스냅샷은 그대로) | F2-03 |
| GET | `/venues` | 🌐 | 탐색 `?sido=&sigungu=&minCapacity=&type=&bandAllowed=&sort=fee` | F5-01 |
| GET | `/venues/{venueId}` | 🌐 | 상세 (미확인 조건 구분) | |
| POST | `/files` | 로그인 | 파일 업로드 (이미지·PDF, 10MB 이하 (제안)) → `{ "id", "url" }` | |

### 3.2 요청서·공고
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| POST | `/performances` | U | 요청서 작성 (DRAFT, v1) | F2-04~07 |
| PUT | `/performances/{id}` | U | 수정 → 게시 후라면 새 버전, 진행 중 카드 무효·컨펌 단계 재확인 | F2-13, F3-24 |
| GET | `/performances?mine=true` | U | 내 공연 + 단계 현황 + 다음 할 일 | F5-02 |
| GET | `/performances/{id}` | U | 현재 버전 + 단계 목록 | F5-02 |
| GET | `/performances/{id}/versions` | U | 버전 이력·변경 항목 | F2-13 |
| POST | `/performances/{id}/publish` | U | 게시: STEP2로 단계 생성, 첫 단계 OPEN. 반려 제한 검사 | F2-08, F2-11, F4-05 |
| POST | `/performances/{id}/withdraw` | U | 공고 내림 → 반려 이벤트 기록 | F4-05 |
| GET | `/me/posting-limit` | U | 게시 제한 여부·가능 시각, 반려 카운트 | F4-05, F4-06 |

**POST /performances**
```json
{
  "title": "가을밤 밴드 공연", "form": "BAND",
  "lineup": [{"part":"보컬","count":1},{"part":"기타","count":2},{"part":"베이스","count":1},{"part":"드럼","count":1}],
  "showDate": "2026-11-21", "rehearsalStart": "17:00", "showStart": "19:00", "showEnd": "21:00",
  "audience": 80, "sido": "광주광역시", "sigungu": "동구", "contactPhone": null,
  "needs": {
    "venue": { "needed": true, "types": ["CULTURE_SPACE"], "capacity": 80, "mustHave": ["BAND_ALLOWED"] },
    "equipment": { "needed": true, "proposalWanted": true, "items": [{"name":"보컬 마이크","qty":4}], "services": ["TRANSPORT","INSTALL"], "owned": [] },
    "engineer": { "needed": true, "tasks": ["FOH","INSTALL_ASSIST"], "conditions": ["BAND_EXPERIENCE"] }
  }
}
```
- 규칙 위반: `audience` 0·501, `rehearsalStart >= showStart`, `showDate < 오늘+3일`, 엔지니어 필요인데 `tasks` 비어 있음 → `400 VALIDATION_FAILED`.
- `needs`의 전체 구조는 data-model.md `performances.needs`.

### 3.3 공고(업체)·견적서
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/postings` | S | 공고 목록: **내 승인 부문 × 현재 열린 단계**만, `?sido=` 필터, 공연일 임박 순. 사용자 닉네임·반려 횟수·이용 횟수 포함 | F2-11, F2-12, F3-01, F4-07 |
| GET | `/postings/{stageId}` | S | 공고 상세 + 앞 단계 확정 정보 (공연장 입실·기본 장비·전원 등) | F3-03 |
| POST | `/stages/{stageId}/quotes` | S | 견적서 전송 (여러 개 가능, `label`) → 사용자 견적함 + 알림 | F2-15, F2-16, F2-18, F2-19 |
| PUT | `/quotes/{quoteId}` | S(본인) | 견적서 수정 → 새 버전, 대기 카드 무효 | F2-20, F3-09 |
| POST | `/quotes/{quoteId}/withdraw` | S(본인) | 철회 | |
| GET | `/quotes/{quoteId}` | P | 견적서 (현재 버전 + 이력) — 다른 업체는 404 | F1-14, F2-14 |

**POST /stages/{stageId}/quotes**
```json
{
  "label": "기본형",
  "venueId": null,
  "items": [ {"name":"보컬 마이크","category":"SOUND","qty":2,"unitPrice":30000,"amount":60000} ],
  "staff": [ {"role":"ENGINEER","count":1,"start":"15:00","end":"22:00"} ],
  "setupStart": "15:00", "setupMinutes": 90, "teardownMinutes": 60,
  "includes": { "equipment": true, "engineer": true, "install": true, "transport": true },
  "amounts": { "items": 600000, "transport": 150000, "install": 200000, "labor": 300000, "etc": 0 },
  "totalAmount": 1250000,
  "extraCostNote": "주차비 별도", "validUntil": "2026-11-19", "techNote": "전원 위치 확인 필요"
}
```
- 공연장 견적서는 `venueId`, `checkinTime`, `setupAvailableTime` 필수. `includes.equipment && includes.engineer`면 서버가 `isFullSpec=true`.
- `totalAmount ≠ amounts 합` → `400 TOTAL_MISMATCH`. 단계 부문과 견적 종류가 안 맞거나 단계가 열려 있지 않음 → `409 STAGE_NOT_OPEN`.
- 응답 `201`: `{ "quoteId": 77, "version": 1, "chatRoomId": 31, "checks": [ ... ] }`

---

## 4. F3 관계·참여

### 4.1 견적함·비교·검사
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/stages/{stageId}/quotes` | U | 단계별 견적 비교: 견적서 + 자동 검사 + 풀스펙 배지 + 오퍼 여부 | F3-20~24 |
| GET | `/quotes/{quoteId}/checks` | P | 자동 검사 결과만 | F3-21~24 |

**검사 결과 형식**
```json
{
  "quoteId": 41, "version": 1, "overall": "WARNING",
  "checks": [
    { "id": "CHK-02", "result": "WARNING", "message": "설치에 쓸 수 있는 시간이 0분이에요 (설치 가능 17:00, 리허설 17:00)." },
    { "id": "CHK-01", "result": "PASS", "message": "수용 인원 120명 ≥ 관객 80명" }
  ]
}
```
`overall`: 하나라도 `CONFLICT`면 `CONFLICT`, 아니면 `WARNING` > `NEEDS_INFO` > `PASS` 순.

### 4.2 채팅
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/chat-rooms` | 로그인 | 내 채팅방 목록 (안 읽은 수) | |
| POST | `/chat-rooms/{roomId}/start` | U | [채팅 시작] → `startedAt` 기록 (컨택) | F3-06 |
| GET | `/chat-rooms/{roomId}/messages` | P | `?after={messageId}&limit=50` | F3-07 |
| POST | `/chat-rooms/{roomId}/messages` | P | `{ "type": "TEXT"|"IMAGE"|"FILE", "body", "fileId" }` — 시작 전 업체 → `403 CHAT_NOT_STARTED`. 연락처 패턴 → `contactWarning: true` | F3-06, F3-08, F3-15 |
| POST | `/chat-rooms/{roomId}/read` | P | `{ "lastMessageId": 120 }` | F3-08 |
| POST | `/chat-rooms/{roomId}/report` | P | 신고 | F4-03 |

### 4.3 견적 내역 확인·컨펌·다음 단계
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| POST | `/quotes/{quoteId}/confirm-requests` | S(본인) | [견적 내역 확인] 카드 전송 (현재 버전 고정, 48시간) | F3-09, F3-12 |
| POST | `/confirm-requests/{id}/view` | U | 내역서 열람 기록 (`viewedAt`) | F3-10 |
| POST | `/confirm-requests/{id}/accept` | U | **컨펌** (`Idempotency-Key`) | F3-10, F3-11, F3-13 |
| POST | `/confirm-requests/{id}/renegotiate` | U | [다시 조율] | |
| POST | `/stages/{stageId}/advance` | U | [다음 단계로] `{ "action": "OPEN_NEXT" | "SKIP_NEXT", "acknowledgement": "STAGE_SKIP_OWNED", "noticeVersion": "1" }` | F3-02, F3-05, F3-14, F3-23 |
| POST | `/performances/{id}/declare-all-secured` | U | "전부 구했어요" (재확인 동의 필수) → 남은 단계 SKIPPED | F3-04 |

**POST /confirm-requests/{id}/accept**
```json
// 200
{ "stageId": 5, "stageStatus": "CONFIRMED", "confirmedQuoteVersionId": 88,
  "next": { "stageType": "EQUIPMENT", "suggestSkip": false }, "checkoutAvailable": false }
// 409 — 다른 탭에서 이미 컨펌
{ "code": "STAGE_ALREADY_CONFIRMED", "message": "이 단계는 이미 다른 견적서로 정해졌어요." }
// 422 — 견적서가 수정됨
{ "code": "CONFIRM_REQUEST_STALE", "message": "새 견적이 있어요. 업체에게 새 견적 내역 확인을 요청해 주세요." }
```
- 검사 실패 순서: 카드 상태·만료(`422 CONFIRM_REQUEST_EXPIRED`) → 열람(`422 DETAIL_NOT_VIEWED`) → 버전(`422 CONFIRM_REQUEST_STALE`) → 자동 검사(`409 CHECK_CONFLICT`) → 단계(`409 STAGE_ALREADY_CONFIRMED`).
- 성공하면 같은 단계 다른 견적서 `CLOSED` + 해당 채팅방에 안내 카드 (반려 이벤트 없음).

### 4.4 직접 오퍼·관심 업체
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| POST | `/stages/{stageId}/offers` | U | `{ "supplierId": 9 }` — 열린 단계·해당 부문만, 동시 10곳 (`409 OFFER_LIMIT`) | F3-16, F3-17 |
| GET | `/supplier/offers` | S | 받은 오퍼 | |
| POST | `/offers/{id}/decline` | S(본인) | 거절 (사유 선택) | |
| — | 오퍼를 받은 업체가 `POST /stages/{stageId}/quotes`에 `offerId`를 넣으면 견적서에 "내가 오퍼한 업체" 표시 | | | F3-18 |
| POST | `/favorites` · DELETE `/favorites/{supplierId}` · GET `/favorites` | U | 관심 업체 저장 | F3-16, F3-19 |

### 4.5 기술 확인
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/performances/{id}/tech-checks` | P | 항목 목록 | |
| POST | `/performances/{id}/tech-checks` | S(엔지니어 역할) | 항목 추가 `{ "item", "ownerSupplierId" }` | F3-25 |
| PUT | `/tech-checks/{id}` | S(담당) | 답변 `{ "answer": "OK", "memo" }` — 담당 아니면 404 | F3-25 |

---

## 5. F4 콘텐츠·상호작용

| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/pr-posts` | 🌐 | `?category=&sido=&type=&minCapacity=&sort=latest` | F4-04 |
| GET | `/pr-posts/{id}` | 🌐 | 상세 | F4-04 |
| POST | `/pr-posts` | S | 작성 — 승인 부문만(`403 CATEGORY_NOT_APPROVED`), 부문당 활성 1개(`409 ACTIVE_POST_EXISTS`), 연락처 패턴 경고 | F4-01~03 |
| PUT · DELETE | `/pr-posts/{id}` | S(본인) | 수정·삭제 | |
| POST | `/pr-posts/{id}/bump` | S(본인) | 끌어올리기 (7일에 1회 (제안)) | |
| POST | `/reports` | 로그인 | `{ "targetType": "PR_POST", "targetId": 3, "reason" }` | F4-03 |

---

## 6. F5 부가 기능

### 6.1 결제·취소
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| POST | `/performances/{id}/order` | U | 통합 청구서 발행 — 모든 필요 단계 CONFIRMED/SKIPPED 아니면 `409 INVALID_STATE` | F5-03, F5-04 |
| GET | `/performances/{id}/order` | U | 청구서 (업체별 금액, 수수료, 합계, 장부 상태) | F5-03, F5-07 |
| POST | `/orders/{orderId}/payments` | U | 테스트 결제 (`Idempotency-Key`) `{ "amount": 1942500, "mockResult": "SUCCESS" | "FAIL" }` | F5-05, F5-06 |
| POST | `/payments/mock/callback` | 시스템 | 모의 결제 결과 콜백 `{ "providerTxId", "result" }` — 같은 `providerTxId`는 한 번만 반영 | F5-06 |
| GET | `/performances/{id}/cancel-quote` | U | 지금 취소하면 내는 금액·환불 예정액 미리보기 | F5-08, F5-09 |
| POST | `/performances/{id}/cancel` | U | 사용자 취소 | F5-08, F5-09 |
| POST | `/performances/{id}/cancel-by-supplier` | S(확정 업체) | 업체 사정 취소 → 전액 환불 + 경고 | F5-10 |
| GET | `/performances/{id}/sheet` | U, 확정 업체 | 최종 담당표 — **결제 후에만 연락처 포함**, 확정 안 된 업체 404 | F5-11, F5-12 |

**GET /performances/{id}/cancel-quote** (D-1, 185만 원 + 수수료 5% 예)
```json
{
  "phase": "D1", "ratePercent": 70,
  "paid": 1942500, "penaltyBase": 1850000, "penaltyTotal": 1295000,
  "penaltyBySupplier": [ {"supplierId": 3, "name": "C 컬처스페이스", "amount": 350000},
                         {"supplierId": 4, "name": "D 사운드", "amount": 945000} ],
  "refundTotal": 647500
}
```
- 위약금 기준 금액은 업체 금액 합(`itemsTotal`). 수수료 환불 여부는 [열린 질문].
- 결제 요청의 `amount`가 서버 계산값과 다르면 `400 AMOUNT_MISMATCH`.

### 6.2 관리자
| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/admin/applications` | A | 심사 대기 목록 | F1-19 |
| POST | `/admin/applications/{supplierId}/approve` · `/reject` | A | 승인 / 반려(사유 필수) | F1-19, F1-20 |
| GET | `/admin/reports` | A | 신고 목록 | |
| GET | `/admin/reports/{id}/target` | A | 신고된 채팅방·게시글 열람 | |
| POST | `/admin/users/{userId}/warnings` | A | 경고 (3회째 자동 정지) | F4-08, F5-10 |
| POST | `/admin/pr-posts/{id}/blind` | A | 블라인드 (사유) | F4-03 |
| GET | `/admin/performances/{id}/history` | A | 상태 변경·결제·취소 이력 시간순 | F5-13 |
| POST | `/dev/reset-demo` | A + **T** | 시연 데이터 초기화 | F5-14 |

---

## 7. WebSocket — 실시간 이벤트

- 연결: `GET /ws` (쿠키 인증, 실패 시 4401로 닫음). 하나의 연결로 내 채팅방·알림 이벤트를 모두 받는다.
- **보내기는 REST**, WebSocket은 **받기 전용**. 재연결 후에는 `GET /chat-rooms/{id}/messages?after=`로 빠진 것을 채운다.

| type | 언제 | payload |
|---|---|---|
| `message.created` | 새 메시지·카드 | `{ roomId, message: { id, type, body, attachmentUrl, refId, senderId, contactWarning, createdAt } }` |
| `message.read` | 상대가 읽음 | `{ roomId, userId, lastMessageId }` |
| `quote.updated` | 견적서 새 버전 | `{ roomId, quoteId, version, changed: ["setupMinutes"] }` |
| `confirm.updated` | 카드 상태 변경 | `{ roomId, confirmRequestId, status }` |
| `stage.updated` | 단계 상태 변경 | `{ performanceId, stageId, stageType, status }` |
| `notification` | 알림 배지 | `{ id, kind, title, link }` |

```json
{ "type": "message.created", "data": { "roomId": 31, "message": { "id": 120, "type": "TEXT", "body": "드럼 마이크도 추가돼요?", "senderId": 12, "contactWarning": false, "createdAt": "2026-11-12T15:30:00+09:00" } } }
```

---

## 8. 열린 질문
- 사용자 취소 시 플랫폼 수수료도 환불하는지 (제안: 결제 전 취소는 수수료 없음, 결제 후 취소는 수수료 환불)
- 파일 업로드 크기 제한 (제안 10MB)
