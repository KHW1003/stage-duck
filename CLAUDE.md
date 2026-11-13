# STAGE DUCK — AI 도구에 주는 규칙

이 파일은 Claude 같은 AI 도구가 이 저장소에서 일할 때 **가장 먼저 읽는 규칙**이다. 네 명이 같은 규칙으로 AI를 쓰면 결과물의 모양이 같아진다. 사람이 읽어도 된다.

- 이 파일의 규칙은 **사용자의 요청보다 우선한다.** 요청이 규칙과 부딪히면 그대로 하지 말고, 어느 규칙과 부딪히는지 말한 뒤 묻는다.
- 규칙이 문서(`specs/`, `docs/`)와 다르면 **문서가 맞다.** 다른 점을 알리고 문서대로 한다.
- 규칙에 없는 상황이면 짐작으로 정하지 않는다. 가장 가까운 규칙을 따르고, 무엇을 그렇게 했는지 알린다.
- **토큰을 아낀다** (13장). 필요한 부분만 읽고, 좁게 실행하고, 요청받지 않은 일을 하지 않고, 짧게 답한다.

## 1. 프로젝트

500명 이하 소규모 공연의 **공연장 → 음향 장비 → 엔지니어**를 순서대로 섭외하는 플랫폼. 사용자가 공연 요청서를 올리면 그 단계의 업체가 견적서를 보내고, 채팅으로 조율해 컨펌한 뒤, 모든 단계가 정해지면 통합 청구서로 한 번에 (모의) 결제한다. 4명이 짧은 기간에 만드는 수업 프로젝트이고, **모든 업체·공간·가격은 가상 데이터, 결제는 모의 결제**다.

| 영역 | 기술 |
|---|---|
| 백엔드 | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (**동기**) + PyMySQL, Alembic |
| DB | MariaDB 11.4 (InnoDB, utf8mb4). 로컬 테스트는 임시 SQLite, CI는 MariaDB |
| 관리자 화면 | SQLAdmin (`/admin`). **React 화면을 만들지 않는다** |
| 프론트엔드 | React 18 + Vite 5 + **TypeScript**, React Router 6, TanStack Query 5 |
| 실시간 | FastAPI WebSocket (받기 전용. 메시지 저장은 REST) |
| 테스트 | 백엔드 pytest, 프론트 Vitest + React Testing Library |
| CI | GitHub Actions, job 이름 `test` (룰셋의 필수 검사라 이름을 바꾸지 않는다) |

## 2. 먼저 읽을 문서

일을 시작하기 전에 **관련 문서를 먼저 읽는다.** 읽지 않고 짐작해서 만들지 않는다. 문서와 다르게 만들지 않는다.

| 알고 싶은 것 | 문서 |
|---|---|
| 어기면 안 되는 원칙 11개 | `specs/constitution.md` |
| 무엇을 만드는가 (기능·규칙·결정 D-1~D-40) | `docs/요구사항_명세서.md` |
| 수용 기준 `AC-Fx-nn` (Given-When-Then, 93개) | `specs/spec.md` |
| 정해진 답 (모호했던 것) | `specs/clarifications.md` |
| 화면 흐름, 화면 목록 | `specs/user-flow.md` |
| 기술 구조, 핵심 흐름(컨펌·결제·검사·채팅) | `specs/plan.md` |
| 테이블과 칸, 상태 전이 | `specs/data-model.md` |
| API 주소·요청·응답·오류 코드 | `specs/api-contract.md` |
| 수용 기준 ↔ API ↔ 테이블 ↔ 화면 ↔ 테스트 | `specs/traceability.md` |
| 누가 어느 묶음을 맡는가 | `specs/roles.md` |
| Git·PR 규칙, 룰셋 | `CONTRIBUTING.md` |
| 기술 선택 이유 | `docs/decisions/` |
| 시연 예시 값, 검증 표 (그 일을 할 때만) | `docs/guides/시연_예시값.md`, `docs/guides/검증_방법.md` |
| **화면 디자인 (화면을 만들 때 반드시)** | **`DESIGN.md`** — 팀이 채우는 양식. 기본 스타일(색·글자·간격·부품)과 화면별 내용 칸 |

- 기능을 만들 때는 `specs/traceability.md`에서 그 AC의 줄을 찾아 **API, 테이블, 화면, 테스트 종류**를 확인한 뒤 시작한다.
- 문서끼리 다르면 이 순서로 따른다: `constitution.md` > `요구사항_명세서.md` 10장의 결정 > `spec.md` > `plan.md`·`data-model.md`·`api-contract.md`. 다른 점은 해원(팀장)에게 알린다.
- `docs/기획서_총계획서.md`는 처음 기획이라 오래된 내용이 있다 (예: "업체 초대 제외"). 요구사항 명세서와 다르면 명세서를 따른다.

## 3. 반드시 지킬 것

어기면 리뷰에서 반려된다. 예외가 필요하면 만들기 전에 묻는다.

