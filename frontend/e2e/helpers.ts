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
  // 휴대폰 흉내에서는 innerWidth 도 내용만큼 늘어나 넘침을 놓친다 → 정해 둔 화면 폭과 비교
  const width = page.viewportSize()!.width;
  const { scroll, over } = await page.evaluate((w) => ({
    scroll: document.documentElement.scrollWidth,
    over: [...document.querySelectorAll("body *")]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > w + 0.5)
      .slice(0, 12)
      .map(({ e, r }) => `${e.tagName}.${e.getAttribute("class") ?? ""} ${Math.round(r.left)}~${Math.round(r.right)}`),
  }), width);
  expect(scroll, `가로 넘침: scrollWidth ${scroll} > 화면 폭 ${width} · ${over.join(" | ")}`).toBeLessThanOrEqual(width);
}

export const E2E_USER = { email: "host@stageduck.test", password: "e2e-pass-1234" };

/** 시드 순서: 사용자(1) → 업체 A~G(2~8) (backend/app/demo/service.py _seed). 시드 순서가 바뀌면 같이 고친다 */
export const SUPPLIER_USER_ID = { a: 2, b: 3, c: 4, d: 5 } as const;

/** 비밀번호 없는 시연 업체 계정으로 로그인 (/dev/switch-account, APP_ENV=test 에서만 켜진다). 쿠키는 그 page 의 브라우저에 남는다 */
export async function switchAccount(page: Page, userId: number) {
  const res = await page.request.post("/api/v1/dev/switch-account", { data: { userId } });
  expect(res.ok(), `계정 전환 실패: ${res.status()}`).toBeTruthy();
  expect((await res.json()).role).toBe("SUPPLIER");
}

export async function login(page: Page, { email, password } = E2E_USER) {
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}
