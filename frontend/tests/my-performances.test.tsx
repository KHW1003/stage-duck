import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, MyPerformances, PerformanceDetail, PerformanceSummary } from "../src/shared/api/types";
import { pickOption } from "./pickOption";

/** 내 공연 목록·상세·다음 단계·요청서 수정 (#40, #38 화면) — AC-F5-02, AC-F3-02, AC-F3-04 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밴드", supplierReviewStatus: null, landing: "/me/performances",
};

const SUMMARY: PerformanceSummary = {
  id: 5, title: "가을밤 밴드 공연", form: "BAND", status: "ASSIGNING", showDate: "2026-11-28",
  rehearsalStart: "17:00:00", showStart: "19:00:00", showEnd: "21:00:00", audience: 80,
  sido: "광주광역시", sigungu: "동구", currentVersion: 1,
  stages: [
    { id: 1, stageType: "VENUE", seq: 1, status: "CONFIRMED", quoteCount: 3 },
    { id: 2, stageType: "EQUIPMENT", seq: 2, status: "NEGOTIATING", quoteCount: 2 },
    { id: 3, stageType: "ENGINEER", seq: 3, status: "WAITING", quoteCount: null },
  ],
  nextAction: "NEGOTIATE", nextStageId: 2,
};

function detail(over: Partial<PerformanceDetail> = {}): PerformanceDetail {
  return {
    ...SUMMARY,
    lineup: [{ part: "보컬", count: 1 }],
    needs: {
      venue: { needed: true, proposalWanted: false, types: ["CULTURE_SPACE"], capacity: 80, budget: null, checkinWish: null, checkoutWish: null, mustHave: [], note: "" },
      equipment: { needed: true, proposalWanted: true, items: [], services: [], budget: null, owned: [], note: "" },
      engineer: { needed: true, tasks: ["FOH"], conditions: [], etc: "", note: "" },
      ownedVenue: null,
    },
    hasContactPhone: true,
    publishedAt: "2026-11-12T10:00:00",
    ...over,
  };
}

const OPEN_NEXT = detail({
  stages: [
    { id: 1, stageType: "VENUE", seq: 1, status: "CONFIRMED", quoteCount: 3 },
    { id: 2, stageType: "EQUIPMENT", seq: 2, status: "WAITING", quoteCount: null },
    { id: 3, stageType: "ENGINEER", seq: 3, status: "WAITING", quoteCount: null },
  ],
  nextAction: "OPEN_NEXT", nextStageId: 1,
});

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown; headers: Headers };

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
      const r = routes[`${method} ${url}`] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ME = { "GET /api/v1/me": { status: 200, body: USER } };
const ACK = { acknowledgement: "STAGE_SKIP_OWNED", noticeVersion: "1" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("내 공연 목록 (/me/performances)", () => {
  it("AC-F5-02 단계와 다음 할 일이 한눈에 보인다", async () => {
    const list: MyPerformances = { active: [SUMMARY], draft: [], past: [] };
    mockServer({ ...ME, "GET /api/v1/performances?mine=true": { status: 200, body: list } });
    renderAt("/me/performances");

    const item = await screen.findByRole("article", { name: "가을밤 밴드 공연" });
    const track = within(item).getByRole("list", { name: "섭외 진행" });
    // 목업 v4 .rq-steps: 단계 이름(small) + 상태(b)
    expect(within(track).getAllByRole("listitem").map((li) => [li.querySelector("small")!.textContent, li.querySelector("b")!.textContent])).toEqual([
      ["공연장", "확정"],
      ["장비", "조율 중 · 견적 2건"],
      ["엔지니어", "대기"],
    ]);
    expect(within(track).getAllByRole("listitem").map((li) => li.className)).toEqual(["is-done", "is-now", ""]);
    expect(within(item).getByText(/장비 업체와 채팅으로 조율하고 있어요/)).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "공연 보기" })).toHaveAttribute("href", "/performances/5");
  });

  it("공연이 없으면 빈 화면 문구와 [요청서 쓰기]가 보인다", async () => {
    mockServer({ ...ME, "GET /api/v1/performances?mine=true": { status: 200, body: { active: [], draft: [], past: [] } } });
    renderAt("/me/performances");

    expect(await screen.findByText("아직 준비 중인 공연이 없어요")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "요청서 쓰기" }).some((a) => a.getAttribute("href") === "/performances/new")).toBe(true);
  });
});

describe("내 공연 상세 (/performances/:id)", () => {
  it("#187 섭외가 끝나면(PAY) 내 공연·공연 상세 모두 [청구서 보기]로 통합 청구서에 간다", async () => {
    const pay = { stages: SUMMARY.stages.map((st) => ({ ...st, status: st.stageType === "ENGINEER" ? ("SKIPPED" as const) : ("CONFIRMED" as const) })), nextAction: "PAY" as const, nextStageId: null };
    mockServer({
      ...ME,
      "GET /api/v1/performances?mine=true": { status: 200, body: { active: [{ ...SUMMARY, ...pay }], draft: [], past: [] } },
      "GET /api/v1/performances/5": { status: 200, body: detail(pay) },
    });
    const a = renderAt("/me/performances");
    const item = await screen.findByRole("article", { name: "가을밤 밴드 공연" });
    expect(within(item).getByRole("link", { name: "청구서 보기" })).toHaveAttribute("href", "/performances/5/order");
    a.unmount();
    renderAt("/performances/5");
    expect(await screen.findByRole("link", { name: "청구서 보기" })).toHaveAttribute("href", "/performances/5/order");
  });

  it("목업 v4: 진행 중 단계만 처음에 열려 있고, 머리줄을 누르면 접고 펼친다. 확정 단계는 확정한 견적서를, 아래에 요청서 표를 보인다", async () => {
    const user = userEvent.setup();
    mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: detail({ nextAction: "NEGOTIATE", nextStageId: 2 }) },
      "GET /api/v1/stages/1/quotes": {
        status: 200,
        body: [{ quoteId: 9, supplierId: 30, label: "기본형", status: "CONFIRMED", version: 1, basedOnPerfVersion: 1, totalAmount: 500000, venueId: 3, venueType: "CULTURE_SPACE", venueName: "공간 C", maxCapacity: 120, checkinTime: null, setupAvailableTime: null, checkoutTime: null, includesEquipment: false, includesEngineer: false, isFullSpec: false, offered: false, overall: "PASS", checks: [] }],
      },
    });
    renderAt("/performances/5");

    const toggles = await screen.findAllByRole("button", { name: /^STEP 0/ });
    expect(toggles.map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "true", "false"]);
    expect(screen.getByRole("link", { name: "단계별 비교" })).toHaveAttribute("href", "/performances/5/compare");

    await user.click(toggles[0]);
    expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("공간 C")).toBeInTheDocument();
    expect(screen.getByText("500,000원")).toBeInTheDocument();
    await user.click(toggles[1]);
    expect(toggles[1]).toHaveAttribute("aria-expanded", "false");

    const info = screen.getByRole("table");
    expect(within(info).getByText("밴드 · 보컬 1")).toBeInTheDocument();
    expect(within(info).getByText(/공연장 \(복합문화공간\) · 장비 \(업체 제안 받기\) · 엔지니어 \(메인 음향\)/)).toBeInTheDocument();
  });

  it("11/24 진행 중 단계에 받은 견적서 카드를 2장씩 보이고, 더 있으면 < > 로 넘긴다 (견적함 대신)", async () => {
    const user = userEvent.setup();
    const q = (id: number, name: string, amount: number, extra: object = {}) => ({
      quoteId: id, supplierId: id, companyName: name, roomId: 30 + id, chatStarted: false, label: "기본형", status: "SENT", version: 1,
      basedOnPerfVersion: 1, totalAmount: amount, venueId: null, venueType: null, venueName: null, maxCapacity: null, checkinTime: null,
      setupAvailableTime: null, checkoutTime: null, includesEquipment: false, includesEngineer: true, isFullSpec: false, offered: false,
      overall: "PASS", checks: [{ id: "CHK-05", result: "PASS", message: "설치 15:45에 끝나요" }], ...extra,
    });
    mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: detail({ nextAction: "NEGOTIATE", nextStageId: 2, stages: [
        { id: 1, stageType: "VENUE", seq: 1, status: "CONFIRMED", quoteCount: 0 },
        { id: 2, stageType: "EQUIPMENT", seq: 2, status: "NEGOTIATING", quoteCount: 3 },
        { id: 3, stageType: "ENGINEER", seq: 3, status: "WAITING", quoteCount: null },
      ] }) },
      "GET /api/v1/stages/1/quotes": { status: 200, body: [] },
      "GET /api/v1/stages/2/quotes": { status: 200, body: [
        q(1, "업체 D", 1350000, { chatStarted: true, version: 2 }),
        q(2, "업체 E", 980000, { includesEngineer: false, overall: "NEEDS_INFO", checks: [{ id: "CHK-11", result: "NEEDS_INFO", message: "무선 마이크 수량을 물어보세요" }] }),
        q(3, "업체 F", 1100000),
      ] },
    });
    // 카드 줄이 화면보다 넓다고 흉내 (jsdom 은 배치를 계산하지 않는다)
    const sizes = [
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
      Object.getOwnPropertyDescriptor(Element.prototype, "scrollWidth"),
    ];
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 600 });
    Object.defineProperty(Element.prototype, "scrollWidth", { configurable: true, get: () => 900 });
    const scrollBy = vi.fn();
    Element.prototype.scrollBy = scrollBy;
    try {
      renderAt("/performances/5");
      const list = await screen.findByRole("list", { name: "장비 받은 견적서" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
      const d = within(list).getByRole("article", { name: "업체 D 견적서" });
      expect(within(d).getByText("채팅 중")).toBeInTheDocument();
      expect(within(d).getByRole("link", { name: "채팅 열기" })).toHaveAttribute("href", "/performances/5?chat=31");
      expect(within(d).getByText("+370,000원")).toBeInTheDocument();
      const e = within(list).getByRole("article", { name: "업체 E 견적서" });
      expect(within(e).getByText("채팅 전")).toBeInTheDocument();
      expect(within(e).getByText("엔지니어 없음")).toBeInTheDocument();
      expect(within(e).getByText("받은 견적서 중 가장 낮아요")).toBeInTheDocument();
      expect(within(e).getByText("무선 마이크 수량을 물어보세요")).toBeInTheDocument();
      expect(within(e).getByRole("link", { name: "견적서" })).toHaveAttribute("href", "/quotes/2");

      expect(screen.getByRole("button", { name: "이전 견적서" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "다음 견적서" }));
      expect(scrollBy).toHaveBeenCalledWith({ left: 600, behavior: "smooth" });
    } finally {
      if (sizes[0]) Object.defineProperty(HTMLElement.prototype, "clientWidth", sizes[0]);
      if (sizes[1]) Object.defineProperty(Element.prototype, "scrollWidth", sizes[1]);
    }
  });

  it("AC-F3-02 [장비 업체 모집 시작]은 Idempotency-Key 와 함께 다음 단계를 연다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: OPEN_NEXT },
      "POST /api/v1/stages/1/advance": {
        status: 200,
        body: { stageId: 1, stageType: "VENUE", status: "CONFIRMED", performanceStatus: "ASSIGNING", next: { stageId: 2, stageType: "EQUIPMENT", status: "OPEN" } },
      },
    });
    renderAt("/performances/5");

    await user.click(await screen.findByRole("button", { name: "장비 업체 모집 시작" }));

    await waitFor(() => expect(calls.some((c) => c.url === "/api/v1/stages/1/advance")).toBe(true));
    const call = calls.find((c) => c.url === "/api/v1/stages/1/advance")!;
    expect(call.body).toEqual({ action: "OPEN_NEXT" });
    expect(call.headers.get("Idempotency-Key")).toBeTruthy();
  });

  it("건너뛰기는 책임 고지에 동의해야 보내진다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: OPEN_NEXT },
      "POST /api/v1/stages/1/advance": {
        status: 200,
        body: { stageId: 1, stageType: "VENUE", status: "CONFIRMED", performanceStatus: "ASSIGNING", next: { stageId: 2, stageType: "EQUIPMENT", status: "SKIPPED" } },
      },
    });
    renderAt("/performances/5");

    await user.click(await screen.findByRole("button", { name: /장비는 이미 있어요/ }));
    const dialog = await screen.findByRole("dialog", { name: "장비 단계를 건너뛸까요?" });
    await user.click(within(dialog).getByRole("button", { name: "건너뛰기" }));

    await waitFor(() => expect(calls.some((c) => c.url === "/api/v1/stages/1/advance")).toBe(true));
    expect(calls.find((c) => c.url === "/api/v1/stages/1/advance")!.body).toEqual({ action: "SKIP_NEXT", ...ACK });
  });

  it("AC-F3-04 [전부 구했어요]는 재확인 창에서 확인해야 남은 단계를 건너뛴다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: OPEN_NEXT },
      "POST /api/v1/performances/5/declare-all-secured": { status: 200, body: { id: 5, status: "AWAITING_PAYMENT", stages: [] } },
    });
    renderAt("/performances/5");

    await user.click(await screen.findByRole("button", { name: "전부 구했어요" }));
    let dialog = await screen.findByRole("dialog", { name: "남은 단계를 모두 건너뛸까요?" });
    expect(within(dialog).getByText(/직접 준비해야 해요/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "전부 구했어요" }));
    dialog = await screen.findByRole("dialog", { name: "남은 단계를 모두 건너뛸까요?" });
    await user.click(within(dialog).getByRole("button", { name: "모두 건너뛰기" }));

    await waitFor(() => expect(calls.some((c) => c.url === "/api/v1/performances/5/declare-all-secured")).toBe(true));
    expect(calls.find((c) => c.url === "/api/v1/performances/5/declare-all-secured")!.body).toEqual(ACK);
  });

  it("[공고 내리기]는 확인 창을 거쳐 보낸다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: detail() },
      "POST /api/v1/performances/5/withdraw": { status: 200, body: { id: 5, status: "WITHDRAWN", currentVersion: 1 } },
    });
    renderAt("/performances/5");

    await user.click(await screen.findByRole("button", { name: "공고 내리기" }));
    await user.click(within(await screen.findByRole("dialog", { name: "공고를 내릴까요?" })).getByRole("button", { name: "내리기" }));

    await waitFor(() => expect(calls.some((c) => c.url === "/api/v1/performances/5/withdraw")).toBe(true));
  });

  it("서버 오류 문구를 그대로 보여 준다", async () => {
    const user = userEvent.setup();
    mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: OPEN_NEXT },
      "POST /api/v1/stages/1/advance": { status: 409, body: { code: "INVALID_STATE", message: "이 단계를 먼저 확정해 주세요.", fieldErrors: [] } },
    });
    renderAt("/performances/5");

    await user.click(await screen.findByRole("button", { name: "장비 업체 모집 시작" }));

    expect(await screen.findByText("이 단계를 먼저 확정해 주세요.")).toBeInTheDocument();
  });
});

describe("요청서 수정 (/performances/:id/edit)", () => {
  it("현재 값이 채워지고, 게시 뒤에는 필요해요/이미 있어요를 바꿀 수 없고, 전화번호는 안 바꾸면 보내지 않는다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/performances/5": { status: 200, body: detail() },
      "PUT /api/v1/performances/5": { status: 200, body: { id: 5, status: "ASSIGNING", currentVersion: 2 } },
    });
    renderAt("/performances/5/edit");

    expect(await screen.findByLabelText(/^공연명/)).toHaveValue("가을밤 밴드 공연");
    expect(screen.getByLabelText(/^리허설 시작/)).toHaveTextContent("17:00");
    await pickOption(screen.getByRole("combobox", { name: "리허설 시작" }), "16:00");
    await user.click(screen.getByRole("button", { name: "다음 단계" }));
    await screen.findByRole("heading", { name: /필요한 것/ });
    for (const radio of screen.getAllByRole("radio", { name: /필요해요|이미 있어요/ })) expect(radio).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "수정 저장" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const sent = calls.find((c) => c.method === "PUT")!.body as Record<string, unknown>;
    expect(sent.rehearsalStart).toBe("16:00");
    expect(sent).not.toHaveProperty("contactPhone");
    expect(await screen.findByTestId("where")).toHaveTextContent("/performances/5");
  });
});

describe("게시 제한 안내 (AC-F4-05, #39)", () => {
  it("공고를 여러 번 내려 게시가 막혀 있으면 내 공연에 언제부터 되는지 보인다", async () => {
    mockServer({
      ...ME,
      "GET /api/v1/performances?mine=true": { status: 200, body: { active: [], draft: [], past: [] } },
      "GET /api/v1/me/posting-limit": { status: 200, body: { afterChat: 5, noChat: 0, limited: true, availableAt: "2026-11-13T14:00:00" } },
    });
    renderAt("/me/performances");
    expect(await screen.findByText("11월 13일 14:00")).toBeInTheDocument();
    expect(screen.getByText(/채팅 후 내림 5회/)).toBeInTheDocument();
  });
});