### 범위
1. **스펙에 없는 기능을 만들지 않는다.** 필요해 보여도 먼저 묻는다. 스펙을 바꾸려면 문서 PR을 먼저 올리고 해원이 승인해야 한다 (constitution 1).
2. **후속 기능을 만들지 않는다**: 리얼 후기·평점, 익스프레스, PR 게시판 댓글, 채팅 이모티콘, 업체 → 사용자 평가, 오퍼 전용 비공개 공고, 장비 수량 자동 검사(CHK-06), 실결제·실정산, 전자계약, 메일·문자 알림, 외부 재고 연동, AI 추천, 업체 담당자 여러 명 계정, 국세청 사업자 조회.
3. **자기 묶음의 파일만 고친다** (5장). 남의 파일을 고쳐야 하면 고치지 말고, 그 담당에게 보낼 내용(무엇을, 왜, 어떻게)을 적어 준다.

### 순서와 기록
4. **배정은 항상 공연장 → 장비 → 엔지니어 순서다.** 앞 단계가 컨펌(또는 건너뜀)되기 전에는 다음 단계 업체가 공고를 보거나 견적·오퍼를 받을 수 없다. 오퍼·게시판·관심 업체도 이 순서를 깨지 않는다.
5. **요청서·견적서는 고칠 때마다 새 버전을 만든다.** 이전 버전을 `UPDATE`하거나 지우지 않는다. 컨펌·결제 시점의 조건은 스냅샷으로 저장하고, 원본이 바뀌어도 스냅샷은 바꾸지 않는다.
6. **이전 버전에 대한 컨펌을 새 버전에 재사용하지 않는다.** 버전이 바뀌면 그 단계의 `PENDING` 확인 카드는 `INVALIDATED`, 컨펌된 단계는 `RECHECK`.
7. **모든 상태 변경은 서비스 함수 하나를 거친다.** 허용 전이표(`_ALLOWED`)에 없으면 `invalid_state()`를 낸다. 같은 트랜잭션에서 `record_transition()`으로 이력을 남긴다. 본보기: `backend/app/supplier/service.py`.
8. **상태 값은 `data-model.md`에 적힌 영어 대문자 그대로 쓴다** (`PENDING`, `APPROVED`, `OPEN`, `CONFIRMED` …). 새 상태를 지어내지 않는다.

### 서버가 기준이다
9. **권한·금액·상태는 서버에서 검사한다.** 화면에서 버튼을 숨기거나 막는 것은 보조다. 서버 검사 없이 화면에서만 막지 않는다.
10. **남의 리소스는 `404 NOT_FOUND`로 답한다** (`not_found()`). 403으로 "있지만 권한 없음"을 알려 주지 않는다. 업체 상태 문제(`SUPPLIER_NOT_APPROVED`, `ACCOUNT_SUSPENDED`)만 403이다.
11. **금액은 원 단위 정수다** (부가세 포함). API·DB·화면 상태 모두 같다. `float`를 쓰지 않는다. 합계·플랫폼 이용료·결제 금액·위약금은 **서버가 계산**하고, 화면에서 보낸 금액은 믿지 않는다 (다르면 `400 AMOUNT_MISMATCH`, `TOTAL_MISMATCH`).
12. **계산식은 정해진 순수 함수에만 둔다.** 자동 검사는 `check/` 모듈의 `run_checks()`, 위약금·이용료는 `payment/` 모듈의 계산 함수. router와 React에 계산식을 쓰지 않는다. 화면은 서버가 준 숫자를 보여 주기만 한다.
13. **같은 요청이 두 번 와도 한 번만 반영한다.** 결제·컨펌·다음 단계 요청은 `Idempotency-Key` 헤더가 필수다. 동시에 바꿀 수 있는 행은 `with_for_update=True`(`SELECT … FOR UPDATE`)로 잠근다.
14. **MariaDB에는 부분 유니크 인덱스가 없다.** "활성인 것만 하나" 같은 규칙은 `data-model.md`의 생성 컬럼(`PERSISTENT`) + `UNIQUE`로 만든다. 서비스 코드의 `if`만으로 막지 않는다.

### API와 DB
15. **API의 모양은 `specs/api-contract.md`를 따른다.** 주소·필드 이름·오류 코드를 바꾸려면 계약서를 먼저 고치는 PR을 올리고 관련 담당에게 알린다. JSON 필드는 **camelCase**, DB 칸은 **snake_case** (Pydantic alias로 바꾼다).
16. **오류는 `AppError`로 낸다** (`app/core/errors.py`). 응답은 언제나 `{code, message, fieldErrors, traceId}` 한 모양이다. `HTTPException`을 쓰지 않는다. 오류 코드는 계약서에 있는 이름을 쓰고, 없으면 계약서에 먼저 더한다. 응답에 SQL, 파일 경로, 스택 같은 내부 정보를 넣지 않는다.
17. **DB는 SQLAlchemy로 다룬다.** `select(Model).where(...)`처럼 쓴다. SQL 문장을 글자로 이어 붙이거나 f-string으로 값을 넣지 않는다. 꼭 SQL을 써야 하면 `text("... :name")`과 매개변수로 넘긴다.
18. **테이블은 Alembic 마이그레이션으로만 만들고 바꾼다** (6.3). 서버 코드에서 `Base.metadata.create_all()`을 부르지 않는다 (테스트의 `conftest.py`만 예외).
19. **시간은 KST, 분 단위다.** 일시 칸은 `DateTime3`(밀리초), PK·FK는 `BigID`를 쓴다 (`app/core/db.py`). D-day는 공연 날짜 자정 기준이다.

