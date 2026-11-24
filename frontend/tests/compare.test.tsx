import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { CompareQuote, Me, PerformanceDetail } from "../src/shared/api/types";

/** 단계별 견적 비교 화면 (#48) — AC-F3-20. 검사 결과는 서버가 준 그대로 보여 준다 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밴드", supplierReviewStatus: null, landing: "/me/performances",
};

const PERF = {
  id: 5, title: "가을밤 밴드 공연", form: "BAND", status: "ASSIGNING", showDate: "2026-11-28",
  rehearsalStart: "17:00:00", showStart: "19:00:00", showEnd: "21:00:00", audience: 80,
  sido: "광주광역시", sigungu: "동구", currentVersion: 1,
  stages: [
    { id: 1, stageType: "VENUE", seq: 1, status: "NEGOTIATING", quoteCount: 3 },
    { id: 2, stageType: "EQUIPMENT", seq: 2, status: "WAITING", quoteCount: null },
    { id: 3, stageType: "ENGINEER", seq: 3, status: "WAITING", quoteCount: null },
  ],
  nextAction: "NEGOTIATE", nextStageId: 1, lineup: [], hasContactPhone: true, publishedAt: null,
  needs: {} as PerformanceDetail["needs"],
} as PerformanceDetail;

function quote(over: Partial<CompareQuote>): CompareQuote {
  return {
    quoteId: 1, supplierId: 1, companyName: "", roomId: null, chatStarted: false, label: "기본형", status: "SENT", version: 1, basedOnPerfVersion: 1, totalAmount: 500000,
    venueId: 3, venueType: "CULTURE_SPACE", venueName: "공간 C", maxCapacity: 120, checkinTime: "14:00", setupAvailableTime: "15:00", checkoutTime: "23:00",
    includesEquipment: false, includesEngineer: false, isFullSpec: false, offered: false, overall: "PASS",
    checks: [
      { id: "CHK-01", result: "PASS", message: "수용 인원 120명 ≥ 관객 80명" },
      { id: "CHK-02", result: "PASS", message: "설치에 쓸 수 있는 시간이 120분이에요." },
    ],
    ...over,
  };
}

const QUOTES: CompareQuote[] = [
  quote({ quoteId: 11, venueName: "공간 A", totalAmount: 4000000, isFullSpec: true, includesEquipment: true, includesEngineer: true, maxCapacity: 200 }),
  quote({
    quoteId: 12, venueName: "공간 B", totalAmount: 400000, maxCapacity: 100, setupAvailableTime: "17:00", overall: "WARNING",
    checks: [{ id: "CHK-02", result: "WARNING", message: "설치에 쓸 수 있는 시간이 0분이에요 (설치 가능 17:00, 리허설 17:00)." }],
  }),
  quote({ quoteId: 13 }),
];

function mockServer(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = routes[url];
    return body === undefined
      ? new Response(JSON.stringify({ code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  }));
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("단계별 견적 비교 (/performances/:id/compare)", () => {
  it("항목 이름이 겹쳐도(수용 인원) React key 경고가 없다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockServer({ "/api/v1/me": USER, "/api/v1/performances/5": PERF, "/api/v1/stages/1/quotes": QUOTES });
    renderAt("/performances/5/compare");
    await screen.findByRole("table");
    expect(error.mock.calls.filter(([m]) => String(m).includes("same key"))).toEqual([]);
    error.mockRestore();
  });

  it("AC-F3-20 A 풀스펙, B 설치 시간 0분 경고, C 통과를 나란히 보여 준다", async () => {
    mockServer({ "/api/v1/me": USER, "/api/v1/performances/5": PERF, "/api/v1/stages/1/quotes": QUOTES });
    renderAt("/performances/5/compare");

    const a = await screen.findByRole("article", { name: "공간 A · 기본형" });
    expect(within(a).getByText("풀스펙")).toBeInTheDocument();
    expect(within(a).getByText("4,000,000")).toBeInTheDocument();
    expect(within(a).getByRole("img", { name: "공간 A · 기본형 사진" })).toBeInTheDocument();

    const b = screen.getByRole("article", { name: "공간 B · 기본형" });
    expect(within(b).getByLabelText("검사 결과: 경고 1")).toBeInTheDocument();
    expect(within(b).getByText(/0분이에요/)).toBeInTheDocument();

    const c = screen.getByRole("article", { name: "공간 C · 기본형" });
    expect(within(c).getByLabelText("검사 결과: 통과 2")).toBeInTheDocument();
    // 11/24 제보: 채팅 시작 전에는 "조율 중"이 아니라 "견적 받음"
    expect(within(c).getByText("견적 받음")).toBeInTheDocument();
    expect(within(c).queryByText("조율 중")).not.toBeInTheDocument();

    const table = screen.getByRole("table", { name: "공연장 견적서 항목별 비교" });
    expect(within(table).getByText("200명")).toBeInTheDocument();
    expect(within(table).getByText("14:00 · 17:00")).toBeInTheDocument();
  });

  it("AC-F3-20 대기 중인 단계 탭은 누를 수 없다", async () => {
    mockServer({ "/api/v1/me": USER, "/api/v1/performances/5": PERF, "/api/v1/stages/1/quotes": QUOTES });
    renderAt("/performances/5/compare");

    const tab = await screen.findByRole("tab", { name: /02 장비/ });
    expect(tab).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(tab);
    expect(screen.getByRole("tab", { name: /01 공연장/ })).toHaveAttribute("aria-selected", "true");
  });

  it("AC-F3-20 견적서가 없으면 빈 화면 안내", async () => {
    mockServer({ "/api/v1/me": USER, "/api/v1/performances/5": PERF, "/api/v1/stages/1/quotes": [] });
    renderAt("/performances/5/compare");

    expect(await screen.findByText(/아직 받은 견적서가 없어요/)).toBeInTheDocument();
  });

  it("D-57 결제 전에 업체가 취소해 다시 모집 중인 단계에서는 그 업체 견적서를 확정으로 보이지 않는다", async () => {
    const reopened = { ...PERF, stages: [{ ...PERF.stages[0], status: "OPEN" }, ...PERF.stages.slice(1)] };
    const cancelled = QUOTES.map((q, i) => (i === 0 ? { ...q, status: "CONFIRMED" } : q));
    mockServer({ "/api/v1/me": USER, "/api/v1/performances/5": reopened, "/api/v1/stages/1/quotes": cancelled });
    renderAt("/performances/5/compare");

    const a = await screen.findByRole("article", { name: "공간 A · 기본형" });
    expect(within(a).getByText("업체 사정 취소")).toBeInTheDocument();
    expect(within(a).queryByText("확정")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "공연장 견적서 항목별 비교" })).queryByText("확정")).not.toBeInTheDocument();
  });

  it("남의 공연(서버 404)이면 불러오는 중에 멈추지 않고 찾을 수 없음 화면", async () => {
    mockServer({ "/api/v1/me": USER });
    renderAt("/performances/9/compare");

    expect(await screen.findByText("화면을 찾을 수 없어요")).toBeInTheDocument();
  });

  it("카드 맨 위는 업체 상호, 총액 아래 검사 요약과 가장 낮은 금액과의 차이, 맨 아래 [견적서 보기]·[채팅]", async () => {
    const named = [
      { ...QUOTES[0], companyName: "업체 A", roomId: 31 },
      { ...QUOTES[1], companyName: "업체 B", roomId: 32 },
    ];
    mockServer({ "/api/v1/me": USER, "/api/v1/performances/5": PERF, "/api/v1/stages/1/quotes": named });
    renderAt("/performances/5/compare");

    const a = await screen.findByRole("article", { name: "업체 A 공간 A · 기본형" });
    expect(within(a).getByText("+3,600,000원")).toBeInTheDocument();
    expect(within(a).getByText("통과 2")).toBeInTheDocument();
    expect(within(a).getByRole("link", { name: "견적서 보기" })).toHaveAttribute("href", "/quotes/11");
    expect(within(a).getByRole("link", { name: "업체 A와 채팅" })).toHaveAttribute("href", "/performances/5/compare?stage=1&chat=31");
    const b = screen.getByRole("article", { name: "업체 B 공간 B · 기본형" });
    expect(within(b).getByText("가장 낮은 금액")).toBeInTheDocument();
    expect(within(b).getByText("경고 1")).toBeInTheDocument();
  });
});
