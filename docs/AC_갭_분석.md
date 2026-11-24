# AC 갭 분석 (11/19)

> `specs/spec.md`의 AC마다 테스트에 그 AC ID가 있는지(백엔드 pytest · 프론트 Vitest · E2E), 담당 이슈가 닫혔는지 기계로 센 결과예요.
> 테스트 이름·주석에 AC ID가 있다는 뜻이지, 그 AC를 **전부** 검사한다는 뜻은 아니에요. 11/24 수용 테스트에서 사람이 한 번 더 봐요.
> 대표 시나리오(`tests/scenario`, xfail)와 계약 테스트에만 나오는 AC는 테스트가 없는 것으로 쳤어요.

## 요약

| 상태 | 뜻 | 개수 |
|---|---|---|
| 끝 | 이슈 닫힘 + 테스트 있음 | 57 |
| 부분 | 이슈가 열려 있지만 테스트가 일부 있음 (약속 함수·계산 함수 등 먼저 들어간 것) | 27 |
| 없음 | 이슈가 열려 있고 테스트도 없음 | 25 |
| 확인 필요 | 이슈는 닫혔는데 AC ID가 붙은 테스트가 없음 | 0 |
| **합계** | | **109** |

대표 시나리오는 **채팅 시작까지** 통과하고, 다음 막힌 곳은 `POST /quotes/{id}/confirm-requests` (#43)예요.

## 남은 AC — 사람별

| 담당 | 이슈 | 없음 | 부분 |
|---|---|---|---|
| 목산 | #50 | F5-04 | F5-03 |
| 목산 | #51 | F5-05 · F5-06 · F5-07 | - |
| 목산 | #52 | F5-22 | F5-08 · F5-09 · F5-10 |
| 목산 | #53 | F5-11 | - |
| 목산 | #102 | F5-18 · F5-19 · F5-20 | - |
| 세환 | #25 | F1-05 · F1-06 · F1-07 · F1-09 · F1-10 | F1-04 · F1-08 |
| 세환 | #31 | F4-11 | F4-03 · F4-10 |
| 세환 | #32 | F3-16 · F3-17 · F3-18 · F3-19 | - |
| 세환 | #33 | F5-15 · F5-16 | F5-17 |
| 세환 | #34 | F1-13 · F1-14 · F1-15 | - |
| 채은 | #41 | - | F2-14 · F2-15 · F2-16 · F2-17 · F2-18 · F2-19 · F2-20 |
| 채은 | #42 | F3-26 | F3-06 · F3-07 · F3-08 |
| 채은 | #43 | - | F3-09 · F3-10 · F3-11 · F3-12 · F3-14 |
| 채은 | #44 | - | F3-13 · F3-15 · F5-12 |

## 전체 표

<details><summary>AC 109개 펼치기</summary>

| AC | 이슈 | 상태 | 백엔드 | 프론트 | E2E |
|---|---|---|---|---|---|
| AC-F1-01 | #24 | 끝 | signup | auth-venue | - |
| AC-F1-02 | #24 | 끝 | signup | - | - |
| AC-F1-03 | #24 | 끝 | signup | - | - |
| AC-F1-04 | #25 | 부분 | - | auth-venue | - |
| AC-F1-05 | #25 | 없음 | - | - | - |
| AC-F1-06 | #25 | 없음 | - | - | - |
| AC-F1-07 | #25 | 없음 | - | - | - |
| AC-F1-08 | #25 | 부분 | - | auth-venue | - |
| AC-F1-09 | #25 | 없음 | - | - | - |
| AC-F1-10 | #25 | 없음 | - | - | - |
| AC-F1-11 | #24 | 끝 | login | auth-venue | - |
| AC-F1-12 | #24 | 끝 | login | layout | - |
| AC-F1-13 | #34 | 없음 | - | - | - |
| AC-F1-14 | #34 | 없음 | - | - | - |
| AC-F1-15 | #34 | 없음 | - | - | - |
| AC-F1-16 | #22 | 끝 | dev_switch | - | - |
| AC-F1-17 | #26 | 끝 | supplier_application | supplier-onboarding | - |
| AC-F1-18 | #26 | 끝 | supplier_application | supplier-onboarding | - |
| AC-F1-19 | - | 끝 | conftest, supplier_application, supplier_review | - | - |
| AC-F1-20 | - | 끝 | supplier_application, supplier_review | supplier-onboarding | - |
| AC-F1-21 | #122 | 끝 | password_reset | auth-venue | - |
| AC-F1-22 | #122 | 끝 | password_reset | auth-venue | - |
| AC-F1-23 | #122 | 끝 | password_reset | - | - |
| AC-F2-01 | #27 | 끝 | venues | - | - |
| AC-F2-02 | #27 | 끝 | venues | - | - |
| AC-F2-03 | #27 | 끝 | venues | - | - |
| AC-F2-04 | #36 | 끝 | performance_api, performance_model | request | - |
| AC-F2-05 | #36 | 끝 | performance_api, performance_model | - | - |
| AC-F2-06 | #36 | 끝 | performance_api, performance_model | - | - |
| AC-F2-07 | #36 | 끝 | performance_api, performance_model | request | - |
| AC-F2-08 | #36 | 끝 | performance_api, performance_model | request | - |
| AC-F2-09 | #36 | 끝 | - | request | - |
| AC-F2-10 | #36 | 끝 | performance_api | request | - |
| AC-F2-11 | #37 | 끝 | posting, postings | postings | - |
| AC-F2-12 | #37 | 끝 | posting, postings | postings | - |
| AC-F2-13 | #37 | 끝 | posting | - | - |
| AC-F2-14 | #41 | 부분 | postings, quotes | postings | - |
| AC-F2-15 | #41 | 부분 | quotes | - | - |
| AC-F2-16 | #41 | 부분 | quotes | - | - |
| AC-F2-17 | #41 | 부분 | quote_model, quote_total, quotes | - | - |
| AC-F2-18 | #41 | 부분 | quotes | - | - |
| AC-F2-19 | #41 | 부분 | quotes | - | - |
| AC-F2-20 | #41 | 부분 | quote_model, quotes | - | - |
| AC-F3-01 | #38 | 끝 | assignment, performance_model, postings | - | - |
| AC-F3-02 | #38 | 끝 | assignment, postings | auth-venue, my-performances | - |
| AC-F3-03 | #38 | 끝 | assignment, postings, representative_scenario | postings | - |
| AC-F3-04 | #38 | 끝 | assignment | my-performances | - |
| AC-F3-05 | #38 | 끝 | assignment | - | - |
| AC-F3-06 | #42 | 부분 | assignment, chat | - | - |
| AC-F3-07 | #42 | 부분 | assignment, chat | - | - |
| AC-F3-08 | #42 | 부분 | assignment, chat | - | - |
| AC-F3-09 | #43 | 부분 | assignment | - | - |
| AC-F3-10 | #43 | 부분 | assignment | - | - |
| AC-F3-11 | #43 | 부분 | assignment | - | - |
| AC-F3-12 | #43 | 부분 | assignment | - | - |
| AC-F3-13 | #44 | 부분 | assignment | - | - |
| AC-F3-14 | #43 | 부분 | assignment, representative_scenario | - | - |
| AC-F3-15 | #44 | 부분 | chat, contact_warning | - | - |
| AC-F3-16 | #32 | 없음 | - | - | - |
| AC-F3-17 | #32 | 없음 | - | - | - |
| AC-F3-18 | #32 | 없음 | - | - | - |
| AC-F3-19 | #32 | 없음 | - | - | - |
| AC-F3-20 | #47 | 끝 | check_wiring, checks, compare | compare | - |
| AC-F3-21 | #47 | 끝 | check_wiring, checks, compare | - | - |
| AC-F3-22 | #47 | 끝 | check_wiring, checks, compare | - | - |
| AC-F3-23 | #47 | 끝 | check_wiring, checks, compare | - | - |
| AC-F3-24 | #47 | 끝 | checks, compare | - | - |
| AC-F3-25 | #49 | 끝 | tech_checks | auth-venue | - |
| AC-F3-26 | #42 | 없음 | - | - | - |
| AC-F3-27 | - | 끝 | chat | - | - |
| AC-F4-01 | #30 | 끝 | pr_posts | board | - |
| AC-F4-02 | #30 | 끝 | pr_posts | board | - |
| AC-F4-03 | #31 | 부분 | pr_blind, reports | - | - |
| AC-F4-04 | #30 | 끝 | pr_blind, pr_posts | board | - |
| AC-F4-05 | #39 | 끝 | posting_limit, pr_blind | my-performances | - |
| AC-F4-06 | #39 | 끝 | posting_limit, pr_blind | - | - |
| AC-F4-07 | #39 | 끝 | posting_limit, postings, pr_blind | postings | - |
| AC-F4-08 | - | 끝 | pr_blind, reports, warnings | - | - |
| AC-F4-09 | #30 | 끝 | pr_blind, pr_posts | board | - |
| AC-F4-10 | #31 | 부분 | pr_blind, pr_posts | - | - |
| AC-F4-11 | #31 | 없음 | - | - | - |
| AC-F4-12 | #100 | 끝 | community | community | - |
| AC-F4-13 | #100 | 끝 | community | community | - |
| AC-F4-14 | #101 | 끝 | community_comments | community-comments | - |
| AC-F4-15 | #101 | 끝 | community_comments, reports | community-comments | - |
| AC-F4-16 | #100 | 끝 | community | community | - |
| AC-F4-17 | #101 | 끝 | community_comments | community-comments | - |
| AC-F5-01 | #28 | 끝 | venue_search | auth-venue | - |
| AC-F5-02 | #40 | 끝 | my_performances | my-performances | - |
| AC-F5-03 | #50 | 부분 | invoice_calc | - | - |
| AC-F5-04 | #50 | 없음 | - | - | - |
| AC-F5-05 | #51 | 없음 | - | - | - |
| AC-F5-06 | #51 | 없음 | representative_scenario | - | - |
| AC-F5-07 | #51 | 없음 | - | - | - |
| AC-F5-08 | #52 | 부분 | cancel_calc | - | - |
| AC-F5-09 | #52 | 부분 | cancel_calc | - | - |
| AC-F5-10 | #52 | 부분 | cancel_calc | - | - |
| AC-F5-11 | #53 | 없음 | representative_scenario | - | - |
| AC-F5-12 | #44 | 부분 | postings | postings | - |
| AC-F5-13 | #54 | 끝 | performance_history | - | - |
| AC-F5-14 | #46 | 끝 | demo_reset | - | - |
| AC-F5-15 | #33 | 없음 | - | - | - |
| AC-F5-16 | #33 | 없음 | - | - | - |
| AC-F5-17 | #33 | 부분 | contract_impl | - | - |
| AC-F5-18 | #102 | 없음 | - | - | - |
| AC-F5-19 | #102 | 없음 | - | - | - |
| AC-F5-20 | #102 | 없음 | - | - | - |
| AC-F5-21 | #103 | 끝 | notices | support | - |
| AC-F5-22 | #52 | 없음 | - | - | - |

</details>

다시 세려면: 이 표를 만든 스크립트는 PR 설명에 있어요 (spec.md AC ID ↔ tests/·frontend/tests·e2e 검색).
