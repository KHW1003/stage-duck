import { expect, type Page } from "@playwright/test";

/** 화면에서 난 자바스크립트 오류를 모은다. 로그인 안 한 /me 401 처럼 일부러 받는 응답 실패 로그는 뺀다 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Failed to load resource|status of 40[134]/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** 가로로 밀리는 화면이 없어야 한다 (모바일 375px 에서 특히) */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `가로 넘침: scrollWidth ${scroll} > innerWidth ${inner}`).toBeLessThanOrEqual(inner);
}

export const E2E_USER = { email: "host@stageduck.test", password: "e2e-pass-1234" };

export async function login(page: Page, { email, password } = E2E_USER) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}