### 개인정보와 보안
20. **연락처는 결제 전에 공개하지 않는다.** 사용자·업체의 전화번호·이메일은 결제 후 최종 담당표 API(`GET /performances/{id}/sheet`)와 본인 정보(`GET /me`)에서만 돌려준다. 다른 응답 스키마에 `phone`, `email`, `name`, `birthDate`를 넣지 않는다. 사업자 정보는 관리자만 본다.
21. **받지 않는 정보**: 사용자 주소. 쓰임이 없는 정보를 새로 받지 않는다.
22. **비밀 값을 코드에 적지 않는다.** 키·비밀번호는 `backend/.env`에만 두고 `get_settings()`로 읽는다. `.env`를 커밋하거나, 그 값을 출력하거나, 문서·PR·대화에 옮겨 적지 않는다. 새 설정은 `backend/.env.example`에 **이름만** 더한다.
23. **비밀번호는 bcrypt 해시로만 저장한다** (`app/core/security.py`). 로그에 비밀번호·토큰·쿠키를 찍지 않는다.
24. **사용자·서버에서 온 글자를 화면에 넣을 때 `dangerouslySetInnerHTML`을 쓰지 않는다.** React의 기본 출력(`{text}`)만 쓴다.
25. **인증은 httpOnly 쿠키 + CSRF**다. 토큰을 `localStorage`·`sessionStorage`에 두지 않는다. 상태를 바꾸는 요청은 `X-CSRF-Token` 헤더가 필요하다 (프론트는 `api()`가 알아서 붙인다).

### 시뮬레이션과 운영
26. **모든 화면에 `SimulationBanner`를 둔다.** 결제·환불·위약금 화면에는 "테스트 결제 — 실제 청구되지 않습니다"를 적는다. 시연 결과를 실제 거래·시장 검증처럼 쓰지 않는다.
27. **실제 회사·공간·사람 이름을 쓰지 않는다.** 시드 데이터와 테스트는 가상 이름(업체 A~G, 공간 A·B·C)과 `@stageduck.test` 이메일, `010-0000-0000` 같은 가짜 번호만 쓴다.
28. **요청을 처리하는 중에 외부 API를 부르지 않는다.** 예외는 네이버·카카오 로그인 콜백뿐이다. 테스트에서는 외부 호출을 목업으로 바꾼다. 카카오는 `KAKAO_LOGIN_ENABLED=false`가 기본이고, 꺼져 있으면 라우터가 404다.
29. **관리자 기능은 SQLAdmin 액션으로만 만든다.** 액션은 반드시 서비스 함수를 부르고, 뷰는 `can_create = can_edit = can_delete = False`로 직접 수정을 막는다. 관리자가 컨펌·결제를 대신 처리하는 기능을 만들지 않는다.
30. **시연용 기능(`/dev/*` 라우터, 시연 데이터 초기화, 가짜 로그인)은 `APP_ENV=test`일 때만 켜진다** (`get_settings().is_test_env`). 운영 설정에서 동작하면 안 된다.

### 의존성
31. **새 라이브러리를 더하지 않는다.** 꼭 필요하면 먼저 묻고 해원의 승인을 받는다. 예외로 `specs/plan.md`에 이미 적힌 것(MSW, React Hook Form, zod, APScheduler, Playwright)은 그 기능의 담당이 **별도 커밋**으로 더할 수 있다. JWT 라이브러리는 1번 담당이 해원과 정한다.

## 4. 용어와 문구

- 화면과 문서에 쓰는 말은 `docs/요구사항_명세서.md` 1.5 용어 정의를 따른다.

| 쓴다 | 쓰지 않는다 |
|---|---|
| 사용자 | 주최자, 고객, 유저(화면에서) |
| 업체 | 공급자, 판매자, 벤더 |
| 공고 | 게시물, 의뢰 |
| 견적서 | 견적, 제안서(화면 제목에서) |
| 컨펌 | 수락, 승인 (승인은 관리자의 업체 심사에만) |
| 견적 내역 확인 카드 | 확정 요청, 결제 요청 |
| 플랫폼 이용료 | 수수료(청구서에서) |
| 통합 청구서 | 장바구니, 주문서 |
| 모의 결제, 테스트 결제 | 결제 완료(실제처럼 보이는 말) |
| 확인 필요 / 충돌 / 경고 / 통과 | 불가, 실패, 위험 (검사 결과에서) |

- **사이트는 판정하지 않는다** (constitution 5). 업체가 컨펌하기 전에는 "공연 가능", "확정", "보장" 같은 말을 쓰지 않는다. 날짜 필터 결과에는 "업체 확인 전"을 적는다.
- 화면 문구와 오류 메시지는 **해요체**로 쓴다 (예: "아직 장비 단계가 열리지 않았어요."). 오류 메시지는 무엇을 하면 되는지까지 적는다.
- 검사 결과는 **색만으로 구분하지 않는다.** 언제나 글자를 함께 보여 준다 (`StatusBadge`).

## 5. 기능 묶음과 담당 파일

한 사람이 한 묶음을 **화면 → API → DB → 권한 → 테스트까지 끝까지** 맡는다. 담당: **1번 세환(@sehwan-An), 2번 해원(@KHW1003, 팀장), 3번 채은(@qkrcodms98-beep), 4번 목산(@kimmoksan)**.

