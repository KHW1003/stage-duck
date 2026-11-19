/**
 * 공개 화면이 실제 브라우저에서 뜨는지 (웹 1440 · 휴대폰 375 두 폭에서 모두).
 * - 제목(h1)이 보이고, 자바스크립트 오류가 없고, 가로로 밀리지 않는다
 * - 서버가 처음 보내는 HTML 의 head 를 채운다 (SEO, specs/seo.md)
 */
import { expect, test } from "@playwright/test";
import { collectErrors, expectNoHorizontalScroll } from "./helpers";

const PAGES: { path: string; h1: string | RegExp }[] = [
  { path: "/", h1: /공연할 공간부터/ },
  { path: "/partner", h1: /공연이 필요한 곳에/ },
  { path: "/venues", h1: "공간 찾기" },
  { path: "/venues/3", h1: "공간 C" },
  { path: "/board", h1: "업체 찾기" },
  { path: "/community", h1: "커뮤니티" },
  { path: "/login", h1: "로그인" },
  { path: "/signup", h1: "가입하기" },
  { path: "/password/forgot", h1: "비밀번호 찾기" },
  { path: "/notices", h1: "공지사항" },
  { path: "/faq", h1: "자주 묻는 질문" },
  { path: "/guide/supplier", h1: "업체 이용 가이드" },
  { path: "/terms/service", h1: "약관·정책" },
  { path: "/no-such-page", h1: "화면을 찾을 수 없어요" },
];

for (const { path, h1 } of PAGES) {
  test(`${path} — 제목이 보이고 오류·가로 넘침이 없다`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}

test("서버가 head 를 채워 보낸다 — 공개 화면 제목·canonical, 시연 서버는 검색 제외(noindex)", async ({ request }) => {
  const res = await request.get("/community", { headers: { Accept: "text/html" } });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("<title>커뮤니티 · STAGE DUCK</title>");
  expect(html).toMatch(/<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/community">/);
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect((await request.get("/robots.txt")).status()).toBe(200);
});
