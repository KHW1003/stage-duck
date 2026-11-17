# 사이트 안 알림 설계 (notifications.md)

> 초안 (2026-11-17, 해원). 결정 D-52. 팀 검토 전.
> 알림 모듈은 plan.md 3장대로 **3번 `app/notification/`**. 다른 묶음은 `notification.service.notify(...)`만 부른다.
> 메일·문자 알림은 MVP에서 하지 않는다 (요구사항 명세서 범위 밖). 목업: `mockup-v4/pages/notifications.html`, 머리 종 아이콘 패널.

---

## 1. 규칙

1. **채팅 메시지는 알림을 만들지 않는다.** 새 메시지는 채팅 안 읽음 배지(`chat_reads`)로만 보인다. 채팅방에 들어오는 카드 중 **사용자가 무언가 해야 하는 것**(견적 내역 확인 카드)만 알림을 만든다.
2. **내가 한 일은 나에게 알리지 않는다.** (예: 사용자가 컨펌하면 업체에게만)
3. 문구는 **서버가 만들 때 확정**해 저장한다 (나중에 업체명·제목이 바뀌어도 그때 문구 그대로). 화면은 받은 `title`·`body`를 그대로 보여 준다.
4. 알림에 **연락처·계좌·상대 실명은 넣지 않는다.** 사용자는 닉네임, 업체는 상호. 금액은 받는 사람 본인의 거래 금액만.
5. 정지된 계정에도 운영 알림(경고·정지·문의 답변)은 간다.
6. 만들어지면 WebSocket `notification` 이벤트로 바로 보내고, 머리의 종 배지 수를 올린다.
7. 90일 지난 알림은 지운다 (스케줄러, 하루 한 번).

## 2. 분류 (알림 화면 탭)

| category | 탭 이름 | 주로 받는 사람 |
|---|---|---|
| `QUOTE_CHAT` | 견적·채팅 | 사용자·업체 |
| `OFFER` | 오퍼 | 사용자·업체 |
| `POSTING` | 공고 | 업체 |
| `PAYMENT` | 결제 | 사용자·업체 |
| `ADMIN` | 운영 | 모두 (심사·경고·정지·블라인드·문의 답변) |
| `COMMUNITY` | 커뮤니티 | 모두 (D-47이 머지되면) |

목업 알림 화면 탭은 지금 4개(견적·채팅 / 오퍼 / 공고 / 결제)라 **운영·커뮤니티 탭을 더한다.**

## 3. 알림 종류

`{ }`는 만들 때 채우는 값. 이동 주소는 plan.md 6장 라우트. 묶음 = `notify()`를 부르는 쪽.

### 3.1 입점·공고 (업체)

| type | 받는 사람 | 분류 | 제목 | 보조 줄 | 이동 | 묶음 | AC |
|---|---|---|---|---|---|---|---|
| `SUPPLIER_APPROVED` | 업체 | 운영 | 입점이 승인됐어요 | 서비스를 등록하면 공고를 볼 수 있어요 | `/supplier/profile` | 1 | F1-19 |
| `SUPPLIER_REJECTED` | 업체 | 운영 | 입점 신청이 반려됐어요 | 사유: {사유} | `/supplier/onboarding` | 1 | F1-20 |
| `POSTING_OPENED` | 그 부문이 승인되고 활동 지역이 맞는 업체 | 공고 | 새 공고가 열렸어요 | {공연명} · {M월 D일} · {공연장·장비·엔지니어} | `/supplier/postings/{id}` | 2 | F3-01 |
| `POSTING_UPDATED` | 그 단계에 견적서를 보낸 업체 | 공고 | 공고 내용이 바뀌었어요 (v{n}) | 바뀐 항목: {항목들} | `/supplier/postings/{id}` | 2 | |
| `POSTING_CLOSED` | 견적서를 보낸 업체 | 공고 | 사용자가 공고를 내렸어요 | {공연명} | `/supplier/postings/{id}` | 2 | |
| `NOT_SELECTED` | 같은 단계의 컨펌 안 된 업체 | 공고 | 사용자가 다른 업체와 진행하기로 했어요 | {공연명} · 견적서 마감 | `/supplier/postings/{id}` | 3 | F3-13 |