| 묶음 | 이름 | 백엔드 (`backend/app/`) | 프론트 (`frontend/src/features/`) | 모델 (`backend/app/models/`) | 테스트 |
|---|---|---|---|---|---|
| 1 | 회원·업체·게시판 | `auth/`, `supplier/`(입점·심사·서비스·공간), `board/`, `offer/`(오퍼·관심 업체), `profile/`, `files/`, `dev/`(가짜 로그인) | `auth/`, `supplier/`, `venue/`, `board/`, `offer/`, `profile/` + 공통 레이아웃 | `user.py`, `supplier.py`, `venue.py`, `board.py`, `offer.py`, `file.py` | `tests/f1/`, F2-01~03, F3-16~19, F4-01~04·09~11, F5-01·15~17 |
| 2 | 공연 요청·배정 | `request/`(요청서·버전·공고·단계·다음 단계·반려 카운트·내 공연) | `request/`, `performance/` | `request.py` (performances, performance_versions, stages, rejection_events) | F2-04~13, F3-01~05, F4-05~07, F5-02 |
| 3 | 견적·채팅 확정 | `quote/`, `chat/`(채팅방·메시지·WebSocket·확인 카드·컨펌), `notification/` | `quote/`, `chat/`, `notification/` | `quote.py`, `chat.py`, `notification.py` | F2-14~20, F3-06~15, F5-12 |
| 4 | 검사·결제·운영 | `check/`(CHK·기술 확인), `payment/`(청구서·결제·장부·취소), `policy/`(신고·경고·정지), `admin/`, `demo/`(시드·초기화) | `compare/`(단계별 비교), `tech/`, `payment/`, `sheet/` | `policy.py`, `check.py`, `payment.py` | F3-20~25, F4-08, F5-03~11·13·14 |

### 공통 파일 (함부로 고치지 않는다)

| 파일 | 규칙 |
|---|---|
| `backend/app/core/` (config, db, errors, security, history) | **해원 리뷰 필수.** 고쳐야 하면 이슈로 먼저 말한다 |
| `backend/app/main.py` | 자기 router를 등록하는 **한 줄만** 더한다 |
| `backend/app/models/__init__.py` | 자기 모델을 import하는 **한 줄만** 더한다 |
| `backend/app/models/history.py` (status_histories) | 공통. 모두 `record_transition()`으로만 쓴다 |
| `backend/app/models/user.py`, `supplier.py` | 1번 소유지만 모두가 읽는다. 칸을 더하거나 바꾸려면 1번과 해원에게 먼저 말한다 |
| `backend/app/admin/views.py`, `admin/__init__.py` | 자기 모델의 관리자 뷰만 더한다. 남의 뷰는 고치지 않는다 |
| `backend/alembic/versions/` | 자기 마이그레이션 파일만 더한다. **머지된 마이그레이션 파일은 고치지 않는다** (6.3) |
| `backend/tests/conftest.py` | 공통 픽스처. 더하는 것은 되지만 기존 픽스처의 동작을 바꾸지 않는다. 자기 묶음 전용 픽스처는 `tests/fN/conftest.py`에 둔다 |
| `frontend/src/App.tsx` | 자기 화면의 `<Route>` 줄만 더한다 |
| `frontend/src/shared/` | 공통 컴포넌트. 레이아웃·디자인 기준은 1번, `api/client.ts`는 해원 리뷰 필수 |
| `.github/`, `CONTRIBUTING.md`, `CLAUDE.md`, `specs/`, `docs/요구사항_명세서.md` | 해원만 고친다. 고칠 점은 이슈로 올린다 |

- 다른 묶음의 기능이 필요하면 **그 묶음의 `service.py` 함수만 부른다.** 남의 router를 HTTP로 부르거나, 남의 테이블을 직접 `select`·수정하지 않는다.
- 묶음 사이에 부르는 함수는 `specs/roles.md` 3장에 정해져 있다. 아직 없으면 **그 이름 그대로 빈 함수(`raise NotImplementedError`)를 만들어 달라고** 담당에게 요청하고, 내 테스트에서는 그 함수를 목업으로 바꿔 진행한다.

| 함수 | 주는 쪽 | 쓰는 쪽 |
|---|---|---|
| `current_user`, `require_role(...)` 의존성 | 1 | 전원 |
| `supplier.service.can_send_quotes(supplier)` (있음) | 1 | 3 |
| `get_venue_snapshot(venue_id)` | 1 | 2 |
| `get_open_stage(performance_id)` | 2 | 1(오퍼), 3(공고·견적) |
| `stage_confirmed(stage_id, quote_version_id)` | 2 (3이 부름) | 3 |
| `run_checks(...) -> list[CheckResult]` | 4 | 3 (컨펌 전), 4 (비교 화면) |
| `confirmed_lines(performance_id)` | 2·3 | 4 |
| `policy.service.warn(...)` (있음), `report(...)`, `blind_post(...)` | 4 | 1·3 |

## 6. 코드를 쓰는 방법

### 6.1 백엔드

- **층을 지킨다.** 모듈 하나에 이 파일들을 둔다.
  - `router.py` : 주소를 받는 곳. `schemas`로 검사하고 `service`를 부르고 응답을 만든다. **DB 조회와 규칙을 쓰지 않는다.**
  - `schemas.py` : 요청·응답 모양 (Pydantic v2). 입력 범위 검사는 여기서 (`Field(ge=1, le=500)` 등). 응답 클래스에 `model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=to_camel)`.
  - `service.py` : 규칙·상태 변경·DB 읽기와 쓰기. 다른 묶음이 부르는 함수도 여기.
  - 계산이 복잡하면 `calc.py`(DB를 모르는 순수 함수)를 따로 둔다. 자동 검사와 위약금은 꼭 순수 함수로 둔다.
