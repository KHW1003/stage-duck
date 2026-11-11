# 협업 규칙

4명이 같은 저장소에서 충돌 없이 일하기 위한 최소 규칙입니다. 바꾸고 싶으면 PR로 제안합니다.

## 1. 브랜치 전략

```
main        ← 발표·배포 가능한 상태만. 직접 push 금지
 └ develop  ← 통합 브랜치. 모든 작업 PR은 여기로
    ├ feat/request-공연요청서-작성
    ├ feat/supplier-견적-작성
    ├ fix/compare-일정충돌-계산
    └ docs/research-수요조사
```

| 브랜치 | 용도 | 만드는 곳 → 합치는 곳 |
|---|---|---|
| `main` | 최종본 (마일스톤·발표 시점) | `develop` → `main` (팀 합의 후, 해원 승인 필수) |
| `develop` | 개발 통합 | - |
| `feat/<영역>-<설명>` | 기능 개발 | `develop` → `develop` |
| `fix/<영역>-<설명>` | 버그 수정 | `develop` → `develop` |
| `docs/<설명>` | 문서 | `develop` → `develop` |
| `chore/<설명>` | 설정·빌드·의존성 | `develop` → `develop` |
| `hotfix/<설명>` | main 긴급 수정 | `main` → `main` + `develop` |

`<영역>`: `request` · `supplier` · `compare` · `payment` · `common`

브랜치 이름에는 **이슈 번호**를 붙여도 좋습니다: `feat/12-request-공연요청서-작성`

## 2. 작업 순서

1. **이슈 만들기** — 템플릿 선택, 담당 영역 라벨(`area:*`) 붙이기, 자기 자신 Assign
2. **브랜치 만들기** — 항상 최신 `develop`에서
   ```bash
   git switch develop
   git pull
   git switch -c feat/12-request-공연요청서-작성
   ```
3. **작게 커밋** — 아래 커밋 규칙
4. **PR 올리기** — `develop` 대상, 본문에 `Closes #12`
5. **리뷰 1명 승인** 후 **Squash and merge**, 브랜치 삭제
6. 다른 사람 PR이 머지되면 내 브랜치에 반영
   ```bash
   git switch develop
   git pull
   git switch -
   git merge develop
   ```

## 3. 커밋 메시지

```
<타입>(<영역>): <무엇을 했는지, 한국어, 50자 이내>

<필요하면 본문: 왜 바꿨는지>
```

| 타입 | 의미 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변화 없는 코드 개선 |
| `style` | 포맷·세미콜론 등 (UI 디자인 변경은 `feat`) |
| `test` | 테스트 추가·수정 |
| `docs` | 문서 |
| `chore` | 설정·빌드·의존성·기타 |

예시
```
feat(request): 공연 요청서 작성 API 추가
fix(compare): 설치 완료 시각과 리허설 충돌 판정 오류 수정
docs(research): 소규모 공연장 공급 현황 조사 추가
chore(common): ESLint 설정 추가
```

## 4. Pull Request

- 대상 브랜치는 **`develop`** (main 아님!)
- PR 하나 = 기능 하나. 리뷰하기 힘들 만큼 커지면 나눕니다 (권장: 변경 400줄 이하)
- 템플릿의 체크리스트를 채우고, 화면 변경은 스크린샷 첨부
- 리뷰어 1명 이상 승인 필요. 리뷰어는 **다른 영역 담당자**로 지정해 서로의 코드를 알게 합니다
- 리뷰 요청을 받으면 **24시간 안에** 확인
- 승인 후 새 커밋을 올리면 승인이 취소됩니다 → 다시 리뷰 요청
- 머지 방식은 GitHub 룰셋으로 고정되어 있습니다
  - 작업 브랜치 → `develop`: **Squash and merge** (작업 하나 = 커밋 하나)
  - `develop` → `main`: **Create a merge commit** (squash하면 develop과 main 이력이 어긋나 다음 반영 때 충돌)
- 다른 영역의 파일(특히 공통 코드·DB 스키마)을 수정했으면 해당 담당자를 리뷰어에 추가

## 5. 영역 간 약속 (공통 코드)

다른 담당자에게 영향을 주는 아래 항목은 **혼자 바꾸지 않고 이슈/회의에서 합의 후** 변경합니다.

- 계정·역할·권한 정의
- DB 스키마 (공연 ID, 요청/견적 버전, 확인·수락 상태)
- API 응답·오류 형식, 날짜·시간·금액 규칙
- 공통 레이아웃·컴포넌트

합의된 결정은 [docs/decisions](docs/decisions/)에 기록합니다.

## 6. 하지 말 것

- `main`, `develop`에 직접 push
- `.env`, API 키, 결제 테스트 키, 개인정보를 커밋 (→ `.env.example`에 키 이름만)
- `git push --force` (내 개인 브랜치에서만, 그것도 꼭 필요할 때만)
- 실제 업체·공간 이름이나 실제 개인정보를 시드 데이터에 사용 (전부 가상 데이터)

## 7. GitHub 저장소 보호 (룰셋)

Settings → Rules → Rulesets 에 적용되어 있습니다. 바꾸려면 팀 합의 후 관리자가 수정합니다.

| 규칙 | `develop` | `main` |
|---|---|---|
| 직접 push | ❌ PR만 가능 | ❌ PR만 가능 |
| 필요한 승인 | 다른 사람 1명 | **코드 오너(@KHW1003)** 1명 |
| 승인 후 새 커밋 | 승인 취소 | 승인 취소 |
| 마지막 push는 다른 사람이 승인 | ✅ | ✅ |
| 리뷰 대화 모두 해결 | ✅ | ✅ |
| 머지 방식 | Squash만 | Merge commit만 |
| force push · 브랜치 삭제 | ❌ | ❌ |
| **CI `test` 통과** | ✅ **예외 없음 (관리자 포함)** | ✅ **예외 없음 (관리자 포함)** |
| 승인 예외(bypass) | 관리자 — PR을 통해서만 | 관리자 — PR을 통해서만 |

룰셋은 세 개입니다: `develop 보호`, `main 보호`, `테스트 필수 (예외 없음)`.

- 관리자(@KHW1003)는 승인 없이 자기 PR을 머지할 수 있습니다. 하지만 **테스트는 관리자도 건너뛸 수 없습니다.**
- 직접 push는 관리자도 불가하며, 가능하면 관리자도 팀원 리뷰를 받고 머지합니다.

### 자동 머지 (auto-merge)

PR 화면에서 **Enable auto-merge** 를 눌러 두면, 조건(승인 + 테스트 통과)이 채워지는 순간 GitHub가 자동으로 머지합니다.
- PR마다 따로 켭니다. 켜지 않은 PR은 지금처럼 직접 머지 버튼을 누릅니다.
- 리뷰에서 수정 요청이 오거나 테스트가 실패하면 머지되지 않고 기다립니다.

### CI (자동 검사)

`.github/workflows/ci.yml` — PR을 올리거나 커밋을 추가할 때마다 실행됩니다.
- 현재: 머지 충돌 표시 검사, GitHub 설정 YAML 문법 검사
- 기술 스택 결정 후: 실제 애플리케이션 테스트로 교체 (job 이름 `test`는 유지 — 룰셋이 이 이름으로 검사합니다)

저장소 설정
- Default branch: `develop`, 머지된 브랜치 자동 삭제, 자동 머지 허용
- Secret scanning push protection: 켜짐 (API 키 등이 포함된 push 거부)
- 라벨: `bash scripts/setup-labels.sh` (gh CLI 필요)
- 기술 스택 결정 후 추가 예정: Dependabot
