import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, MyPerformances, PerformanceDetail, PerformanceSummary } from "../src/shared/api/types";

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
    expect(within(track).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "공연장 확정",
      "장비 조율 중 · 견적 2건",
      "엔지니어 대기",
    ]);
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
    expect(screen.getByLabelText(/^리허설 시작/)).toHaveValue("17:00");
    fireEvent.change(screen.getByLabelText(/^리허설 시작/), { target: { value: "16:00" } });
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