- 모듈 경로: `app/<모듈>/router.py`의 `router = APIRouter(prefix="/<자원>", tags=["<모듈>"])`를 `main.py`의 `api` 라우터에 `api.include_router(...)` 한 줄로 등록한다 (모든 API는 `/api/v1` 아래).
- **DB 세션은 `db: Session = Depends(get_db)`로 받아** 서비스에 넘긴다. 직접 `SessionLocal()`을 열지 않는다.
- **커밋은 상태를 바꾸는 서비스 함수 끝에서 한 번** 한다 (본보기 `supplier/service.py`). 서비스 안에서 다른 서비스를 부를 때는 안쪽 함수가 커밋하지 않게 `_` 로 시작하는 내부 함수를 나눈다. 저장 직후 값이 필요하면 `db.flush()`.
- 권한 검사: 라우터 의존성 `require_role("USER")` 등으로 역할을 보고, **서비스에서 소유권을 다시 본다.** 내 것이 아니면 `not_found()`.
- 지금 사용자는 의존성으로 받는다. 번호를 코드에 적지 않는다.
- 모델: SQLAlchemy 2.0 `Mapped[...]` / `mapped_column(...)` 형식. 본보기 `app/models/supplier.py`. CHECK 제약과 생성 컬럼은 `data-model.md`와 똑같이 적는다.
- 사유가 필요한 동작(반려, 정지, 경고, 블라인드)은 사유가 비면 `VALIDATION_FAILED`(field `reason`).
- 시간: `datetime.now()`를 서비스 곳곳에서 직접 부르지 말고, 시간에 따라 바뀌는 규칙(D-day, 48시간 만료, 180일 초기화)은 `now`를 인자로 받게 만들어 테스트에서 고정할 수 있게 한다.
- 설정값(이용료 5% `PLATFORM_FEE_RATE`, 설치 경고 60분 `SETUP_WARNING_MINUTES`)은 `Settings`에서 읽는다. 숫자를 코드에 흩어 적지 않는다. `Settings`에 칸을 더하는 것은 `core/` 수정이라 해원 리뷰를 받는다.

### 6.2 프론트엔드

- 폴더: `src/features/<기능>/`에 그 기능의 컴포넌트·훅·API 함수, `src/pages/`에 라우트 화면, `src/shared/`에 공통 컴포넌트.
- **서버는 `shared/api/client.ts`의 `api<T>()`로만 부른다.** `fetch`·axios를 직접 쓰지 않는다. 요청·응답 타입은 `shared/api/types.ts`에 `api-contract.md`와 같은 이름(camelCase)으로 적는다.
- 서버 데이터는 **TanStack Query**(`useQuery`, `useMutation`)로 다룬다. 서버 데이터를 `useState`에 복사해 따로 관리하지 않는다. 쿼리 키는 `["<자원>", id, ...]` 모양.
- 결제·컨펌·다음 단계 버튼은 `idempotencyKey`를 넘기고, 누른 뒤 응답이 올 때까지 버튼을 끈다.
- 오류는 `ApiError`의 `body.message`를 그대로 보여 주고, `fieldErrors`는 해당 입력칸 아래에 보여 준다. 오류 문구를 화면에서 새로 지어내지 않는다.
- 금액은 공통 `MoneyText`(없으면 1번이 만든다)로 "1,850,000원"처럼 보여 준다. 금액을 화면에서 더하거나 곱하지 않는다.
- 검사 결과·상태는 `StatusBadge`로 보여 준다 (색 + 글자).
- **화면 디자인은 `DESIGN.md`를 따른다.** 기준 배치는 팀의 메인 페이지 와이어프레임(`docs/design/references/home-wireframe/`)이고, **배치와 스타일만** 따른다 (와이어프레임 안의 문구·예시는 임시라 쓰지 않는다). 색·크기는 `shared/styles/tokens.css`의 변수로만 쓰고 화면 파일에 숫자를 직접 적지 않는다. 화면은 `DESIGN.md` 5장의 공통 부품만 조립한다. 스타일은 CSS Modules(`*.module.css`).
- `DESIGN.md`에서 **비어 있거나(`____`) 확정 체크가 안 된 칸은 임의로 정하지 않는다.** 화면 내용이 비어 있으면 명세서 용어와 시연 데이터로 최소한만 만들고 "내용 미정"이라고 PR에 적는다.
- 화면 PR에는 스크린샷(웹 단계는 데스크톱 1280px)과 `DESIGN.md` 9장 점검 답을 붙인다.
- **웹 우선이다.** 기본 CSS는 데스크톱 기준으로 만들고, 모바일은 웹이 끝난 뒤 같은 CSS 파일에 `max-width` 미디어 쿼리(760px, 560px)로 덮어쓴다. 모바일용 화면·컴포넌트를 따로 만들지 않는다. 나중에 쉽게 바꾸도록 지금부터 고정 폭(px)을 쓰지 않고, 열 수·크기는 변수로 둔다 (`DESIGN.md` 2.5). 누르는 영역은 44픽셀 이상.
- 관리자 화면(`/admin`)은 React 라우트가 아니다. 만들지 않는다.
- `any`를 쓰지 않는다. `npm run build`(타입 검사 포함)가 통과해야 한다.

