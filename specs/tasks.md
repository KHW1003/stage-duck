# STAGE DUCK 작업 목록 (tasks.md)

| 항목 | 내용 |
|---|---|
| 버전 | 0.1 |
| 작성일 | 2026-11-13 |
| 입력 | [spec.md](spec.md) 93개 AC, [traceability.md](traceability.md), [roles.md](roles.md) |
| 원칙 | 이슈 하나 = 하루~이틀 작업. 이슈 본문에 그 AC의 추적표 행(API·테이블·화면·테스트)이 들어 있다 |

> AC 93개 = 작업에 배정 90개 + 이미 구현 3개(AC-F1-19, F1-20, F4-08 — PR #9). AC-F3-20은 검사 엔진(T4-02)과 비교 화면(T4-03)이 나눠 맡는다.
> Claude에게 시킬 때: "이슈 #번호 해 줘"로 시작한다 ([클로드_사용법](../docs/guides/클로드_사용법.md)).

## 첫날 할 일 (priority:high)

| 작업 | 이슈 | 담당 | 내용 |
|---|---|---|---|
| T0-1 | [#14](https://github.com/KHW1003/stage-duck/issues/14) | 세환 | [준비] 세환 — 로컬 개발 환경 세팅 |
| T0-2 | [#15](https://github.com/KHW1003/stage-duck/issues/15) | 해원 | [준비] 해원 — 로컬 개발 환경 세팅 |
| T0-3 | [#16](https://github.com/KHW1003/stage-duck/issues/16) | 채은 | [준비] 채은 — 로컬 개발 환경 세팅 |
| T0-4 | [#17](https://github.com/KHW1003/stage-duck/issues/17) | 목산 | [준비] 목산 — 로컬 개발 환경 세팅 |
| T1-01 | [#22](https://github.com/KHW1003/stage-duck/issues/22) | 세환 | 개발용 가짜 로그인 + 로그인 사용자·권한 의존성 |
| T2-01 | [#35](https://github.com/KHW1003/stage-duck/issues/35) | 해원 | 묶음 사이 약속 빈 함수 + 대표 시나리오 통합 테스트 초안 |
| T4-01 | [#46](https://github.com/KHW1003/stage-duck/issues/46) | 목산 | 시드 데이터 (업체 A~G, 공간 A·B·C, 시연 계정) + 시연 초기화 |

## 1주차 — 기반·핵심 흐름

### 묶음 1 — 세환

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T0-1 | [#14](https://github.com/KHW1003/stage-duck/issues/14) | [준비] 세환 — 로컬 개발 환경 세팅 | — | — |
| T0-W1 | [#18](https://github.com/KHW1003/stage-duck/issues/18) | [설계] 묶음 1 화면 와이어프레임 (Figma) | — | — |
| T1-01 | [#22](https://github.com/KHW1003/stage-duck/issues/22) | 개발용 가짜 로그인 + 로그인 사용자·권한 의존성 | F1-16 | — |
| T1-02 | [#23](https://github.com/KHW1003/stage-duck/issues/23) | 공통 레이아웃·라우팅·디자인 기준 | — | T0-W1 ([#18](https://github.com/KHW1003/stage-duck/issues/18)) |
| T1-03 | [#24](https://github.com/KHW1003/stage-duck/issues/24) | 사용자 이메일 가입·로그인·로그아웃 (JWT 쿠키 + CSRF) | F1-01, F1-02, F1-03, F1-11, F1-12 | T1-01 ([#22](https://github.com/KHW1003/stage-duck/issues/22)) |
| T1-04 | [#25](https://github.com/KHW1003/stage-duck/issues/25) | 네이버 로그인(테스트 계정)·카카오(비활성)·소셜 추가 정보 | F1-04, F1-05, F1-06, F1-07, F1-08, F1-09, F1-10 | T1-03 ([#24](https://github.com/KHW1003/stage-duck/issues/24)) |
| T1-05 | [#26](https://github.com/KHW1003/stage-duck/issues/26) | 업체 가입·입점 3단계·심사 상태 화면 | F1-17, F1-18 | T1-03 ([#24](https://github.com/KHW1003/stage-duck/issues/24)) |
| T1-06 | [#27](https://github.com/KHW1003/stage-duck/issues/27) | 서비스·공간 등록 + 공간 스냅샷 함수 | F2-01, F2-02, F2-03 | T1-05 ([#26](https://github.com/KHW1003/stage-duck/issues/26)) |
| T1-07 | [#28](https://github.com/KHW1003/stage-duck/issues/28) | 공간 탐색 목록·상세 | F5-01 | T1-06 ([#27](https://github.com/KHW1003/stage-duck/issues/27)) |
| T1-08 | [#29](https://github.com/KHW1003/stage-duck/issues/29) | 파일 업로드 API (`POST /files`) | — | T1-01 ([#22](https://github.com/KHW1003/stage-duck/issues/22)) |
| T1-09 | [#30](https://github.com/KHW1003/stage-duck/issues/30) | PR 게시판 목록·상세·작성 (말머리·필터·부문당 1개) | F4-01, F4-02, F4-04, F4-09 | T1-05 ([#26](https://github.com/KHW1003/stage-duck/issues/26)), T1-08 ([#29](https://github.com/KHW1003/stage-duck/issues/29)) |

### 묶음 2 — 해원

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T0-2 | [#15](https://github.com/KHW1003/stage-duck/issues/15) | [준비] 해원 — 로컬 개발 환경 세팅 | — | — |
| T0-W2 | [#19](https://github.com/KHW1003/stage-duck/issues/19) | [설계] 묶음 2 화면 와이어프레임 (Figma) | — | — |
| T2-01 | [#35](https://github.com/KHW1003/stage-duck/issues/35) | 묶음 사이 약속 빈 함수 + 대표 시나리오 통합 테스트 초안 | — | — |
| T2-02 | [#36](https://github.com/KHW1003/stage-duck/issues/36) | 공연 요청서 STEP1·STEP2 + 버전 | F2-04, F2-05, F2-06, F2-07, F2-08, F2-09, F2-10 | T1-01 ([#22](https://github.com/KHW1003/stage-duck/issues/22)), T2-01 ([#35](https://github.com/KHW1003/stage-duck/issues/35)) |
| T2-03 | [#37](https://github.com/KHW1003/stage-duck/issues/37) | 공고 게시·내림·노출 조건·버전 갱신 | F2-11, F2-12, F2-13 | T2-02 ([#36](https://github.com/KHW1003/stage-duck/issues/36)) |
| T2-04 | [#38](https://github.com/KHW1003/stage-duck/issues/38) | 순차 배정·단계 열기·[다음 단계로]·건너뛰기·전부 구했어요 | F3-01, F3-02, F3-03, F3-04, F3-05 | T2-03 ([#37](https://github.com/KHW1003/stage-duck/issues/37)) |

### 묶음 3 — 채은

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T0-3 | [#16](https://github.com/KHW1003/stage-duck/issues/16) | [준비] 채은 — 로컬 개발 환경 세팅 | — | — |
| T0-W3 | [#20](https://github.com/KHW1003/stage-duck/issues/20) | [설계] 묶음 3 화면 와이어프레임 (Figma) | — | — |
| T3-01 | [#41](https://github.com/KHW1003/stage-duck/issues/41) | 업체 공고 목록·상세 + 견적서 작성(여러 개)·버전·합계 검증 | F2-14, F2-15, F2-16, F2-17, F2-18, F2-19, F2-20 | T2-03 ([#37](https://github.com/KHW1003/stage-duck/issues/37)) |
| T3-02 | [#42](https://github.com/KHW1003/stage-duck/issues/42) | 채팅방·메시지 + WebSocket 실시간·사진·파일·읽음 | F3-06, F3-07, F3-08 | T3-01 ([#41](https://github.com/KHW1003/stage-duck/issues/41)), T1-08 ([#29](https://github.com/KHW1003/stage-duck/issues/29)) |

### 묶음 4 — 목산

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T0-4 | [#17](https://github.com/KHW1003/stage-duck/issues/17) | [준비] 목산 — 로컬 개발 환경 세팅 | — | — |
| T0-W4 | [#21](https://github.com/KHW1003/stage-duck/issues/21) | [설계] 묶음 4 화면 와이어프레임 (Figma) | — | — |
| T4-01 | [#46](https://github.com/KHW1003/stage-duck/issues/46) | 시드 데이터 (업체 A~G, 공간 A·B·C, 시연 계정) + 시연 초기화 | F5-14 | — |
| T4-02 | [#47](https://github.com/KHW1003/stage-duck/issues/47) | 자동 검사 엔진 `run_checks()` (CHK-01~12) | F3-20, F3-21, F3-22, F3-23, F3-24 | T2-01 ([#35](https://github.com/KHW1003/stage-duck/issues/35)) |
| T4-03 | [#48](https://github.com/KHW1003/stage-duck/issues/48) | 단계별 견적 비교 화면 (대표 화면) | F3-20 | T4-02 ([#47](https://github.com/KHW1003/stage-duck/issues/47)), T1-02 ([#23](https://github.com/KHW1003/stage-duck/issues/23)), T0-W4 ([#21](https://github.com/KHW1003/stage-duck/issues/21)) |

## 2주차 — 연결·결제·마무리

### 묶음 1 — 세환

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T1-10 | [#31](https://github.com/KHW1003/stage-duck/issues/31) | PR 게시판 블라인드·정지 업체 글 숨김 + 관리자 뷰 | F4-03, F4-10, F4-11 | T1-09 ([#30](https://github.com/KHW1003/stage-duck/issues/30)), T4-09 ([#54](https://github.com/KHW1003/stage-duck/issues/54)) |
| T1-11 | [#32](https://github.com/KHW1003/stage-duck/issues/32) | 직접 오퍼·관심 업체 | F3-16, F3-17, F3-18, F3-19 | T1-09 ([#30](https://github.com/KHW1003/stage-duck/issues/30)), T2-04 ([#38](https://github.com/KHW1003/stage-duck/issues/38)) |
| T1-12 | [#33](https://github.com/KHW1003/stage-duck/issues/33) | 업체 프로필·개인 프로필·마이페이지 | F5-15, F5-16, F5-17 | T1-09 ([#30](https://github.com/KHW1003/stage-duck/issues/30)) |
| T1-13 | [#34](https://github.com/KHW1003/stage-duck/issues/34) | 권한 공통 검사 테스트 (남의 리소스 404, 심사 중 업체 거부) | F1-13, F1-14, F1-15 | T2-02 ([#36](https://github.com/KHW1003/stage-duck/issues/36)), T3-01 ([#41](https://github.com/KHW1003/stage-duck/issues/41)), T3-02 ([#42](https://github.com/KHW1003/stage-duck/issues/42)) |

### 묶음 2 — 해원

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T2-05 | [#39](https://github.com/KHW1003/stage-duck/issues/39) | 반려 카운트·게시 제한 | F4-05, F4-06, F4-07 | T2-03 ([#37](https://github.com/KHW1003/stage-duck/issues/37)), T3-02 ([#42](https://github.com/KHW1003/stage-duck/issues/42)) |
| T2-06 | [#40](https://github.com/KHW1003/stage-duck/issues/40) | 내 공연 현황 (단계와 다음 할 일) | F5-02 | T2-04 ([#38](https://github.com/KHW1003/stage-duck/issues/38)) |

### 묶음 3 — 채은

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T3-03 | [#43](https://github.com/KHW1003/stage-duck/issues/43) | 견적 내역 확인 카드·내역서·컨펌(동시성)·다른 견적 자동 마감 | F3-09, F3-10, F3-11, F3-12, F3-14 | T3-02 ([#42](https://github.com/KHW1003/stage-duck/issues/42)), T2-04 ([#38](https://github.com/KHW1003/stage-duck/issues/38)), T4-02 ([#47](https://github.com/KHW1003/stage-duck/issues/47)) |
| T3-04 | [#44](https://github.com/KHW1003/stage-duck/issues/44) | 자동 마감 알림·연락처 감지 경고·결제 전 연락처 비공개 | F3-13, F3-15, F5-12 | T3-03 ([#43](https://github.com/KHW1003/stage-duck/issues/43)) |
| T3-05 | [#45](https://github.com/KHW1003/stage-duck/issues/45) | 사이트 안 알림 | — | T3-02 ([#42](https://github.com/KHW1003/stage-duck/issues/42)) |

### 묶음 4 — 목산

| 작업 | 이슈 | 내용 | AC | 먼저 끝나야 하는 것 |
|---|---|---|---|---|
| T4-04 | [#49](https://github.com/KHW1003/stage-duck/issues/49) | 기술 확인 | F3-25 | T2-04 ([#38](https://github.com/KHW1003/stage-duck/issues/38)) |
| T4-05 | [#50](https://github.com/KHW1003/stage-duck/issues/50) | 통합 청구서·플랫폼 이용료 5% | F5-03, F5-04 | T3-03 ([#43](https://github.com/KHW1003/stage-duck/issues/43)) |
| T4-06 | [#51](https://github.com/KHW1003/stage-duck/issues/51) | 에스크로형 모의 결제·장부·멱등 | F5-05, F5-06, F5-07 | T4-05 ([#50](https://github.com/KHW1003/stage-duck/issues/50)) |
| T4-07 | [#52](https://github.com/KHW1003/stage-duck/issues/52) | 취소·위약금·업체 사정 취소 | F5-08, F5-09, F5-10 | T4-06 ([#51](https://github.com/KHW1003/stage-duck/issues/51)) |
| T4-08 | [#53](https://github.com/KHW1003/stage-duck/issues/53) | 최종 담당표 (결제 후 연락처 공개) | F5-11 | T4-06 ([#51](https://github.com/KHW1003/stage-duck/issues/51)) |
| T4-09 | [#54](https://github.com/KHW1003/stage-duck/issues/54) | 신고·블라인드 서비스 + 관리자 뷰(신고·공연 이력) | F5-13 | T2-04 ([#38](https://github.com/KHW1003/stage-duck/issues/38)) |

## 묶음별 집계

| 묶음 | 담당 | 이슈 | 배정 AC |
|---|---|---|---|
| 1 | 세환 | 15 | 36 |
| 2 | 해원 | 8 | 19 |
| 3 | 채은 | 7 | 18 |
| 4 | 목산 | 11 | 18 |

- 묶음 1이 가장 많다. 밀리면 roles.md "부하 점검" 순서대로 공간(SPACE, T1-06·T1-07)을 2번으로 넘긴다.
- 이슈를 바꾸면(쪼개기·합치기·담당 변경) 이 표도 같이 고친다.