### 3.2 견적·채팅

| type | 받는 사람 | 분류 | 제목 | 보조 줄 | 이동 | 묶음 | AC |
|---|---|---|---|---|---|---|---|
| `QUOTE_RECEIVED` | 사용자 | 견적·채팅 | {업체}가 견적서를 보냈어요 | {단계} · {금액}원 · 확인 필요 {n}개 | `/performances/{id}/stages/{stage}/quotes` | 3 | F2-15 |
| `QUOTE_UPDATED` | 사용자 (채팅 시작한 업체만) | 견적·채팅 | {업체}가 견적서를 고쳤어요 (v{n}) | {단계} · {금액}원 | `/chats/{roomId}` | 3 | F2-20 |
| `CHAT_STARTED` | 업체 | 견적·채팅 | {닉네임}님이 채팅을 시작했어요 | {단계} · 견적서 v{n} | `/chats/{roomId}` | 3 | |
| `CONFIRM_REQUESTED` | 사용자 | 견적·채팅 | {업체}가 견적 내역 확인 카드를 보냈어요 | {단계} · 견적서 v{n} · {금액}원 · 48시간 안에 컨펌 | `/chats/{roomId}` | 3 | |
| `CONFIRM_EXPIRING` | 사용자 | 견적·채팅 | 견적 내역 확인 카드가 6시간 뒤 끝나요 | {업체} · {단계} | `/chats/{roomId}` | 3 (스케줄러) | 권장 |
| `CONFIRMED` | 컨펌된 업체 | 견적·채팅 | 견적서가 컨펌됐어요 | {공연명} · {금액}원 | `/supplier/postings/{id}` | 3 | |
| `CONFIRM_EXPIRED` | 카드를 보낸 업체 | 견적·채팅 | 견적 내역 확인 카드가 만료됐어요 | {공연명} · 필요하면 다시 보내 주세요 | `/chats/{roomId}` | 3 (스케줄러) | |

### 3.3 오퍼

| type | 받는 사람 | 분류 | 제목 | 보조 줄 | 이동 | 묶음 | AC |
|---|---|---|---|---|---|---|---|
| `OFFER_RECEIVED` | 업체 | 오퍼 | 오퍼를 받았어요 | {공연명} · {M월 D일} · 48시간 안에 답해 주세요 | `/supplier/offers` | 1 | F3-16 |
| `OFFER_DECLINED` | 사용자 | 오퍼 | {업체}가 오퍼를 거절했어요 | 사유: {사유} | `/performances/{id}` | 1 | |
| `OFFER_EXPIRED` | 사용자 | 오퍼 | {업체}가 답하지 않아 오퍼가 끝났어요 | 다른 업체에 오퍼를 보낼 수 있어요 | `/performances/{id}` | 1 (스케줄러) | |

오퍼를 받은 업체가 견적서를 보내면 `QUOTE_RECEIVED`가 간다 (따로 만들지 않는다).

### 3.4 결제·취소