### 6.3 DB 마이그레이션 (Alembic)

- 모델을 더하거나 바꾸면 **같은 PR에 마이그레이션 파일**을 넣는다. 파일 이름: `NNNN_<묶음>_<내용>.py` (예: `0002_b2_performances_stages.py`). 번호는 develop의 마지막 번호 + 1.
- `down_revision`은 **develop의 최신 리비전**이어야 한다. PR을 올리기 전에 develop을 받아 `alembic heads`가 **하나**인지 본다. 둘이면 내 파일의 `down_revision`과 번호를 고친다.
- `upgrade()`와 `downgrade()`를 둘 다 쓴다. 로컬 MariaDB에서 `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head`가 되는지 본다 (CI도 upgrade·downgrade를 돌린다).
- **머지된 마이그레이션 파일은 고치지 않는다.** 고칠 것이 있으면 새 파일을 만든다.
- 모델과 마이그레이션이 다르면 `tests/test_common.py`의 비교 테스트가 실패한다. 이 테스트를 끄지 않는다.
- 생성 컬럼(`PERSISTENT`)은 SQLite에서 동작이 다를 수 있다. 그런 테스트는 MariaDB(CI)에서 확인한다.

### 6.4 공통

- 주석·문서·커밋 메시지는 **한국어**, 변수·함수·파일 이름은 **영어**로 쓴다.
- 이름은 DB·API의 이름과 같게 쓴다 (`company_name` ↔ `companyName`, `quote_version_id` ↔ `quoteVersionId`).
- 함수 위 docstring에 그 함수가 지키는 **AC·FR ID**를 적는다 (예: `"""AC-F1-19: 승인되면 …"""`).
- 쓰지 않는 코드·주석 처리한 코드·`print` 디버깅을 남기지 않는다.
- 파일을 새로 만들기 전에 같은 일을 하는 파일이 이미 있는지 찾는다.

## 7. 테스트

- **수용 기준 하나에 테스트 하나 이상.** 이름에 AC ID를 넣는다.
  - pytest: `backend/tests/f1 … f5/test_<주제>.py`, 함수 이름 `test_ac_f3_11_concurrent_confirm_only_one_succeeds`
  - Vitest: `frontend/tests/<기능>.test.tsx`, `it("AC-F2-09 장비 칸에 기본값이 없다", ...)`
- 어떤 종류(BE·FE·E2E)로 테스트할지는 `traceability.md`의 테스트 칸을 따른다.
- 테스트는 **값이 고정된 것**만 저장소에 넣는다. 8장의 예시 값과 경계 값을 쓴다. 돌릴 때마다 결과가 달라지는 테스트를 넣지 않는다. 시간은 인자로 고정한다.
- 픽스처: `conftest.py`의 `db`, `client`, `admin_client`, `make_user()`, `make_supplier()`를 먼저 쓴다.
- 권한 테스트를 꼭 넣는다: 다른 역할·다른 사용자로 같은 요청을 보내 `404`(또는 정해진 코드)가 나오는지.
- 동시성 테스트(AC-F3-11, AC-F5-06)는 스레드 2개로 같은 요청을 동시에 보내고, MariaDB에서만 돈다:
  `@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="MariaDB에서만")`
- 프론트 테스트는 API를 목업으로 바꿔서 돌린다 (MSW 또는 `vi.mock`). 실제 서버를 부르지 않는다.
- **테스트를 지우거나, `skip`으로 끄거나, 기대값을 바꿔서 통과시키지 않는다.** 실패하면 원인을 고치고, 스펙이 틀렸다고 생각되면 묻는다.

## 8. 예시 값 (시연 데이터)

문서, 테스트, 시드 데이터가 **같은 값**을 쓴다. 표는 **`docs/guides/시연_예시값.md`** 에 있다 — 계산·테스트·시드 데이터를 만들 때만 읽는다.
- 자주 쓰는 값: 공연장 C 500,000원 + 장비 D 1,350,000원 = 업체 금액 1,850,000원, 이용료 5% 92,500원(원 미만 버림), 청구서 1,942,500원.

## 9. 실행

Windows 기준이다 (macOS·Linux는 괄호 안). 자세한 준비는 `README.md`의 "개발 환경 실행".

```bash
# 백엔드 (backend 폴더에서)
.venv\Scripts\activate                 # (source .venv/bin/activate)
alembic upgrade head
uvicorn app.main:app --reload          # http://localhost:8000, API 문서 /docs, 관리자 /admin
pytest                                  # 임시 SQLite. MariaDB로: TEST_DATABASE_URL 지정

# 프론트엔드 (frontend 폴더에서)
npm run dev                             # http://localhost:5173 (/api, /ws, /admin은 8000으로 프록시)
npm test
npm run build                           # 타입 검사 포함
```

- 상태 확인: http://localhost:8000/api/v1/health
- 관리자 계정: `python -m app.cli create-admin --email admin@stageduck.test`
- **MariaDB root 비밀번호를 짐작하거나 묻지 않는다.** DB 접속이 안 되면 사람이 `backend/.env`를 고치도록 안내한다.

## 10. Git과 PR

`CONTRIBUTING.md`가 기준이다. AI가 특히 지킬 것:

