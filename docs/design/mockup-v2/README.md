# 안쪽 화면 목업 v2 (mockup-v2/) · 아이콘·사진 더한 버전

v1(`../mockup/web/`)과 화면·구성은 같고, **아이콘과 사진을 더한** 버전이에요. 둘을 나란히 열어 비교해 보세요.

## v1에서 더한 것
| 곳 | 더한 것 |
|---|---|
| 모든 구간 제목 | 앞에 내용 아이콘 (요청서·견적서·일정·연락처 등) |
| 요약 칸·단계 칸 | 아이콘 상자, 단계 번호 옆 아이콘 |
| 섭외 단계 | 공연장·장비·엔지니어 아이콘 (컨펌은 채운 원, 지금 단계는 주조색 원) |
| 업체 | 프로필 사진 (업체 A~G) |
| 공간 찾기 | 공간 유형 타일(아이콘), 아래 기능 줄 |
| 공연 형태 | 요청서 STEP1 형태 타일, 내 공연·공고 제목 옆 공연 형태 사진 |
| 단계별 비교 | 견적서 칸 위 공간·장비 사진 (마감된 칸은 흑백) |
| 로그인·가입 | 왼쪽 무대 사진, 가입 유형 사진 |
| 청구서·담당표·기술 확인 | 업체 작은 사진, 시간표·항목 아이콘 |
| 알림 | 종류별 아이콘 (견적·채팅, 오퍼, 공고, 결제) |
| 컴포넌트 시안 9번 | 아이콘 전체 목록, 아이콘 상자·분류 타일·기능 줄·사진 규칙 |
| **채팅** | 채팅 화면(`chat.html`, `p-chat.html`)을 없애고 **채팅 위젯**으로 바꿈 (아래) |

## 채팅 위젯

로그인한 모든 화면(사용자·승인된 업체) 오른쪽 아래에 둥근 채팅 버튼이 있어요. 누르면 페이지 이동 없이 화면 위층(`--sd-z-float`)에 채팅 창이 떠요.

| 화면 | 머리줄 | 탭 (머리줄 바로 아래) | 내용 |
|---|---|---|---|
| 목록 | 채팅 · 안 읽음 수 · 닫기 | 사용자: 전체·공연장·장비·엔지니어 / 업체: 전체·진행 중·시작 전·마감 | 공연 고르기(사용자), 대화 목록 |
| 대화 | 뒤로 · 상대 · 내역서 · 신고 · 닫기 | 대화 · 견적 정보 | 대화: 말풍선·견적서 카드·확인 카드·입력칸 / 견적 정보: 예전 3단 화면의 오른쪽 칸 |

- 파일: `chat-widget.js`(그리기·동작, `layout.js`가 불러옴), `css/chat.css`(창·버튼). 말풍선·카드 같은 대화 안 부품은 `css/domain.css` 그대로이고, 창 안에서는 **둥글기만** 키웠어요 (창 16px, 말풍선 16px, 카드·입력칸 12px).
- React: `shared/chat/ChatWidget.tsx` = `ChatFab` + `ChatPanel`(view: list | room) > `ChatList` · `Room`(탭: 대화 | 견적 정보). `AppLayout`에 한 번만 둔다.
- 다른 화면의 [채팅] 버튼(알림·견적함·내 공연·내역서·공고)은 `useChat().open(방 id)`를 불러요. 목업에서는 `data-chat="d"`.
- 화면을 옮겨도 열린 창·방·탭이 이어져요 (목업: sessionStorage).
- 비로그인·심사 중 업체 화면에는 버튼이 없어요. 알림 토스트는 버튼 위로 올라가요. 560px 이하에서는 창이 화면을 꽉 채워요.
- 목업 주소: `?chat=list`, `?chat=d`(방 id: 사용자 d·e·c·a / 업체 ga·bom·ha), `&pane=info`, `?card=opened` · `?card=done`(업체 D 확인 카드)
- 그림자 없이(DESIGN.md 8장) 진한 테두리와 진한 머리줄로 층을 나눠요.

- 새 부품 CSS는 `css/visual.css` 하나에 있어요 (나머지 CSS는 v1과 같음).
- 글꼴·로고·사진은 `../mockup/`의 것을 함께 써요 (`../mockup/tokens.css`, `../mockup/assets/`).
- 사진은 `style="--img:url(...)"` CSS 변수로 넘겨요. 브라우저는 이 주소를 **CSS 파일(`css/`) 기준**으로 풀기 때문에, 화면 위치와 상관없이 `../../mockup/assets/photos/...`로 적어요. React에서는 `import` 한 이미지 주소를 넘기면 돼요.
- **팀 확인 필요:** 공연에는 사진 칸이 없어서(명세서), 공연 형태별 **기본 사진**을 서비스가 정해 두는 방식으로 그렸어요.

---


메인(`../home.html`, `../partner.html`)을 뺀 나머지 화면의 HTML 목업이에요. 나중에 React로 옮기기 쉽게 **부품 단위**로 나눠 만들었어요.

