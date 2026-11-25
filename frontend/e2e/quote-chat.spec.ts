/**
 * 3번 묶음 흐름: 견적서 → 채팅 → 최종 견적·확정 (웹 1440 · 휴대폰 375 두 폭).
 * - 사용자(광주밴드)는 화면에서 로그인, 업체는 /dev/switch-account 로 로그인한다 (시드 업체는 비밀번호가 없다)
 * - 사용자·업체는 브라우저를 따로 띄워 쿠키가 섞이지 않게 한다
 * - 요청서 작성·게시(2번 묶음)는 화면 대신 API 로 준비한다. 두 폭이 같은 서버를 쓰므로 제목에 폭 이름을 붙인다
 */
import { randomUUID } from "node:crypto";
import { type Browser, type Locator, type Page, type TestInfo, expect, test } from "@playwright/test";
import { SUPPLIER_USER_ID, collectErrors, expectNoHorizontalScroll, login, switchAccount } from "./helpers";

const VENUE_ID = { b: 2, c: 3 } as const; // 시드 공간 A·B·C = 1·2·3

/** 로그인한 page 의 쿠키로 API 를 부른다 (CSRF·Idempotency-Key 를 붙여서) */
async function call<T>(page: Page, method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrf_token")?.value ?? "";
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: method === "GET" ? {} : { "X-CSRF-Token": csrf, "Idempotency-Key": randomUUID() },
  });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** 지금 폭(프로젝트) 설정 그대로 브라우저를 하나 더 띄운다 */
async function newPage(browser: Browser, info: TestInfo): Promise<Page> {
  const u = info.project.use;
  const ctx = await browser.newContext({
    baseURL: u.baseURL,
    viewport: u.viewport,
    userAgent: u.userAgent,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    locale: u.locale,
  });
  return ctx.newPage();
}

function showDate(): string {
  const d = new Date(Date.now() + 20 * 24 * 3600 * 1000); // 14일 전까지만 요청 가능 (D-53)
  return d.toISOString().slice(0, 10);
}

/** 사용자 API 로 요청서를 만들고 게시한다 (tests/scenario 와 같은 값). 공연장 단계 공고가 열린다 */
async function publishPerformance(user: Page, title: string): Promise<number> {
  const perf = await call<{ id: number }>(user, "POST", "/performances", {
    title,
    form: "BAND",
    lineup: [{ part: "보컬", count: 1 }, { part: "기타", count: 2 }, { part: "베이스", count: 1 }, { part: "드럼", count: 1 }],
    showDate: showDate(),
    rehearsalStart: "17:00",
    showStart: "19:00",
    showEnd: "21:00",
    audience: 80,
    sido: "광주광역시",
    sigungu: "동구",
    contactPhone: null,
    needs: {
      venue: { needed: true, types: ["CULTURE_SPACE"], capacity: 80, mustHave: ["BAND_ALLOWED"] },
      equipment: { needed: true, proposalWanted: true, items: [{ name: "보컬 마이크", qty: 4 }], services: ["TRANSPORT", "INSTALL"], owned: [] },
      engineer: { needed: true, tasks: ["FOH", "INSTALL_ASSIST"], conditions: ["BAND_EXPERIENCE"] },
    },
  });
  await call(user, "POST", `/performances/${perf.id}/publish`);
  return perf.id;
}

interface QuoteSent {
  quoteId: number;
  chatRoomId: number;
}

/** 공연장 업체 API 로 견적서를 보낸다 (대관료 500,000원, 입실·설치 가능 15:00) */
async function sendVenueQuote(supplier: Page, perfId: number, venueId: number): Promise<QuoteSent> {
  const postings = await call<{ performanceId: number; stageId: number }[]>(supplier, "GET", "/postings");
  const posting = postings.find((p) => p.performanceId === perfId);
  expect(posting, "업체 공고 목록에 공고가 없다").toBeTruthy();
  return call<QuoteSent>(supplier, "POST", `/stages/${posting!.stageId}/quotes`, {
    label: "기본형",
    venueId,
    checkinTime: "15:00",
    setupAvailableTime: "15:00",
    items: [{ name: "대관료", category: "대관", qty: 1, unitPrice: 500000, amount: 500000 }],
    staff: [],
    setupStart: null,
    setupMinutes: null,
    teardownMinutes: null,
    includes: { equipment: false, engineer: false, install: false, transport: false },
    amounts: { items: 500000, transport: 0, install: 0, labor: 0, etc: 0 },
    discountAmount: 0,
    totalAmount: 500000,
    extraCostNote: null,
    techNote: null,
  });
}