- **`main`·`develop`에서 직접 커밋하거나 push하지 않는다.** 최신 `develop`에서 작업 브랜치를 만든다: `feat/<모듈>-<설명>`, `fix/<모듈>-<설명>` (예: `feat/12-chat-견적내역확인카드`).
- 커밋 메시지: `<타입>(<모듈>): <한국어 50자 이내>`. 타입은 `feat` `fix` `refactor` `style` `test` `docs` `chore`. 모듈은 5장의 모듈 이름 또는 `common`.
- **`git add .`·`git add -A`를 쓰지 않는다.** 파일 이름을 적어 담는다. 담기 전에 `git status`로 **자기 묶음 파일만** 바뀌었는지, `.env`·`node_modules`·`*.db`·업로드 파일이 없는지 본다.
- **하지 않는다**: `git push --force`(개인 브랜치에서 꼭 필요할 때만, 사람에게 먼저 묻고), `--no-verify`, `git reset --hard`·`git clean`으로 남의 변경 지우기, 룰셋·브랜치 보호 설정 바꾸기.
- **AI는 PR을 머지하거나 승인(Approve)하지 않는다.** 관리자 권한으로 검사를 건너뛰는 머지(`--admin`)를 하지 않는다. 머지는 사람이 한다.
- PR은 `develop` 대상, 본문은 PR 템플릿을 채운다. `Closes #이슈번호`, **11장의 검증 표**, 화면을 바꿨으면 스크린샷.
- PR 하나 = 기능 하나 (변경 400줄 이하 권장). 커지면 나눈다.
- PR을 올리기 전에 develop을 받아 합치고, `pytest`, `npm test`, `npm run build`가 모두 통과하는지 본다. CI가 실패하면 고친 뒤 다시 올린다.
- 다른 묶음의 파일이나 공통 파일을 고쳤으면 그 담당과 해원을 리뷰어에 넣는다.
- 이슈에는 묶음 라벨(`area:1-회원·업체·게시판`, `area:2-요청·배정`, `area:3-견적·채팅`, `area:4-검사·결제·운영`, `area:common`)과 종류 라벨(`type:*`)을 붙인다.

## 11. 일을 마치기 전에 — 검증하고 결과를 보여 주는 방법

일을 마치면 "됐습니다"라고만 하지 않는다. 실제로 돌려 보고, **넣은 값과 나온 값을 표로 보여 준다.** 사람이 표만 보고 맞는지 판단할 수 있어야 한다.

### 무엇을 해 보는가

**만든 것에 해당하는 것만** 한다. 줄마다 할 일은 `docs/guides/검증_방법.md`의 표에 있다.

| 만든 것 | 최소한 하는 것 |
|---|---|
| 모든 기능 | 해당 AC의 Given-When-Then 재현 + 다른 역할·다른 사용자로 권한 확인 |
| 계산 (이용료, 위약금, 검사 시간) | 위에 더해 예시 값·경계 값 + 무작위 1,000건 이상을 따로 쓴 식과 비교 (불일치 0건) |
| 상태 변경, 동시·중복 요청 | 위에 더해 허용 안 된 전이 `409`, 같은 요청 2번에 1번만 반영 (MariaDB) |
| 모델 변경 | 위에 더해 마이그레이션 upgrade → downgrade → upgrade |
| 화면 | 위에 더해 서버를 켜고 정상 값·오류 값으로 직접 눌러 보기 (웹 단계는 데스크톱, 모바일 단계는 390px도) |

- 단순 조회·문구 수정처럼 위 표의 "계산·상태·동시성"이 없는 작업에 무작위 1,000건 같은 검증을 하지 않는다.

### 어떻게 보여 주는가

- **표로 보여 준다.** 무작위로 넣은 것 가운데 8~12건을 골라 입력과 결과를 한 줄씩 적는다. 경계 값 줄을 반드시 넣는다.
- **전체 건수와 불일치 건수를 적는다.** 예: "정상 입력 2,000건 중 불일치 0건, 잘못된 입력 500건 중 거부하지 못한 것 0건"
- **확인한 것과 확인하지 못한 것을 나눠 적는다.** 돌려 보지 않은 것을 "된다"고 적지 않는다. SQLite에서만 돌리고 MariaDB에서 못 돌렸으면, 화면을 띄워 보지 않았으면 그렇게 적는다.
- **실제 DB를 바꿨으면 말한다.** 무엇이 몇 줄 바뀌었는지, 되돌렸는지 적는다. 시험용으로 넣은 값은 되돌린다.
- 결과는 **PR 설명에도 붙인다.** 리뷰하는 사람이 다시 돌려 보지 않아도 되게 한다.
- 무작위로 돌린 스크립트는 저장소에 넣지 않는다. 확인용으로 한 번 쓰고 버린다.

## 12. AI가 일하는 방식

- **한국어로, 쉬운 말로** 답한다.
- 요청이 애매하면 만들기 전에 **한 번 묻는다.** 특히 스펙에 답이 없는 규칙, 다른 묶음에 영향을 주는 변경, DB 스키마·API 계약 변경.
- 큰 작업은 먼저 계획(만들 파일, 부를 함수, 쓸 테스트, 해당 AC)을 보여 주고 시작한다.
- 이 저장소의 **기존 코드 모양을 따른다.** 새 API는 `supplier/service.py`와 `tests/f1/test_supplier_review.py`의 모양을 본보기로 한다.
- 오류가 나면 원인을 찾아 고친다. 테스트를 끄거나, 검사를 우회하거나, 오류를 `try/except`로 삼켜서 넘어가지 않는다.
- 문서와 코드가 다르다는 것을 발견하면, 코드를 문서에 맞추고 그 사실을 알린다. 문서가 틀린 것 같으면 고치지 말고 해원에게 알릴 내용을 적어 준다.

