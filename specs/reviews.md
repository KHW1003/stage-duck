# 공연 후기·평점

> 11/20 추가. 처음 명세에서는 "리얼 후기·평점"을 범위 밖으로 두었지만, 중개 서비스의 신뢰 장치로 넣는다.
> 가짜 후기를 막는 것이 핵심이다: **결제하고 공연을 마친 사용자만**, 확정한 업체마다 한 번 쓴다.

## 1. 규칙

| 규칙 | 내용 |
|---|---|
| 쓰는 사람 | 그 공연의 주인 사용자만 (업체·관리자·남의 공연은 404) |
| 쓰는 때 | 결제한 공연(청구서 `PAID`·`SETTLEMENT_SCHEDULED`)의 **공연일 다음 날부터** |
| 대상 | 확정한(`CONFIRMED`) 단계마다 그 업체에 한 번 (`uq_reviews_stage`). 두 번째는 409 `ALREADY_REVIEWED` |
| 내용 | 별점 1~5, 후기 10~500자. 전화번호·이메일·계좌번호 모양은 받지 않는다 (직거래 유도 방지, CLAUDE.md 20) |
| 고치기 | 없다. 쓴 사람이 지우고 다시 쓴다 |
| 공개 | 업체 프로필에 평균·개수·별점 분포·최신순 10개씩. 쓴 사람은 **닉네임만**, 공연은 단계·공연 월만 |
| 업체 답글 | 하지 않는다 (후속) |

## 2. 데이터 (0026 `reviews`)

`id, performance_id, stage_id(유일), supplier_id, user_id, rating(1~5), content(500), created_at`

`supplier_id`는 쓸 때의 확정 업체(단계 → 확정 견적서 버전 → 견적서 → 업체)를 그대로 적어 둔다. 업체 프로필에서 바로 모으려고.

## 3. API

| 메서드 | 경로 | 권한 | 내용 |
|---|---|---|---|
| GET | `/performances/{id}/reviews` | 공연 주인 | `{ canWrite, items: [{ stageId, stageType, supplierId, companyName, review }] }` |
| POST | `/performances/{id}/reviews` | 공연 주인 | `{ stageId, rating, content }` → 201. 쓸 수 없는 때 409, 칸 오류 400 |
| DELETE | `/reviews/{id}` | 쓴 사람 | 204 (남의 후기 404) |
| GET | `/suppliers/{id}/reviews?before=` | 누구나 | `{ average, count, distribution, items: [{ id, rating, content, nickname, stageType, showMonth, createdAt }], nextBefore }` |
| GET | `/review-summaries?ids=1,2` | 누구나 | `[{ supplierId, average, count }]` 목록 카드용 (후기 없는 업체는 빠짐, 100개까지) |

## 4. 화면

- **내 공연 상세** (`/performances/:id`, 확정 이후): "함께한 업체 후기" — 업체마다 별점 고르기 + 후기 쓰기, 쓴 후기는 보이고 [지우고 다시 쓰기]. 아직 쓸 수 없으면 칸이 없다.
- **업체 프로필** (`/suppliers/:id`): 머리에 ★ 평균 (개수), "이용 후기" 칸(평균·분포·목록·[후기 더 보기]).
- **업체 찾기** (`/board`) 카드, **공간 상세** 업체 줄: ★ 평균 (개수). 업체 이름은 프로필로 이어진다.

## 5. 시연 데이터

`app/demo/seed.py` `PAST_REVIEWS`: 가상 사용자 3명의 지난 공연(10~11월, `COMPLETED`)과 후기 7개. 업체 A(4.5, 2개)·C·D·F·G에 별점이 보인다. 공고·청구서는 만들지 않는다.

## 6. 테스트

- `backend/tests/f5/test_reviews.py`: 공연 당일·결제 전·남의 공연은 못 씀, 업체마다 한 번, 칸 검사(별점·글자 수·연락처), 지우고 다시 쓰기, 프로필 평균·분포·요약, 시연 시드
- `frontend/tests/review.test.tsx`: 프로필 후기 칸, 후기 쓰기(검사·보낸 값), 쓸 수 없으면 숨김