- 전체 목록: [`index.html`](index.html)
- 컴포넌트 시안 고르기: [`components.html`](components.html) (알림·결제창·확인 팝업·단계 표시·목록을 모양 A·B·C로, 채팅 위젯 상태 모음)
- 화면마다 왼쪽 아래 **목업 보기**로 상태를 바꿔 볼 수 있어요. 주소 끝 `?그룹=값`으로도 돼요 (예: `invoice.html?pay=paid`).

## 디자인 원칙

| 원칙 | 어떻게 |
|---|---|
| 카드를 쌓지 않는다 | 구역은 ① 회색 제목 띠(`.page-top`) ② 표·목록 위 굵은 선(`--sd-rule` 2px) ③ 줄 사이 1px 선으로 나눈다 |
| 이름-값은 표로 | 이름 칸은 회색 바탕(`--sd-th`), 값 칸은 흰 바탕 (`.info-table`, `.form-table`) |
| 강조는 최소로 | 파스텔 바탕을 쓰지 않는다. 지금 할 일·선택은 진한 선, 진한 머리줄, 글자색으로만 표시한다 |
| 단계는 칸으로 | 요청서·입점·결제 단계는 번호가 붙은 칸(`.step-bar`), 섭외 단계는 칸 나눔(`.track`) |
| 오른쪽 행동 상자 | 결제·오퍼·컨펌은 오른쪽 `.side-box`에 모은다 (티켓 예매 상자와 같은 배치) |
| 상태는 글자와 함께 | 자동 검사는 아이콘 + 글자(`.status`), 진행 상태는 점 + 글자(`.state`) |
| 그림자·그라데이션·이모지 없음 | DESIGN.md 8장 |

## 파일 → React 옮기는 곳

| 목업 파일 | React | 담는 것 |
|---|---|---|
| `../tokens.css` | `src/shared/styles/tokens.css` | 색·크기·간격 변수. 업체 색은 `[data-theme="partner"]`로 |
| `css/base.css` | `src/shared/styles/base.css` | 기본 스타일, `.container`, `.with-aside`, `.sec` |
| `css/layout.css` | `src/shared/layout/` | `SimulationBanner`, `Gnb`, `PageTop`, `SideNav`, `Footer` |
| `css/ui.css` | `src/shared/ui/` | `Button`, `Tag`, `StatusBadge`, `StateText`, `Field`, `Choice`, `Toggle`, `FormTable`, `Tabs`, `Filters`, `DataTable`, `InfoTable`, `List`, `Summary`, `Notice`, `Empty`, `Photo`, `Gallery`, `Avatar`, `Pagination`, `Fold`, `Modal`, `Drawer`, `NotificationPanel`, `Toast` |
| `css/domain.css` | `src/features/*` | `StepBar`, `StageTrack`, `SideBox`, `QuoteColumns`, `QuoteLines`, `PriorInfo`, `Versions`, `ChatLayout`·`ChatCard`, `Invoice`, `Escrow`, `PenaltyScale`, `Timeline`, `Contacts` |
| `css/theme-partner.css` | `tokens.css`의 `[data-theme="partner"]` | 업체 화면 주조색 `#0368B6` |
| `layout.js` | `AppLayout.tsx`, `Icon.tsx` | 헤더·바닥글·아이콘. 목업 전환(`.mock-switch`, `data-when`)은 옮기지 않는다 |
| `pages/*.html` 위 주석 | `src/pages/*Page.tsx` | 화면마다 부품 조합·관련 AC·API를 적어 뒀다 |
| 페이지 `<style>` | 그 화면의 `*.module.css` | 그 화면에서만 쓰는 배치 |

클래스 이름은 BEM 비슷하게 `부품__부분--모양`이에요. CSS Modules로 옮길 때 `styles.부품`, `styles.부분`처럼 쓰면 돼요.

## 지킨 규칙 (CLAUDE.md · DESIGN.md)

- 결제·취소 화면에 "테스트 결제 — 실제 청구되지 않습니다" (맨 위 시뮬레이션 안내 띠는 팀장 요청으로 목업에서 뺐다. CLAUDE.md 3장 26·spec 0.2는 아직 그대로)
- 용어: 사용자·업체·공고·견적서·컨펌·견적 내역 확인 카드·플랫폼 이용료·통합 청구서
- 예시 값은 `docs/guides/시연_예시값.md` (공간 A·B·C, 업체 A~G, 1,850,000 / 92,500 / 1,942,500원, D-1 위약금 1,295,000원)
- 이메일은 `@stageduck.test`, 전화는 `010-0000-00xx`
- 후속 기능(리얼 후기·평점, 익스프레스, 댓글)은 넣지 않음
- 연락처는 결제 뒤 최종 담당표에서만 보임
- 금액은 화면에서 계산하지 않고 "서버 계산" 값으로 표시

## 아직 정하지 않은 것 (DESIGN.md에 적어야 함)

- 컴포넌트 시안 A·B·C 중 무엇을 쓸지 (`components.html`)
- 사업자 정보 (바닥글 `내용 미정`)
- 아이콘 세트 (지금은 Lucide 모양을 따라 그림)
- 모바일 배치 (웹 완성 뒤 760px·560px 미디어 쿼리)