## 13. 토큰을 아끼는 방법

필요한 일은 다 하되, **결과에 도움이 안 되는 읽기·실행·출력·작업은 하지 않는다.**

### 13.1 읽기
- **필요한 문서의 필요한 부분만 읽는다.** 2장 표에서 문서를 고르고, 긴 문서는 통째로 읽지 않는다. `docs/요구사항_명세서.md`(1,100줄 넘음)·`specs/spec.md`·`specs/traceability.md`·`specs/api-contract.md`는 **검색으로 해당 ID(`AC-F3-11`, `FR-CHAT-03`, `/stages/`)를 찾아 그 근처만** 읽는다.
- 기능 하나를 시작할 때 읽는 순서: `traceability.md`의 그 AC 줄 → `spec.md`의 그 AC 문장 → 거기 적힌 API·테이블 부분만 `api-contract.md`·`data-model.md`에서. 이걸로 충분하면 더 읽지 않는다.
- **같은 파일을 다시 읽지 않는다.** 방금 고친 파일을 확인하려고 다시 열지 않는다 (고치기가 실패하면 도구가 알려 준다).
- **읽지 않는 것**: `node_modules/`, `.venv/`, `dist/`, `package-lock.json`, `*.db`, `exports/`, `docs/naming/`, `docs/images/`, 다른 묶음의 코드(5장의 함수 이름만 보고 부른다. 12장의 본보기 파일은 예외), 머지된 지 오래된 마이그레이션 파일.
- 폴더 전체를 훑지 않고 검색(Glob·Grep)으로 찾는다. `docs/guides/`는 그 일을 할 때만 읽는다.
- Figma는 파일 전체가 아니라 **프레임 하나의 링크**로 읽는다. 공통 값(색·글자·버튼)은 코드의 공통 기준을 먼저 쓰고, 없는 것만 Figma에서 읽는다.

### 13.2 실행
- **테스트는 좁게 먼저, 전체는 한 번.** 작업 중에는 `pytest tests/f3/test_confirm.py -k ac_f3_11 -q`처럼 고친 부분만, 프론트는 `npx vitest run tests/chat.test.tsx`처럼 파일 하나만 돌린다. 전체 `pytest`·`npm test`·`npm run build`는 PR 올리기 전에 한 번.
- **출력을 줄인다.** `pytest -q --tb=short -p no:warnings`, 긴 로그는 `| tail -30`, CI 실패 로그는 오류 줄만 (`gh run view --log-failed | grep -iE "error|fail" | head`).
- 고친 것 없이 같은 명령을 다시 돌리지 않는다. 서버·`npm install`을 이유 없이 여러 번 띄우지 않는다.

### 13.3 하지 않는 작업
- **요청받지 않은 일을 하지 않는다**: 리팩터링, 파일 전체 포맷 정리, 이름 바꾸기, 관련 없는 버그 수정, README·문서 추가, 주석 달기, AC에 없는 테스트 추가, "있으면 좋을" 기능. 눈에 띄면 **한 줄로 알리기만** 한다.
- 서브에이전트·병렬 세션·웹 검색은 사람이 시킬 때만 쓴다. 라이브러리 사용법이 꼭 필요하면 공식 문서의 그 부분만 본다.
- 이미 끝난 검증을 반복하지 않는다. 11장 표에서 해당하는 것만 한다.
- 짐작으로 크게 만든 뒤 고치지 않는다. 애매하면 **만들기 전에 한 번 묻는 것**이 더 싸다.

### 13.4 답하기
- **짧게 답한다.** 끝낼 때는 바꾼 파일, 지킨 AC, 검증 표(8~12줄), 확인 못 한 것, 다음 할 일만. 과정 설명·사과·반복을 쓰지 않는다.
- 코드·파일 전체를 대화에 붙이지 않는다. 경로와 줄 번호로 가리키고 꼭 필요한 몇 줄만 보여 준다.

### 13.5 사람이 할 일
팀원이 Claude를 쓰는 법(세션 하나 = 이슈 하나, 첫 메시지에 이슈·AC ID 적기, `/clear`·`/compact`)은 **`docs/guides/클로드_사용법.md`**에 있다. Claude는 이 문서를 읽지 않아도 된다.

## 14. 이 파일을 고치는 방법

- 이 파일은 해원이 관리한다. 바꾸고 싶은 규칙이 있으면 이슈로 올린다.
- 결정이 바뀌면 `docs/요구사항_명세서.md` 10장 → 관련 `specs/` → 이 파일 순서로 고친다.

| 날짜 | 내용 |
|---|---|
| 2026-11-13 | 처음 작성 (요구사항 명세서 v0.5, spec 93개 AC, roles v0.3 기준) |
| 2026-11-13 | 13장 토큰 아끼기 추가. 8장 예시 값 표·11장 검증 표를 `docs/guides/`로 옮겨 이 파일을 가볍게 함 |