| type | 받는 사람 | 분류 | 제목 | 보조 줄 | 이동 | 묶음 | AC |
|---|---|---|---|---|---|---|---|
| `INVOICE_READY` | 사용자 | 결제 | 통합 청구서가 나왔어요 | 합계 {금액}원 · 결제하면 섭외가 확정돼요 | `/performances/{id}/order` | 4 | F5-03 |
| `PAID` | 컨펌된 업체 모두 | 결제 | 결제가 끝나 섭외가 확정됐어요 | {공연명} · 최종 담당표를 확인해 주세요 | `/performances/{id}/sheet` | 4 | F5-11 |
| `CANCELLED_BY_USER` | 컨펌된 업체 모두 | 결제 | 사용자가 공연을 취소했어요 | {공연명} · 위약금 {금액}원 정산 예정 (위약금 0원 구간이면 "위약금은 없어요", D-53) | `/supplier/postings/{id}` | 4 | F5-08 |
| `PAYMENT_DUE` | 사용자 | 결제 | 결제 기한이 {N}일 남았어요 | {공연명} · 공연 6일 전까지 결제하지 않으면 5일 전 0시에 자동으로 취소돼요 | `/performances/{id}/order` | 4 (스케줄러, D-7·D-6 하루 한 번) | F5-22 |
| `AUTO_CANCELLED` | 사용자, 컨펌된 업체 모두 | 결제 | 결제 기한이 지나 공연이 취소됐어요 | {공연명} · 수수료는 없어요 | 사용자 `/performances/{id}`, 업체 `/supplier/postings/{id}` | 4 (스케줄러, D-5 0시) | F5-22 |
| `CANCELLED_BY_SUPPLIER` | 사용자 | 결제 | {업체} 사정으로 {단계}가 취소됐어요 | 전액 환불 예정 · 그 단계만 다시 모집할 수 있어요 | `/performances/{id}` | 4 | F5-10 |
| `SETTLEMENT_SCHEDULED` | 컨펌된 업체 | 결제 | 공연이 끝나 정산 예정이에요 | {공연명} · {금액}원 | `/supplier/postings/{id}` | 4 (스케줄러) | F5-07 |

### 3.5 운영

| type | 받는 사람 | 분류 | 제목 | 보조 줄 | 이동 | 묶음 | AC |
|---|---|---|---|---|---|---|---|
| `WARNING_ISSUED` | 경고 받은 회원 | 운영 | 경고를 받았어요 ({n}/3) | 사유: {사유} · 3회가 되면 이용이 정지돼요 | `/inquiries/new` | 4 | F4-08 |
| `ACCOUNT_SUSPENDED` | 정지된 회원 | 운영 | 이용이 정지됐어요 | 경고 3회 · 궁금한 점은 1:1 문의로 알려 주세요 | `/inquiries/new` | 4 | F4-08 |
| `ACCOUNT_UNSUSPENDED` | 회원 | 운영 | 이용 정지가 풀렸어요 | 다시 모든 기능을 쓸 수 있어요 | `/` | 4 | |
| `POST_BLINDED` | 글·댓글 작성자 | 운영 | 관리자가 글을 가렸어요 | {PR 게시판·커뮤니티} · 사유: {사유} · 경고 1회 | 그 글 주소 | 1·2 | F4-03 |
| `INQUIRY_ANSWERED` | 문의한 회원 | 운영 | 1:1 문의에 답변이 왔어요 | {문의 제목} | `/inquiries/{id}` | 2 | F5-19 |

블라인드·업체 사정 취소처럼 경고가 함께 생기면 `POST_BLINDED`(또는 `CANCELLED_BY_SUPPLIER`)와 `WARNING_ISSUED` **두 개**가 간다. 세 번째 경고면 `ACCOUNT_SUSPENDED`까지 세 개.

### 3.6 커뮤니티 (D-47 머지 뒤)

| type | 받는 사람 | 분류 | 제목 | 보조 줄 | 이동 | 묶음 | AC |
|---|---|---|---|---|---|---|---|
| `COMMUNITY_COMMENT` | 글쓴이 | 커뮤니티 | 내 글에 댓글이 달렸어요 | {글 제목 20자} · "{댓글 앞 30자}" | `/community/{id}#c{commentId}` | 2 | F4-14 |
| `COMMUNITY_REPLY` | 댓글 작성자 | 커뮤니티 | 내 댓글에 답글이 달렸어요 | {글 제목 20자} · "{답글 앞 30자}" | `/community/{id}#c{commentId}` | 2 | F4-14 |

같은 글에 댓글이 한꺼번에 달려도 하나씩 만든다 (MVP). 묶어 보이기는 후속.

