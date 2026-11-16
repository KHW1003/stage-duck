# STAGE DUCK 🦆

> 공연 공간을 고르고, 그 공간에 맞는 **음향 장비·설치·엔지니어** 제안을 받아 비교한 뒤
> 한 사이트에서 섭외와 결제까지 진행하는 **소규모 공연 준비 중개 플랫폼**

⚠️ 포트폴리오용 프로젝트입니다. 등장하는 공간·업체·엔지니어·가격은 모두 **가상 데이터**이며, 결제는 **테스트 결제**로만 동작합니다.

---

## 한 줄 소개

"공연을 열 장소를 고르고, 그 공간에 맞는 장비와 엔지니어 제안을 받아 한곳에서 비교·섭외하는 플랫폼입니다.
공연장 패키지부터 이색 공간의 맞춤 음향까지, 총비용과 준비 일정을 함께 확인하고 참여 업체가 합의한 구성을 결제할 수 있습니다."

## 서비스 흐름

```
공연 요청서 작성 (공간·장비·기사 모집 공고)
        │
        ├─▶ 공간 운영자: 공간 / 전체 패키지 견적
        ├─▶ 음향업체:   장비·설치·운영 견적
        └─▶ 엔지니어:   현장 운영 단독 견적
        │
견적 비교 (총액 · 포함 범위 · 일정 충돌 · 기술 확인 상태)
        │
조합 선택 → 업체별 최종 검토·수락 → 테스트 결제 → 섭외 확정 (노쇼 방지)
```

## 대상

| 구분 | 내용 |
|---|---|
| 공연 규모 | 전국, 예상 관객 **500명 이하** |
| 주최자 예시 | 인디 밴드 공연, 어린이 소극단 뮤지컬, 소규모 연극, 교회·학원 행사, 버스킹(장비만) |
| 공급자 | 공간 운영자, 음향업체, 엔지니어(음향기사) |
| 대표 시연 | 광주, 관객 80명 밴드 공연 |

## MVP 범위

- 공연 요청 작성·공고 게시 · 전국 가상 공간 탐색 (승인된 공급자가 공고를 보고 견적 제출)
- 가상 공급자 7곳의 입점 신청 · 관리자 승인 · 견적 작성
- 전문 공연장 패키지 vs 이색 공간 + 외부 음향 조합 **비교**
- 기본 제공 장비 반영, 부족 수량 · 일정 충돌 · 기사 중복 표시, 기술 확인 기록
- 업체별 수락/거절, 수정 견적 재합의, 테스트 결제, 최종 일정표
- 역할·소유권 기반 접근 제한과 상태 변경 이력

보류(후속): 특정 업체 지정 초대, 버스킹 장비 별도 대여·회수, 실시간 재고, 실결제·환불·정산, 전자계약, 채팅, 후기, AI 자동 구성

## 팀 · 담당 영역

각자 맡은 기능을 **화면 → API → DB → 권한 → 테스트까지** 끝까지 담당합니다 (프론트/백 분리 X).

| # | 담당 영역 | 라벨 | 담당자 |
|---|---|---|---|
| 1 | 공연 요청 · 공간 선택 | `area:request` | TBD |
| 2 | 공급자 등록 · 전문가 견적 | `area:supplier` | TBD |
| 3 | 견적 비교 · 구성 확인 | `area:compare` | TBD |
| 4 | 업체 수락 · 결제 · 확정 | `area:payment` | TBD |
| - | 공통 (계정·로그인·레이아웃·오류 형식) | `area:common` | 전원 |

현장 자문: **목산님** (공연 음향 장비 세팅 실무) — 자문 내용은 [docs/advisory](docs/advisory/)에 기록합니다.

## 기술 스택

[ADR 0002](docs/decisions/0002-기술스택-선정.md) 참고.

| 영역 | 선택 |
|---|---|
| Frontend | React + Vite (TypeScript) |
| Backend | FastAPI (Python) + SQLAlchemy |
| DB | MariaDB |
| 테스트 | pytest / Vitest + React Testing Library |
| 결제(테스트) | 자체 에스크로형 모의 결제 |
| 배포 | Docker Compose |

## 개발 환경 실행

> **처음 세팅하는 팀원은 [docs/guides/로컬_개발환경_세팅.md](docs/guides/로컬_개발환경_세팅.md)를 따라 한다** (설치 → DB → 백엔드 → 프론트 → Claude Code → 자주 나는 오류). 아래는 요약이다.

### 준비물
Python 3.12, Node 22, MariaDB 11.4 (직접 설치 또는 `docker compose up -d mariadb`)

### 1. DB 만들기 (최초 1번, MariaDB root로 접속해서)
```sql
CREATE DATABASE stageduck CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'stageduck'@'localhost' IDENTIFIED BY '원하는_비밀번호';
GRANT ALL PRIVILEGES ON stageduck.* TO 'stageduck'@'localhost';
```

### 2. 백엔드 (FastAPI)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env             # macOS/Linux: cp .env.example .env  → DATABASE_URL 비밀번호 수정
alembic upgrade head               # 테이블 만들기
python -m app.cli create-admin --email admin@stageduck.test   # 관리자 계정
uvicorn app.main:app --reload      # http://localhost:8000
```
- API 문서: http://localhost:8000/docs
- **관리자 화면: http://localhost:8000/admin** (SQLAdmin — 업체 심사, 회원 경고, 이력)
- 테스트: `pytest` (DB 설정 없이 실행하면 임시 SQLite, `TEST_DATABASE_URL`을 주면 MariaDB)

### 3. 프론트엔드 (React + Vite)
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173  (/api, /admin 은 8000으로 프록시)
npm test        # Vitest
```

### 폴더
| 경로 | 내용 |
|---|---|
| `backend/app/<영역>/` | 영역별 `router.py` · `schemas.py` · `service.py` (specs/plan.md 3장) |
| `backend/app/admin/` | SQLAdmin 관리자 화면 — 액션은 서비스 함수만 호출 |
| `backend/tests/f1 … f5/` | 테스트 이름에 AC ID (`test_ac_f1_19_...`) |
| `frontend/src/shared/` | API 클라이언트, StatusBadge |

## 문서

| 문서 | 내용 |
|---|---|
| [docs/기획서_총계획서.md](docs/기획서_총계획서.md) | 사업 개요, 시나리오, 검증 규칙, 역할 분담 전체 |
| [docs/요구사항_명세서.md](docs/요구사항_명세서.md) | MVP 기능·비기능 요구사항, 상태 흐름, 대표 시나리오 추적표 |
| [docs/research](docs/research/) | 시장 조사 (수요·공급, 유사 서비스) |
| [docs/naming](docs/naming/네이밍_자료.md) | 서비스 네이밍 자료 (후보안, 점수표, 결정 절차) |
| [docs/advisory](docs/advisory/) | 현장 전문가 자문 기록 |
| [docs/meetings](docs/meetings/) | 회의록 |
| [docs/decisions](docs/decisions/) | 기술·설계 결정 기록 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 브랜치 · 커밋 · PR · 이슈 규칙 |
