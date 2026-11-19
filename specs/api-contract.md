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
| 400 | `TOTAL_TOO_LARGE` | 견적 항목 합이 합계 칸(INT UNSIGNED) 최댓값을 넘음 |
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
| POST | `/auth/logout` | 누구나 | 쿠키 삭제 (204). 로그인 쿠키가 만료됐어도 남은 쿠키를 지운다 | F1-12 |
| POST | `/auth/refresh` | 쿠키 | Access 재발급 | |
| GET | `/auth/naver/start` | 🌐 | 네이버 로그인 이동 (`state` 쿠키) | F1-04 |
| GET | `/auth/naver/callback` | 🌐 | 기존 회원 → 로그인 / 처음 → `signupToken` 발급 후 추가 정보 화면으로 | F1-04, F1-10 |
| GET | `/auth/kakao/start` · `/auth/kakao/callback` | 🌐 | `KAKAO_LOGIN_ENABLED=false`면 404 | F1-08, F1-09 |
| POST | `/auth/social/complete` | signupToken | 추가 정보 + 약관 동의 → 가입 완료 | F1-05~07 |
| POST | `/auth/password-reset` | 🌐 | 재설정 링크 요청 `{email}` → 항상 202 `{demoLink}` (시연 서버 `APP_ENV=test`·`MAIL_BACKEND=console`만 `/password/reset?token=…`, 그 밖은 null). 같은 이메일 10분 3회 넘으면 429 `PASSWORD_RESET_RATE_LIMITED` (가입 안 한 이메일도 같은 규칙). CSRF 검사 예외 | F1-21, F1-23 |
| POST | `/auth/password-reset/confirm` | 🌐 | `{token, password}` → 204 + 그 사용자 Refresh 전부 폐기(바꾼 시각 전에 발급된 refresh 는 `/auth/refresh` 401) + 이 브라우저 로그인 쿠키 지움. 만료·사용됨 → 400 `RESET_TOKEN_INVALID`, 비밀번호 규칙 → 400 `VALIDATION_FAILED`. CSRF 검사 예외 | F1-22 |
| GET | `/me` | 로그인 | 내 정보, 역할, 업체 심사 상태 | F1-11 |
| POST | `/supplier/application` | S\* | 2단계 입점 신청 (사업자 정보, 등록증 파일 id) | F1-17, F1-18 |
| GET | `/supplier/application` | S\* | 심사 상태·반려 사유 | F1-20 |
| PUT | `/supplier/application` | S* | 반려 후 수정·재신청 | F1-20 |
| GET | `/supplier/terms-review` | S | 업체 약관 확인 상태 `{version, reviewed}` | |
| PUT | `/supplier/terms-review` | S | 현재 약관 확인 `{version}` → `{version, reviewed}` | |
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
| GET | `/supplier/venues` | S(VENUE) | 내 공간 목록 (숨긴 공간 포함, 등록 순, `VenueOut` 배열). 견적서 작성에서 공간 고르기 (#192) | F2-18 |
| POST | `/supplier/venues` | S(VENUE) | 공간 등록 | F2-01, F2-02 |
| PUT | `/supplier/venues/{venueId}` | S(본인) | 공간 수정 (확정 공연 스냅샷은 그대로) | F2-03 |
| GET | `/venues` | 🌐 | 탐색 `?sido=&sigungu=&minCapacity=&type=&bandAllowed=&sort=fee` | F5-01 |
| GET | `/venues/{venueId}` | 🌐 | 상세 (미확인 조건 구분) | |
| POST | `/files` | 로그인 | multipart `file`, `purpose` → `201 { "id", "url", "thumbUrl" }`. 용도별 형식·크기·공개 여부는 [uploads.md](uploads.md). 크기 초과 `413 FILE_TOO_LARGE` | |
| GET · DELETE | `/files/{id}` | 비공개 파일 권한자 / 본인(TEMP) | 비공개 파일 내려받기(남의 것 404) / 올렸다 뺀 사진 지우기 | |

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
| GET | `/me/posting-limit` | U | 게시 제한 여부·가능 시각, 반려 카운트 `{ afterChat, noChat, limited, availableAt }` — 채팅 후 5회·미응답 10회부터 마지막 반려 + 24시간, 마지막 반려 후 180일이면 0 | F4-05, F4-06 |

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
- 규칙 위반: `audience` 0·501, `rehearsalStart >= showStart`, `showDate < 오늘+14일` (D-53), 엔지니어 필요인데 `tasks` 비어 있음 → `400 VALIDATION_FAILED`.
- `needs`의 전체 구조는 data-model.md `performances.needs`.
- 선택지 코드 (화면 `features/request/codes.ts`와 같음, #65):
  | 칸 | 코드 |
  |---|---|
  | `venue.types` | `CONCERT_HALL` `CULTURE_SPACE` `ROOFTOP` `GARDEN` `WAREHOUSE` `ETC` (venues.venue_type) |
  | `venue.mustHave` | `BAND_ALLOWED` `EXTERNAL_EQUIPMENT_ALLOWED` `EXTERNAL_ENGINEER_ALLOWED` `HAS_WAITING_ROOM` `HAS_STAGE_PLATFORM` `HAS_PARKING` — **공간 조건(VenueSnapshot.conditions) 키와 같은 이름** (CHK-03이 그대로 비교) |
  | `equipment.services` | `TRANSPORT` `INSTALL` |
  | `engineer.tasks` | `FOH` `INSTALL_ASSIST` `SOUNDCHECK` `MONITOR` `WIRELESS` `RECORDING` `TROUBLESHOOT` (+ 기타는 `etc` 글) |
  | `engineer.conditions` | `BAND_EXPERIENCE` `REHEARSAL` `TEARDOWN` |

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
  "discountAmount": 0,
  "totalAmount": 1250000,
  "extraCostNote": "주차비 별도", "validUntil": "2026-11-19", "techNote": "전원 위치 확인 필요"
}
```
- 공연장 견적서는 `venueId`, `checkinTime`, `setupAvailableTime` 필수. `includes.equipment && includes.engineer`면 서버가 `isFullSpec=true`.
- 합계 검사 순서: `amounts 합 > INT UNSIGNED 최댓값` → `400 TOTAL_TOO_LARGE`, `discountAmount > amounts 합` → `400 VALIDATION_FAILED` (field `discountAmount`), `totalAmount ≠ amounts 합 − discountAmount` → `400 TOTAL_MISMATCH`, `totalAmount < 10,000` → `400 VALIDATION_FAILED` (`fieldErrors: [{ "field": "totalAmount", "reason": "금액을 다시 확인해 주세요. 견적서 합계는 10,000원 이상이어야 해요." }]`, D-43·D-44). `discountAmount`는 생략하면 0. 단계 부문과 견적 종류가 안 맞거나 단계가 열려 있지 않음 → `409 STAGE_NOT_OPEN`.
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
| GET | `/chat-rooms` | 로그인 | 내 채팅방 목록 (안 읽은 수, 내 고정 시각 `pinnedAt`). 검색·안 읽음만·정렬은 화면에서 거름 — 정렬은 고정한 방 먼저, 각 묶음 안은 최근 대화순 | F3-26, F3-27 |
| PUT · DELETE | `/chat-rooms/{roomId}/pin` | P | 상단 고정 / 고정 풀기 (나에게만). PUT → `200 { "roomId", "pinnedAt" }`, DELETE → `204`. 이미 그 상태면 그대로 같은 응답 | F3-27 |
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
| GET | `/performances/{id}/tech-checks` | P | 항목 목록 `{ performance{id,title,showDate,statusLabel}, creator{supplierId,name} 또는 null, canAdd, owners[{supplierId,label}], items[{id,item,detail,ownerSupplierId,ownerLabel,mine,answer,memo,answeredAt}] }` — 공연 주인·확정 업체만, 그 밖 404 | |
| POST | `/performances/{id}/tech-checks` | S(엔지니어 역할) | 항목 추가 `{ "item", "detail", "ownerSupplierId" }` — 엔지니어 단계 업체, 없으면 엔지니어 포함 장비 업체만(아니면 404). 담당은 이 공연 확정 업체. 사용자는 403 | F3-25 |
| PUT | `/tech-checks/{id}` | S(담당) | 답변 `{ "answer": "OK", "memo" }` (answer: OK·CONDITIONAL·IMPOSSIBLE·RECHECK) — 담당 아니면 404, 사용자는 403 | F3-25 |

---

## 5. F4 콘텐츠·상호작용

| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/pr-posts` | 🌐 | `?category=&sido=&page=` — category 생략 시 전체, 최신순(끌어올린 시각). 정지 업체 글 제외 | F4-04, F4-09, F4-11 |
| GET | `/pr-posts/{id}` | 🌐 | 상세 | F4-04 |
| POST | `/pr-posts` | S | 작성 — 승인 부문만(`403 CATEGORY_NOT_APPROVED`), 부문당 활성 1개(`409 ACTIVE_POST_EXISTS`), 블라인드 글 있음(`409 BLINDED_POST_EXISTS`), 연락처 패턴 경고 | F4-01~03, F4-10 |
| PUT · DELETE | `/pr-posts/{id}` | S(본인) | 수정·삭제 | |
| POST | `/pr-posts/{id}/bump` | S(본인) | 끌어올리기 (7일에 1회, `429 BUMP_TOO_SOON`) | |
| GET | `/suppliers/{id}/profile` | 🌐 | 업체 프로필 — 연락처·사업자 서류 제외, 정지 업체는 404 | F5-15 |
| GET | `/users/{id}/profile` | S(관계있는 업체), A | 개인 프로필 — 닉네임·사진·가입일·이용 횟수·반려 횟수. 공고·오퍼·채팅으로 만난 적 없으면 404 | F5-16, F5-17 |
| PATCH | `/me/profile` | U | 닉네임(`409 NICKNAME_TAKEN`)·프로필 사진 변경 | F5-16 |
| POST | `/reports` | 로그인 | `{ "targetType": "PR_POST", "targetId": 3, "reason" }` — targetType: `CHAT_ROOM` · `PR_POST` · `FREE_POST` · `FREE_COMMENT` · `USER` | F4-03, F4-15 |
| GET | `/free-posts` | 🌐 | 커뮤니티 `?category=&sort=&field=&q=&page=` (category: FREE · QUESTION · INFO · NEWS, sort: latest · comments · views, field: all · title · author) — 20개, 정지 회원·블라인드 글 제외 | F4-12, F4-13 |
| GET | `/free-posts/{id}` | 🌐 | 글 + 댓글·답글 목록(`comments[].replies`) + 이전·다음 글, 조회수 +1. 로그인했으면 내 도움 돼요·저장 여부(`myHelpful`·`bookmarked`) 포함. 블라인드 글은 작성자만(사유 포함), 나머지 404 | F4-12 |
| POST | `/free-posts` | U, S | `{ "category", "title", "body", "photos" }` — 1분에 1개(`403 POSTING_RATE_LIMITED`), 연락처 패턴 경고 | F4-16 |
| PUT · DELETE | `/free-posts/{id}` | 본인 | 수정·삭제 (댓글 있으면 DELETED로 남김) | |
| POST | `/free-posts/{id}/comments` | U, S | `{ "body", "parentId": null }` 500자 — 10초에 1개, 글쓴이(답글이면 댓글 작성자)에게 알림. 답글의 답글은 `400 VALIDATION_FAILED` | F4-14 |
| DELETE | `/free-comments/{id}` | 본인 | 댓글 삭제 → "삭제된 댓글이에요" 자리만 남김 (답글은 그대로, FR-COMM-03). 남의 댓글 404 | |
| PUT · DELETE | `/free-helpfuls` | U, S | `{ "targetType": "POST", "targetId": 12 }` — 도움 돼요 누르기 / 취소. 응답 `{ "helpfulCount" }` | F4-17 |
| PUT · DELETE | `/free-posts/{id}/bookmark` | U, S | 저장 / 저장 취소 | F4-17 |
| GET | `/me/free-bookmarks` | U, S | 내 저장 글 | F4-17 |
| DELETE | `/free-comments/{id}` | 본인 | "삭제된 댓글이에요"로 남김 | |

---

### 5.1 알림 (공통, 3번)

| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/me/notifications` | 로그인 (S\*, 정지 포함) | `?category=&before=` 최신순 20개 → `{ "items": [{ id, type, category, title, body, link, read, createdAt }], "nextBefore", "unreadCount" }` | |
| GET | `/me/notifications/unread-count` | 로그인 | `{ "count" }` — 머리 종 배지 | |
| POST | `/me/notifications/read` | 로그인 | `{ "ids": [12] }` 또는 `{ "all": true }` → `204`. 남의 id는 무시 | |

- 어떤 일에 누구에게 어떤 알림이 가는지는 [notifications.md](notifications.md) 3장. 채팅 메시지는 알림을 만들지 않는다.

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
| GET | `/supplier/reservations` | S | 내 업체가 확정된 공연의 일정·담당 부문·견적 합계·결제/취소 상태 | |
| GET | `/performances/{id}/sheet` | U, 확정 업체 | 최종 담당표 — **결제 후에만 연락처 포함**, 확정 안 된 업체 404 | F5-11, F5-12 |

**GET /performances/{id}/cancel-quote** (D-1, 업체 금액 185만 원 + 이용료 5% 예)
```json
{
  "phase": "D1", "ratePercent": 70,
  "paid": 1942500, "penaltyBase": 1850000, "penaltyTotal": 1295000,
  "penaltyBySupplier": [ {"supplierId": 3, "name": "C 컬처스페이스", "amount": 350000},
                         {"supplierId": 4, "name": "D 사운드", "amount": 945000} ],
  "feeRefunded": 0, "refundTotal": 555000
}
```
- `phase`: `BEFORE_PAYMENT`·`GRACE_12H`·`D30_PLUS`(0%) / `D29_D15` 10% / `D14_D8` 30% / `D7_D2` 50% / `D1` 70% / `D0` 100% / `SUPPLIER_FAULT` (D-57). `GRACE_12H`·`D30_PLUS`는 `feeRefunded`=이용료 전액. 결제 마감이 지나 자동 취소된 공연에 결제를 요청하면 `409 INVALID_STATE`.
- 위약금 기준 금액은 업체 금액 합(`itemsTotal`). 플랫폼 이용료는 사용자 사정 취소 시 환불하지 않고(위약금 0% 구간은 환불, D-57), 업체 사정 취소 시 전액 환불한다 (D-39).
- 결제 요청의 `amount`가 서버 계산값과 다르면 `400 AMOUNT_MISMATCH`.

### 6.1.1 고객지원

| 메서드 | 경로 | 권한 | 설명 | AC |
|---|---|---|---|---|
| GET | `/notices` | 🌐 | 공지 목록 `?page=` (20개씩) — 고정 글 먼저, 그다음 게시일 최신. 게시일이 미래인 글은 안 보임. `{items:[{id, category, title, isPinned, publishedAt}], page, totalPages, total}` | F5-21 |
| GET | `/notices/{id}` | 🌐 | 공지 상세 `{…목록 칸, body, prev, next}` — prev = 바로 먼저 올린 글, next = 바로 나중에 올린 글 (`{id, title, publishedAt}` 또는 null). 없거나 게시 전이면 404. 쓰기는 SQLAdmin(공지사항)만 | |
| POST | `/inquiries` | 로그인 (S\*, 정지 계정 포함) | `{ "category", "performanceId", "title", "body", "fileIds": [41] }` — category: PAYMENT · QUOTE · SUPPLIER · ACCOUNT · ETC. 사진은 먼저 `POST /files` (purpose `INQUIRY`, 최대 3장, uploads.md) | F5-18 |
| GET | `/me/inquiries` | 로그인 | 내 문의 목록 | |
| GET | `/inquiries/{id}` | 본인 | 문의 + 답변. 남의 문의는 404 | F5-20 |
| PUT · DELETE | `/inquiries/{id}` | 본인 | 답변 대기일 때만. 답변 완료면 `409 INVALID_STATE` | F5-19 |

- 정지된 계정은 다른 API에서 `403 ACCOUNT_SUSPENDED`를 받지만, 로그인·로그아웃·`/inquiries`·`/me/inquiries`·공지·약관은 쓸 수 있다.
- FAQ·업체 이용 가이드·약관은 화면 코드에 둔다 (API 없음).

### 6.2 관리자

> 관리자 기능은 **REST API가 아니라 SQLAdmin(`/admin`)의 액션**으로 제공한다 ([plan.md 6.5](plan.md)). 아래 표는 각 액션이 부르는 서비스와 AC를 정리한 것이며, React 앱은 이 경로들을 호출하지 않는다.

| 구분 | SQLAdmin 위치 | 권한 | 설명 | AC |
|---|---|---|---|---|
| 목록 | 업체 심사 뷰 (필터: 심사 중) | A | 심사 대기 목록 | F1-19 |
| 액션 | 업체 심사 → [승인] / [반려] | A | 승인 / 반려(사유 필수) | F1-19, F1-20 |
| 목록 | 신고 뷰 | A | 신고 목록 | |
| 액션 | 신고 → [대상 열기] | A | 신고된 채팅방·게시글 열람 | |
| 액션 | 회원 → [경고] | A | 경고 (3회째 자동 정지) | F4-08, F5-10 |
| 액션 | PR 게시글 → [블라인드] / [블라인드 해제] | A | 블라인드 (사유) + 업체 경고 1회 / 해제 | F4-03, F4-10 |
| 액션 | 커뮤니티 글·댓글 → [블라인드] / [블라인드 해제] | A | 블라인드 (사유) + 작성자 경고 1회 / 해제 | F4-15 |
| 액션 | 1:1 문의 → [답변] | A | 답변 저장 → 상태 ANSWERED + 알림 | F5-19 |
| 목록·편집 | 공지사항 뷰 | A | 작성·수정·상단 고정·삭제 | F5-21 |
| 상세 | 공연 상세 → 이력 패널 | A | 상태 변경·결제·취소 이력 시간순 | F5-13 |
| 액션 | 시연 도구 → [시연 데이터 초기화] | A + **T** | 시연 데이터 초기화 | F5-14 |

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
| `notification` | 알림 배지 | `{ id, type, category, title, body, link, createdAt }` — 종류는 [notifications.md](notifications.md) |

```json
{ "type": "message.created", "data": { "roomId": 31, "message": { "id": 120, "type": "TEXT", "body": "드럼 마이크도 추가돼요?", "senderId": 12, "contactWarning": false, "createdAt": "2026-11-12T15:30:00+09:00" } } }
```

---

## 8. 열린 질문
- ~~파일 업로드 크기 제한~~ → uploads.md (D-51)
