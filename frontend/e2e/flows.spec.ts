/**
 * 사용자가 실제로 누르는 흐름 (시연 데이터: 사용자 광주밴드, 공간 A·B·C).
 */
import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHorizontalScroll, login } from "./helpers";

test("로그인하면 내 공연으로 가고, 로그아웃하면 로그인 화면으로 돌아온다", async ({ page, isMobile }) => {
  const errors = collectErrors(page);
  await login(page);
  await expect(page).toHaveURL(/\/me\/performances$/);
  await expect(page.getByRole("heading", { level: 1, name: "내 공연" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  if (isMobile) {
    await page.getByRole("navigation", { name: "아래 메뉴" }).getByRole("button", { name: "마이" }).click();
    await page.getByRole("dialog", { name: "마이" }).getByRole("button", { name: "로그아웃" }).click();
  } else {
    await page.getByRole("button", { name: /광주밴드/ }).click();
    await page.getByRole("menuitem", { name: "로그아웃" }).click();
  }
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test("로그인이 필요한 화면은 로그인 뒤 그 화면으로 돌아온다", async ({ page }) => {
  await page.goto("/performances/new");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("이메일", { exact: true }).fill("host@stageduck.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("e2e-pass-1234");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/performances\/new$/);
});

test("비밀번호가 틀리면 서버 문구가 보인다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("host@stageduck.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-pass-1");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("공간 찾기: 처음엔 지역 전체로 모든 공간, 광주로 와도 같고, 없으면 초기화로 돌아오고, 카드를 누르면 상세로 간다", async ({ page }) => {
  await page.goto("/venues");
  const cards = page.locator("a.item-card");
  await expect(cards).toHaveCount(3); // 처음 지역은 전체 (11/25) — 시연 공간 3곳 모두
  await page.goto("/venues?sido=광주"); // 메인에서 지역을 골라 온 것과 같다
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("공간 B"); // 대관료 낮은 순 B → C → A

  await page.getByLabel("관객 수").fill("300");
  await page.getByRole("button", { name: "공간 찾기" }).click();
  await expect(page.getByText("조건에 맞는 공간이 없어요")).toBeVisible();
  await page.getByLabel("관객 수").fill("");
  await page.getByRole("button", { name: "공간 찾기" }).click();
  await expect(cards).toHaveCount(3);

  await cards.filter({ hasText: "공간 A" }).click();
  await expect(page).toHaveURL(/\/venues\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "공간 A" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("메인 머리 메뉴로 커뮤니티에 간다 (휴대폰은 아래 탭으로)", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: isMobile ? "아래 메뉴" : "주 메뉴" }).getByRole("link", { name: "커뮤니티" }).click();
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.getByRole("heading", { level: 1, name: "커뮤니티" })).toBeVisible();
});

test("1:1 문의: 쓰면 답변 대기로 보이고, 목록에 모인다 (AC-F5-18)", async ({ page }, info) => {
  const errors = collectErrors(page);
  const title = `닉네임을 바꾸고 싶어요 (${info.project.name})`; // 두 폭이 같은 서버를 써서 제목을 나눈다
  await login(page);
  await expect(page).toHaveURL(/\/me\/performances$/);
  await page.goto("/inquiries/new");
  await page.locator(".iq-chips label", { hasText: "계정" }).click();
  await page.getByRole("textbox", { name: "제목" }).fill(title);
  await page.getByRole("textbox", { name: "내용" }).fill("닉네임은 어디서 바꾸나요?");
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("운영자가 문의를 확인하고 있어요")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "목록" }).click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  expect(errors).toEqual([]);
});
