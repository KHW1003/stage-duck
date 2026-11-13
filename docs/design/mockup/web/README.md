# 안쪽 화면 목업 (web/)

메인(`../home.html`, `../partner.html`)을 뺀 나머지 화면의 HTML 목업이에요. 나중에 React로 옮기기 쉽게 **부품 단위**로 나눠 만들었어요.

- 전체 목록: [`index.html`](index.html)
- 컴포넌트 시안 고르기: [`components.html`](components.html) (알림·결제창·채팅창·확인 팝업·단계 표시·목록을 모양 A·B·C로)
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

- 모든 화면 맨 위 "포트폴리오 시뮬레이션 — 실제 거래가 아닙니다", 결제·취소 화면에 "테스트 결제 — 실제 청구되지 않습니다"
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