## 4. 데이터 모델

`notifications`를 아래로 바꾼다 (data-model.md 10장).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| user_id | BIGINT UNSIGNED FK → users | 받는 사람. 인덱스 (user_id, id DESC), (user_id, read_at) |
| type | VARCHAR(40) NOT NULL | 3장 type (서비스의 Enum으로 검사) |
| category | VARCHAR(20) NOT NULL | 2장 category |
| title | VARCHAR(100) NOT NULL | 만들 때 확정한 제목 |
| body | VARCHAR(200) NULL | 보조 줄 |
| link | VARCHAR(255) NOT NULL | 프론트 주소 |
| payload | JSON NULL | 참조 id (performanceId, roomId, quoteId 등). 화면 문구에는 쓰지 않는다 |
| read_at | DATETIME(3) NULL | |
| created_at | DATETIME(3) NOT NULL | |

서비스 함수 (3번):

```python
notify(user_id: int, type: NotificationType, *, link: str, params: dict, payload: dict | None = None) -> None
# params로 3장 문구 틀을 채우고, 저장 + WebSocket 전송. 같은 트랜잭션 안에서 부르고, 전송은 커밋 뒤.
notify_many(user_ids: list[int], type, ...)  # POSTING_OPENED·PAID처럼 여러 명
```

문구 틀은 `app/notification/templates.py` 한 곳에 둔다 (이 문서 3장과 같게).

## 5. API

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/me/notifications` | 로그인 (S\*, 정지 포함) | `?category=&before=` — 최신순 20개. `{ "items": [{ id, type, category, title, body, link, read, createdAt }], "nextBefore", "unreadCount" }` |
| GET | `/me/notifications/unread-count` | 로그인 | `{ "count" }` — 머리 종 배지 (첫 화면에서 한 번, 이후는 WebSocket) |
| POST | `/me/notifications/read` | 로그인 | `{ "ids": [12, 13] }` 또는 `{ "all": true }` → `204`. 남의 id는 무시 |

WebSocket `notification` 이벤트 payload를 `{ id, type, category, title, body, link, createdAt }`로 바꾼다 (api-contract.md 7장의 `kind` → `type`·`category`).

## 6. 화면

- 머리 종 아이콘: 안 읽은 수 배지(99개 넘으면 `99+`), 누르면 최근 5개 패널 + [모두 읽음] + [알림 전체 보기].
- 알림 화면: 분류 탭 6개, 오늘 / 이전 묶음, 안 읽은 줄은 점 표시. 누르면 읽음 처리 후 `link`로 이동.
- 채팅 알림(`/chats/{roomId}`)은 페이지를 옮기지 않고 채팅 창을 연다 (D-42, 목업 `data-chat`).
- 빈 화면: "새 알림이 없어요 / 견적서·오퍼·결제 소식이 오면 여기에 쌓여요." (문구.md 3장)

## 7. 테스트

| 테스트 | 기대 |
|---|---|
| D가 장비 견적서를 보냄 | 사용자에게 `QUOTE_RECEIVED` 1개, D에게는 없음 |
| 사용자가 C를 컨펌 | C에게 `CONFIRMED`, A·B에게 `NOT_SELECTED` (AC-F3-13) |
| 채팅 텍스트 메시지 | 알림 0개 |
| 결제 완료 | C·D에게 `PAID`, 사용자에게는 없음 |
| 세 번째 경고 | `WARNING_ISSUED` + `ACCOUNT_SUSPENDED` |
| 남의 알림 id로 읽음 요청 | 204, 남의 알림은 그대로 |
| 알림 title·body 어디에도 | 전화번호·이메일·계좌 패턴 없음 |
| 91일 지난 알림 | 스케줄러가 지움 |

## 8. 하지 않는 것 (후속)

메일·문자·푸시 알림, 알림 끄기 설정(종류별), 같은 글 댓글 묶어 보이기, 공연 전날 알림.