/** 떠 있는 채팅 창 (role=dialog "채팅") */
const panel = (page: Page) => page.getByRole("dialog", { name: "채팅" });
const roomItem = (page: Page, roomId: number) => panel(page).locator(`li[data-room="${roomId}"]`);

async function sendChat(page: Page, text: string) {
  await panel(page).getByRole("textbox", { name: "메시지" }).fill(text);
  await panel(page).getByRole("button", { name: "보내기", exact: true }).click();
}

const lastCard = (page: Page, kind: "최종 견적" | "확정 완료"): Locator =>
  panel(page).locator(".c-card").filter({ has: page.locator(".c-card__head > span:first-child", { hasText: new RegExp(`^${kind}$`) }) }).last();

/** 고르기 칸은 화면이 굴러가면 닫힌다 → 먼저 가운데로 굴려 두고, 굴림이 끝난 다음 누른다 */
async function choose(page: Page, name: string, option: string | RegExp) {
  const combo = page.getByRole("combobox", { name });
  await combo.evaluate((e) => {
    e.scrollIntoView({ block: "center", behavior: "instant" });
    return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
  await combo.click();
  await page.getByRole("option", { name: option }).click();
}
test("견적서: 공고 목록 → 상세 → 견적서 보내기 → 자동 검사 결과 → [견적서 고치기]로 v2 (AC-F2-15·16·20)", async ({ page, browser }, info) => {
  const title = `견적서 흐름 (${info.project.name})`;
  const userErrors = collectErrors(page);
  await login(page);
  await expect(page).toHaveURL(/\/me\/performances$/);
  await publishPerformance(page, title);

  const sup = await newPage(browser, info);
  const errors = collectErrors(sup);
  await switchAccount(sup, SUPPLIER_USER_ID.c);

  await sup.goto("/supplier/postings");
  const row = sup.locator("tr", { hasText: title });
  await expect(row).toBeVisible();
  await expectNoHorizontalScroll(sup);
  await row.getByRole("link", { name: "상세" }).click();
  await expect(sup).toHaveURL(/\/supplier\/postings\/\d+$/);
  await expectNoHorizontalScroll(sup);
  await sup.getByRole("link", { name: "견적서 쓰기" }).click();

  await expect(sup.getByRole("heading", { level: 1, name: "견적서 쓰기" })).toBeVisible(); // 11/25 제목에서 공연명을 뺐다 (#321)
  await expect(sup.getByRole("heading", { name: title })).toBeVisible();
  await sup.getByRole("textbox", { name: "견적서 이름" }).fill("기본형");
  await choose(sup, "공간", /공간 C/);
  await choose(sup, "입실 시각", "15:00");
  await choose(sup, "설치 가능 시각", "15:00");
  await sup.getByRole("textbox", { name: "대관료" }).fill("500000");
  await expect(sup.getByTestId("quote-total")).toHaveText("500,000원"); // 화면 합계 (서버가 다시 확인)
  await expectNoHorizontalScroll(sup);
  await sup.getByRole("button", { name: "견적서 보내기" }).click();

  await expect(sup.getByRole("heading", { level: 1, name: "견적서를 보냈어요" })).toBeVisible();
  await expect(sup.getByText("v1", { exact: true })).toBeVisible();
  await expect(sup.getByRole("heading", { name: "자동 검사 결과" })).toBeVisible();
  await expectNoHorizontalScroll(sup);

  // AC-F2-20: 고치면 v2, v1 기록이 남는다
  await sup.getByRole("link", { name: "견적서 고치기" }).click();
  await expect(sup.getByRole("heading", { level: 1, name: "견적서 고치기 · 기본형" })).toBeVisible();
  const fee = sup.getByRole("textbox", { name: "대관료" });
  await expect(fee).toHaveValue("500,000");
  await fee.click(); // 포커스되면 쉼표 없는 값으로 바뀐다. 먼저 눌러 둬야 fill 이 전체를 바꾼다
  await fee.fill("450000");
  await expect(sup.getByTestId("quote-total")).toHaveText("450,000원");
  await sup.getByRole("button", { name: "고친 견적서 보내기" }).click();
  await expect(sup.getByRole("heading", { level: 1, name: "v2로 고쳤어요" })).toBeVisible();
  await expectNoHorizontalScroll(sup);

  expect(errors).toEqual([]);
  expect(userErrors).toEqual([]);
  await sup.context().close();
});

test("채팅: [채팅 시작] → 새로고침 없이 오가는 메시지·읽음, 전화번호 경고, 오른쪽 클릭으로 상단 고정 (AC-F3-06·08·15·27)", async ({ page, browser, isMobile }, info) => {
  const title = `채팅 흐름 (${info.project.name})`;
  const userErrors = collectErrors(page);
  await login(page);
  await expect(page).toHaveURL(/\/me\/performances$/);
  const perfId = await publishPerformance(page, title);

  const sup = await newPage(browser, info);
  const supErrors = collectErrors(sup);
  await switchAccount(sup, SUPPLIER_USER_ID.c);
  const { chatRoomId } = await sendVenueQuote(sup, perfId, VENUE_ID.c);

  // AC-F3-06: 사용자가 시작하기 전에는 업체 입력창이 막혀 있다
  await sup.goto(`/supplier/postings?chat=${chatRoomId}`);
  await expect(panel(sup).getByText("사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.")).toBeVisible();
  await expect(panel(sup).getByRole("textbox", { name: "메시지" })).toHaveCount(0);

  // 사용자: 둥근 버튼(휴대폰은 아래 탭) → 목록 → 방 → [채팅 시작]
  await (isMobile ? page.getByRole("navigation", { name: "아래 메뉴" }).getByRole("button", { name: /채팅/ }) : page.getByRole("button", { name: /^채팅 열기/ })).click();
  await roomItem(page, chatRoomId).getByRole("button").click();
  await expect(panel(page).getByText("견적서를 보냈어요", { exact: false })).toBeVisible(); // 견적서 카드
  await panel(page).getByRole("button", { name: "채팅 시작" }).click();
  await expect(panel(page).getByText("대화 중")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 업체 화면: 열어 둔 방에 새로고침 없이 입력창이 열린다 (채팅 시작 알림 → 채팅방 목록 다시 받음)
  await expect(panel(sup).getByRole("textbox", { name: "메시지" })).toBeVisible();

  // AC-F3-08: 사용자 → 업체 (새로고침 없이), 업체가 열어 두고 있으니 사용자 말풍선에 "읽음"
  const hello = `리허설 몇 시부터 들어갈 수 있나요? (${info.project.name})`;
  await sendChat(page, hello);
  await expect(panel(sup).getByText(hello)).toBeVisible();
  await expect(panel(page).locator(".msg--me", { hasText: hello }).locator(".msg__read")).toHaveText("읽음");

  // 업체 → 사용자
  const reply = "15시부터 입실하실 수 있어요.";
  await sendChat(sup, reply);
  await expect(panel(page).getByText(reply)).toBeVisible();
  await expect(panel(sup).locator(".msg--me", { hasText: reply }).locator(".msg__read")).toHaveText("읽음");

  // AC-F3-15: 전화번호 모양이면 보내지되 경고가 양쪽에 보인다
  const phone = "급하면 010-0000-0000 으로 연락 주세요";
  await sendChat(page, phone);
  await expect(panel(page).getByRole("note").filter({ hasText: "연락처는 결제 후 최종 담당표에서 공개돼요" }).last()).toBeVisible();
  await expect(panel(sup).getByText(phone)).toBeVisible();
  await expect(panel(sup).getByRole("note").filter({ hasText: "연락처는 결제 후 최종 담당표에서 공개돼요" }).last()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScroll(sup);

  // AC-F3-27: 목록에서 오른쪽 클릭 → [상단에 고정] → 핀 배지, 고정 묶음이 위
  await panel(page).getByRole("button", { name: "목록으로" }).click();
  await roomItem(page, chatRoomId).getByRole("button").click({ button: "right" });
  await page.getByRole("menuitem", { name: "상단에 고정" }).click();
  await expect(roomItem(page, chatRoomId).getByRole("img", { name: "고정됨" })).toBeVisible();
  const pinnedFlags = await panel(page)
    .locator("ul[aria-label='채팅 목록'] > li")
    .evaluateAll((lis) => lis.map((li) => li.querySelector(".chat-item__pin") !== null));
  expect(pinnedFlags.indexOf(false) === -1 || pinnedFlags.lastIndexOf(true) < pinnedFlags.indexOf(false), "고정한 방이 위에 모여 있어야 한다").toBe(true);
  // 고정은 고정한 사람에게만 — 업체 목록에는 핀이 없다
  await panel(sup).getByRole("button", { name: "목록으로" }).click();
  await expect(roomItem(sup, chatRoomId).getByRole("img", { name: "고정됨" })).toHaveCount(0);
  // 다음 실행을 위해 고정을 푼다
  await roomItem(page, chatRoomId).getByRole("button").click({ button: "right" });
  await page.getByRole("menuitem", { name: "고정 해제" }).click();
  await expect(roomItem(page, chatRoomId).getByRole("img", { name: "고정됨" })).toHaveCount(0);

  expect(userErrors).toEqual([]);
  expect(supErrors).toEqual([]);
  await sup.context().close();
});

test("확정: 최종 견적 보내기 → 내역서를 열기 전엔 [확정하기] 꺼짐 → 열고 확정 → 확정 완료 카드, 같은 단계 다른 업체에 안내 (AC-F3-10·13)", async ({ page, browser }, info) => {
  const title = `확정 흐름 (${info.project.name})`;
  const userErrors = collectErrors(page);
  await login(page);
  await expect(page).toHaveURL(/\/me\/performances$/);
  const perfId = await publishPerformance(page, title);

  const sup = await newPage(browser, info);
  const supErrors = collectErrors(sup);
  await switchAccount(sup, SUPPLIER_USER_ID.c);
  const c = await sendVenueQuote(sup, perfId, VENUE_ID.c);

  // AC-F3-13 용: 같은 공연장 단계에 업체 B 도 견적서를 보낸다
  const other = await newPage(browser, info);
  const otherErrors = collectErrors(other);
  await switchAccount(other, SUPPLIER_USER_ID.b);
  const b = await sendVenueQuote(other, perfId, VENUE_ID.b);

  await call(page, "POST", `/chat-rooms/${c.chatRoomId}/start`);
  await page.goto(`/me/performances?chat=${c.chatRoomId}`);
  await expect(panel(page).getByText("대화 중")).toBeVisible();

  // 업체: 견적서 문서 화면에서 [최종 견적 보내기]
  await sup.goto(`/quotes/${c.quoteId}`);
  await sup.getByRole("button", { name: "최종 견적 보내기" }).click();
  await expect(sup.getByText("최종 견적을 보냈어요. 사용자가 확정하면 알려 드려요.")).toBeVisible();
  await expectNoHorizontalScroll(sup);

  // 사용자: 열어 둔 방에 새로고침 없이 최종 견적 카드. AC-F3-10 내역서를 열기 전엔 [확정하기] 꺼짐
  const card = lastCard(page, "최종 견적");
  await expect(card).toBeVisible();
  await expect(card.getByText("내역서를 먼저 열어 확인해 주세요.")).toBeVisible();
  await expect(card.getByRole("button", { name: "확정하기" })).toBeDisabled();
  await expectNoHorizontalScroll(page);

  // 내역서 열기 → 열람 기록 → 문서 화면의 [확정하기]가 켜진다
  await card.getByRole("link", { name: "내역서 보기" }).click();
  await expect(page).toHaveURL(/\/quotes\/by-version\/\d+\?confirm=\d+$/);
  const box = page.getByRole("group", { name: "최종 견적 확정" });
  await expect(box.getByRole("button", { name: "확정하기" })).toBeEnabled();
  await expectNoHorizontalScroll(page);

  // 채팅 카드로 돌아와 확정 → 확정 완료 카드 (업체 화면에도 새로고침 없이)
  await sup.goto(`/supplier/postings?chat=${c.chatRoomId}`);
  await page.goto(`/me/performances?chat=${c.chatRoomId}`);
  const card2 = lastCard(page, "최종 견적");
  await expect(card2.getByRole("button", { name: "확정하기" })).toBeEnabled();
  await card2.getByRole("button", { name: "확정하기" }).click();
  const done = lastCard(page, "확정 완료");
  await expect(done).toBeVisible();
  await expect(done.getByText("공연장 단계를 이 업체로 확정했어요")).toBeVisible();
  await expect(done.getByRole("link", { name: /다음 단계로/ })).toBeVisible();
  await expect(lastCard(sup, "확정 완료").getByText("공연장 단계를 우리 업체로 확정했어요")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScroll(sup);

  // AC-F3-13: 같은 단계 업체 B 의 방에 "다른 업체와 진행하기로 했어요"
  await other.goto(`/supplier/postings?chat=${b.chatRoomId}`);
  await expect(panel(other).getByText("사용자가 다른 업체와 진행하기로 하여", { exact: false })).toBeVisible();
  await expectNoHorizontalScroll(other);

  expect(userErrors).toEqual([]);
  expect(supErrors).toEqual([]);
  expect(otherErrors).toEqual([]);
  await sup.context().close();
  await other.context().close();
});
