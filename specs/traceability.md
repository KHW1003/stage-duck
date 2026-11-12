# STAGE DUCK 스펙 ↔ 계획 추적표 (traceability.md)

| 항목 | 내용 |
|---|---|
| 버전 | 0.1 (초안) |
| 작성일 | 2026-11-12 |
| 목적 | spec.md의 **모든 수용 기준(87개)** 이 API·테이블·화면·테스트에 반영됐는지 확인 |
| 입력 | [spec.md](spec.md) · [plan.md](plan.md) · [data-model.md](data-model.md) · [api-contract.md](api-contract.md) · [user-flow.md](user-flow.md) |

표기: 테스트 `BE` = pytest (`backend/tests/`), `FE` = Vitest (`frontend/tests/`), `E2E` = Playwright. 테스트 이름에 AC ID를 넣는다 (예: `test_ac_f1_01_...`).
API 경로의 `/api/v1`은 생략했다.

---

## F1 회원·인증

| AC | 요약 | FR | API | 테이블 | 화면 | 테스트 |
|---|---|---|---|---|---|---|
| F1-01 | 필수 항목 비면 가입 안 됨 | AUTH-01 | POST /auth/signup | users | /signup | BE, FE |
| F1-02 | 마케팅 미동의 가입 가능 | AUTH-01 | POST /auth/signup | terms_agreements | /signup | BE |
| F1-03 | 만 14세 미만 거부 | AUTH-01 | POST /auth/signup (`UNDER_AGE`) | users.birth_date | /signup | BE |
| F1-04 | 네이버 로그인 → 추가 정보 / 내 공연 | AUTH-02 | GET /auth/naver/start·callback | social_accounts | /login, /signup/extra | BE (OAuth 목업) |
| F1-05 | 선택 동의 해제해도 직접 입력해 가입 | AUTH-02·04 | POST /auth/social/complete | users | /signup/extra | BE |
| F1-06 | 소셜 값 미리 채움·수정 가능 | AUTH-04 | GET callback → signupToken | — | /signup/extra | FE |
| F1-07 | 우리 약관 미동의 시 미완료 | AUTH-04 | POST /auth/social/complete (`TERMS_REQUIRED`) | terms_agreements | /signup/extra | BE |
| F1-08 | 카카오 꺼짐 → 거부, 버튼 없음 | AUTH-03 | GET /auth/kakao/* → 404 | — | /login | BE, FE |
| F1-09 | 카카오 켜면 가입·로그인 | AUTH-03 | GET /auth/kakao/callback | social_accounts | /login | BE (설정 켬) |
| F1-10 | 같은 이메일 자동 병합 안 함 | AUTH-05 | GET /auth/naver/callback | social_accounts UNIQUE(provider, provider_user_id) | — | BE |
| F1-11 | 역할별 첫 화면 | AUTH-06 | POST /auth/login (`landing`), GET /me | users.role | /login | BE, FE |
| F1-12 | 로그아웃 후 뒤로 가기 정보 안 보임 | AUTH-06 | POST /auth/logout | — | 전체 (보호 라우트, 캐시 삭제) | FE, E2E |
| F1-13 | 남의 공연·채팅방 → 404 | AUTH-07 | GET /performances/{id}, /chat-rooms/{id}/messages | — | — | BE |
| F1-14 | 남의 견적서 → 거부 | AUTH-07 | GET /quotes/{id} | — | — | BE |
| F1-15 | 심사 중 업체 견적 전송 거부 | AUTH-07 | POST /stages/{id}/quotes (`SUPPLIER_NOT_APPROVED`) | suppliers.review_status | — | BE |
| F1-16 | 운영 설정에서 계정 전환 없음 | AUTH-08 | POST /dev/switch-account | — | (테스트 환경 툴바) | BE |
| F1-17 | 개인 선택 시 사업자 칸 사라짐 | SUP-02 | POST /supplier/application | suppliers.business_type | /supplier/onboarding | FE |
| F1-18 | 체크섬 틀린 사업자번호 거부 | SUP-02 | POST /supplier/application (`INVALID_BUSINESS_NO`) | suppliers.business_reg_no | /supplier/onboarding | BE (단위), FE |
| F1-19 | 승인 → 3단계·공고 목록 열림 | SUP-03 | POST /admin/applications/{id}/approve, GET /postings | suppliers, status_histories | /admin/applications, /supplier/postings | BE |
| F1-20 | 반려 사유 보이고 재신청 | SUP-03 | POST …/reject, GET·PUT /supplier/application | suppliers.reject_reason | /supplier/onboarding | BE |

## F2 기본 자원

| AC | 요약 | FR | API | 테이블 | 화면 | 테스트 |
|---|---|---|---|---|---|---|
| F2-01 | 수용 인원 501 거부 | SPACE-01 | POST /supplier/venues | venues CHECK max_capacity | /supplier/venues | BE |
| F2-02 | 퇴실 < 입실 거부 | SPACE-01 | POST /supplier/venues | venues CHECK checkout>checkin | /supplier/venues | BE |
| F2-03 | 원본 수정해도 확정 공연 조건 유지 | SPACE-02 | PUT /supplier/venues/{id}, GET /performances/{id}/sheet | quote_versions.venue_snapshot | /performances/:id/sheet | BE |
| F2-04 | 관객 0·501 거부 | REQ-01 | POST /performances | performances CHECK audience | /performances/new | BE, FE |
| F2-05 | 리허설 > 공연 시작 거부 | REQ-01 | POST /performances | performances CHECK 시각 | /performances/new | BE |
| F2-06 | 3일 이내 공연 거부 | REQ-01 | POST /performances | performances.show_date (서비스 검사) | /performances/new | BE (날짜 고정) |
| F2-07 | 대표 시연 요청 저장 | REQ-01 | POST /performances | performances, performance_versions | /performances/new | BE |
| F2-08 | 장비 "이미 있어요" → 장비 단계 없음 | REQ-02 | POST /performances/{id}/publish | stages | /performances/new | BE, FE |
| F2-09 | 장비 칸 기본값 없음 | REQ-02 | — | performances.needs | /performances/new | FE |
| F2-10 | 엔지니어 작업 0개면 다음 불가 | REQ-02 | POST /performances (`VALIDATION_FAILED`) | performances.needs | /performances/new | BE, FE |
| F2-11 | 공연장 단계 공고는 장비·엔지니어에게 안 보임 | REQ-03 | GET /postings | stages, supplier_categories | /supplier/postings | BE |
| F2-12 | 심사 중 업체에게 공고 안 보임 | REQ-03 | GET /postings | suppliers.review_status | /supplier/postings | BE |
| F2-13 | 리허설 변경 → v2, v1 보관, 재확인 | REQ-04 | PUT /performances/{id} | performance_versions, stages.status=RECHECK | /performances/:id | BE |
| F2-14 | 남의 견적서 안 보임 | QUOTE-01 | GET /postings/{id}, GET /quotes/{id} | — | /supplier/postings/:id | BE |
| F2-15 | D 견적서 전송 → 견적함·알림 | QUOTE-02 | POST /stages/{id}/quotes | quotes, quote_versions, chat_rooms, notifications | 견적서 작성, 견적함 | BE |
| F2-16 | 견적서 2개 각각 표시 | QUOTE-02 | POST /stages/{id}/quotes ×2 | quotes.label | 견적함 | BE |
| F2-17 | 합계 조작 거부 | QUOTE-02 | POST /stages/{id}/quotes (`TOTAL_MISMATCH`) | quote_versions CHECK total | — | BE |
| F2-18 | 공연장 단계 아닌데 공간 견적 거부 | QUOTE-02 | POST /stages/{id}/quotes (`STAGE_NOT_OPEN`) | stages.stage_type | — | BE |
| F2-19 | 풀스펙 표시 | QUOTE-02, ASSIGN-03 | POST /stages/{id}/quotes | quotes.is_full_spec | 견적함, 비교 화면 | BE, FE |
| F2-20 | 수정 → v2, v1 보관 | QUOTE-03 | PUT /quotes/{id} | quote_versions | 견적서 수정 | BE |

## F3 관계·참여

| AC | 요약 | FR | API | 테이블 | 화면 | 테스트 |
|---|---|---|---|---|---|---|
| F3-01 | 공연장 컨펌 전 장비 업체에게 공고 없음 | ASSIGN-01 | GET /postings | stages.open_guard | /supplier/postings | BE |
| F3-02 | 컨펌 → [다음 단계로] → 장비 공고 노출 | ASSIGN-01, CHAT-04 | POST /stages/{id}/advance | stages | [다음 단계로] 화면 | BE, E2E |
| F3-03 | 장비 업체가 공연장 정보 확인 | ASSIGN-02 | GET /postings/{stageId} | quote_versions.venue_snapshot | /supplier/postings/:id | BE |
| F3-04 | 전부 구했어요 → 남은 단계 건너뜀·동의 기록 | ASSIGN-03 | POST /performances/{id}/declare-all-secured | stages.skip_ack_at | 전부 구했어요 팝업 | BE, FE |
| F3-05 | 풀스펙 컨펌 → 건너뛰기 제안 | ASSIGN-03 | POST /confirm-requests/{id}/accept (`next.suggestSkip`) | quotes.is_full_spec | [다음 단계로] 화면 | BE |
| F3-06 | 채팅 시작 전 업체 메시지 불가 | CHAT-01 | POST /chat-rooms/{id}/messages (`CHAT_NOT_STARTED`), POST …/start | chat_rooms.started_at | /chats/:roomId | BE |
| F3-07 | 남의 채팅방 접근 불가 | CHAT-01 | GET /chat-rooms/{id}/messages | — | — | BE |
| F3-08 | 실시간 도착·읽음 표시 | CHAT-01 | POST …/messages, POST …/read, WS `message.created`·`message.read` | chat_messages, chat_reads | /chats/:roomId | BE (WS 테스트 클라이언트), FE |
| F3-09 | 견적 수정 → 이전 카드 컨펌 비활성 | CHAT-03 | PUT /quotes/{id}, POST /confirm-requests/{id}/accept (`CONFIRM_REQUEST_STALE`) | confirm_requests.status=INVALIDATED | 채팅방 카드 | BE, FE |
| F3-10 | 내역서 미열람 컨펌 불가 | CHAT-03 | POST …/view, …/accept (`DETAIL_NOT_VIEWED`) | confirm_requests.viewed_at | 내역서 | BE, FE |
| F3-11 | 동시 컨펌 하나만 성공 | CHAT-03 | POST /confirm-requests/{id}/accept (`STAGE_ALREADY_CONFIRMED`) | stages 행 잠금 | — | BE (동시성) |
| F3-12 | 48시간 지나면 만료, 재전송 가능 | CHAT-03 | 스케줄러, POST /quotes/{id}/confirm-requests | confirm_requests.expires_at | 채팅방 카드 | BE (시간 고정) |
| F3-13 | 다른 업체 자동 마감 알림, 반려 없음 | CHAT-05 | POST …/accept | quotes.status=CLOSED, rejection_events(없음) | 채팅방 안내 카드 | BE |
| F3-14 | 마지막 단계 → [통합 결제하기] | CHAT-04 | POST …/accept (`checkoutAvailable`) | stages | 컨펌 완료 카드 | BE, FE |
| F3-15 | 연락처·계좌 패턴 경고 | CHAT-06 | POST …/messages (`contactWarning`) | chat_messages.contact_warning | /chats/:roomId | BE (단위: 정규식), FE |
| F3-16 | 열리지 않은 단계 업체에겐 오퍼 불가, 관심 저장만 | OFFER-01·03 | POST /stages/{id}/offers (`STAGE_NOT_OPEN`), POST /favorites | offers, favorite_suppliers | PR 게시글, 공간 상세 | BE, FE |
| F3-17 | 11번째 오퍼 거부 | OFFER-01 | POST /stages/{id}/offers (`OFFER_LIMIT`) | offers (COUNT … FOR UPDATE) | — | BE |
| F3-18 | 오퍼 응답 견적에 "내가 오퍼한 업체" | OFFER-02 | POST /stages/{id}/quotes (`offerId`) | quotes.offer_id | 견적함 | BE |
| F3-19 | 관심 업체 → 단계 열릴 때 안내 | OFFER-03 | POST /stages/{id}/advance → notifications | favorite_suppliers, notifications | [다음 단계로] 화면 | BE |
| F3-20 | 공연장 비교: A 풀스펙, B 경고, C 통과 | CHK, CHK-01 | GET /stages/{id}/quotes | quote_versions.setup_available_time | 비교 화면 (대표) | BE (단위 CHK-02), FE |
| F3-21 | C+D 통과 (16:30 ≤ 17:00) | CHK-05 | GET /quotes/{id}/checks | quote_versions | 비교 화면 | BE (단위) |
| F3-22 | B+D 충돌 (90분 늦음), 컨펌 불가 | CHK-05 | GET …/checks, POST …/accept (`CHECK_CONFLICT`) | — | 비교 화면 | BE |
| F3-23 | 엔지니어 포함 → 경고·건너뛰기 제안 | CHK-09 | GET …/checks, POST /stages/{id}/advance | quote_versions.includes_engineer | [다음 단계로] 화면 | BE |
| F3-24 | 리허설 변경 → 충돌 → 수정 후 통과 | CHK, REQ-04 | PUT /performances/{id}, PUT /quotes/{id}, GET …/checks | performance_versions, quote_versions | 비교 화면 | BE, E2E |
| F3-25 | 기술 확인 자기 담당만 답변 | TECH-01 | POST /performances/{id}/tech-checks, PUT /tech-checks/{id} | tech_checks.owner_supplier_id | 기술 확인 | BE |

## F4 콘텐츠·상호작용

| AC | 요약 | FR | API | 테이블 | 화면 | 테스트 |
|---|---|---|---|---|---|---|
| F4-01 | 미승인 부문 탭 작성 불가 | BOARD-02 | POST /pr-posts (`CATEGORY_NOT_APPROVED`) | supplier_categories | PR 게시글 작성 | BE |
| F4-02 | 부문당 활성 글 1개 | BOARD-03 | POST /pr-posts (`ACTIVE_POST_EXISTS`) | pr_posts.active_guard | PR 게시글 작성 | BE |
| F4-03 | 연락처 경고·신고·블라인드 | BOARD-03, POL-04 | POST /pr-posts, POST /reports, POST /admin/pr-posts/{id}/blind | pr_posts, reports, sanctions | PR 게시판, /admin | BE |
| F4-04 | 방문자도 게시판 열람 | BOARD-01 | GET /pr-posts | pr_posts | /board | BE, FE |
| F4-05 | 채팅 후 반려 5회 → 24시간 대기 | POL-02 | POST /performances/{id}/withdraw, …/publish (`POSTING_RATE_LIMITED`), GET /me/posting-limit | rejection_events | 내 공연 | BE (시간 고정) |
| F4-06 | 180일 지나면 0 | POL-02 | GET /me/posting-limit | rejection_events.created_at | 내 공연 | BE (시간 고정) |
| F4-07 | 공고 목록에 반려·이용 횟수 | POL-02·03 | GET /postings | rejection_events, performances | /supplier/postings | BE, FE |
| F4-08 | 경고 3회 → 정지, 견적 불가 | POL-04 | POST /admin/users/{id}/warnings | users.warning_count·status, sanctions | /admin | BE |

## F5 부가 기능

| AC | 요약 | FR | API | 테이블 | 화면 | 테스트 |
|---|---|---|---|---|---|---|
| F5-01 | 공간 필터 → A·B·C | SPACE-03 | GET /venues | venues 인덱스(sido, sigungu) | /venues | BE, FE |
| F5-02 | 내 공연 단계 현황 | REQ-05 | GET /performances?mine=true | performances, stages | /me/performances | BE, FE |
| F5-03 | 185만 + 수수료 청구서 | PAY-01 | POST·GET /performances/{id}/order | orders, order_lines | /performances/:id/order | BE |
| F5-04 | 미컨펌 단계 있으면 청구서 없음 | PAY-01 | POST /performances/{id}/order (`INVALID_STATE`) | stages | — | BE |
| F5-05 | 금액 조작 결제 거부 | PAY-02 | POST /orders/{id}/payments (`AMOUNT_MISMATCH`) | payments | — | BE |
| F5-06 | 중복 응답·더블 클릭 1회만 | PAY-02 | POST /orders/{id}/payments (`Idempotency-Key`), POST /payments/mock/callback | payments UNIQUE(idempotency_key, provider_tx_id) | 결제 화면 | BE (동시성), FE |
| F5-07 | 보관 중 → 정산 예정 | PAY-02 | 스케줄러(공연 완료), GET …/order | ledger_entries (HOLD, SETTLE_SCHEDULED) | /performances/:id/order | BE (시간 고정) |
| F5-08 | D-1 취소 70% 배분 | PAY-03 | GET …/cancel-quote, POST …/cancel | cancellations, ledger_entries (PENALTY, REFUND) | 취소 화면 | BE (단위: 계산) |
| F5-09 | 결제 전 취소 10% 배분 | PAY-03 | POST …/cancel | cancellations, ledger_entries (CANCEL_FEE) | 취소 화면 | BE (단위) |
| F5-10 | 업체 사정 취소 → 전액 환불 + 경고 | PAY-03, POL-04 | POST …/cancel-by-supplier | cancellations, sanctions, users.warning_count | 업체 확정 내역 | BE |
| F5-11 | 결제 후 담당표·연락처, 미확정 업체 불가 | PAY-04 | GET /performances/{id}/sheet | orders, stages | /performances/:id/sheet | BE |
| F5-12 | 결제 전 연락처 비공개 | CHAT-06, PAY-04 | GET /postings/{id}, GET …/sheet | performances.contact_phone | 공고 상세 | BE |
| F5-13 | 이력 시간순 | ADMIN-02 | GET /admin/performances/{id}/history | status_histories | /admin | BE, E2E |
| F5-14 | 운영 설정에서 초기화 불가 | DEMO-02 | POST /dev/reset-demo | — | /admin | BE |

---

## 점검 결과

| 항목 | 결과 |
|---|---|
| 수용 기준 87개 중 API가 연결된 것 | 86개 (F2-09는 화면 동작 — FE 테스트로 확인) |
| 테이블이 연결된 것 | 77개 (나머지 10개는 권한·화면 동작) |
| 테스트가 정해진 것 | **87개 전부** (BE 83 · FE 25 · E2E 4, 한 기준에 여러 종류 가능) |
| 스펙에 없는데 계획에 들어간 것 | `POST /auth/refresh`, `GET /chat-rooms`, `notifications`, `idempotency_keys` — 기존 수용 기준을 구현하기 위한 보조 기능이라 범위 이탈 아님 |
| 계획에서 빠진 스펙 | 없음 |

## 비기능 요구사항 연결

| NFR | 계획 |
|---|---|
| SEC-01 비밀번호 해시 | plan 4 (bcrypt) |
| SEC-02·07 서버 권한 | plan 4 (`require_role` + 소유권, 404) |
| SEC-03 서버 금액 계산 | plan 5.6, api 6.1 (`AMOUNT_MISMATCH`) |
| SEC-06 SQL 인젝션 | SQLAlchemy 바인딩, 정렬은 허용 목록 (api `sort=` 값 고정) |
| SEC-09 XSS | React 기본 이스케이프, 채팅·게시글에 HTML 렌더링 금지 |
| SEC-10 소셜 위조 방지 | plan 4 (`state` 쿠키 비교) |
| HIST-01~05 | plan 5.1·5.3, data-model `status_histories`, `*_versions`, 생성 컬럼 유니크, 행 잠금 |
| UX-02 색+글자 | StatusBadge 컴포넌트 |
| OPS-01 환경 분리 | plan 8 (`APP_ENV`) |
| TEST-01~03 | plan 7 (AC ID 이름, CI `test`) |
