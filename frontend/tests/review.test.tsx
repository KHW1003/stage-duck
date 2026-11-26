import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { PerformanceReviews } from "../src/features/review/PerformanceReviews";
import type { SupplierProfile } from "../src/shared/api/types";

/** 공연 후기·평점 (specs/reviews.md) */

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${decodeURIComponent(url)}`;
      calls.push({ url: decodeURIComponent(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = routes[key] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function withClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const SUPPLIER: SupplierProfile = {
  id: 4, companyName: "업체 D", imageUrl: null, duck: { role: "EQUIPMENT", seed: "0f0f0f0f0f0f", pick: null }, categories: ["EQUIPMENT"], intro: null, setupMinutes: 90, teardownMinutes: null,
  engineerYears: null, bandExperience: null, hasLiabilityInsurance: null, soundCertification: null, joinedAt: "2026-09-02T10:00:00",
  posts: [], venues: [],
};

describe("업체 프로필 후기", () => {
  it("평균·분포·후기 목록을 보여 주고, 쓴 사람은 닉네임만 보인다", async () => {
    mockServer({
      "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } },
      "GET /api/v1/suppliers/4/profile": { status: 200, body: SUPPLIER },
      "GET /api/v1/review-summaries?ids=4": { status: 200, body: [{ supplierId: 4, average: 4.5, count: 2 }] },
      "GET /api/v1/suppliers/4/reviews": {
        status: 200,
        body: {
          average: 4.5, count: 2, distribution: { "5": 1, "4": 1, "3": 0, "2": 0, "1": 0 }, nextBefore: null,
          items: [
            { id: 2, rating: 4, content: "드럼 마이킹까지 세심하게 해 주셨어요.", nickname: "북구청년밴드", stageType: "EQUIPMENT", showMonth: "2026년 11월", createdAt: "2026-11-08T23:00:00" },
            { id: 1, rating: 5, content: "설치가 일찍 끝나서 좋았어요.", nickname: "가을소리", stageType: "EQUIPMENT", showMonth: "2026년 10월", createdAt: "2026-10-11T23:00:00" },
          ],
        },
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/suppliers/4"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const sec = await screen.findByRole("region", { name: /이용 후기/ });
    expect(await within(sec).findByText("4.5")).toBeInTheDocument();
    expect(within(sec).getByText("후기 2개")).toBeInTheDocument();
    expect(within(sec).getByText("드럼 마이킹까지 세심하게 해 주셨어요.")).toBeInTheDocument();
    expect(within(sec).getByText("북구청년밴드")).toBeInTheDocument();
    expect(within(sec).getByText("장비 · 2026년 11월 공연")).toBeInTheDocument();
    expect(await screen.findByLabelText("별점 4.5점, 후기 2개")).toBeInTheDocument(); // 머리 요약
  });
});

describe("내 공연 후기 쓰기", () => {
  const PAGE = {
    canWrite: true,
    items: [
      { stageId: 11, stageType: "VENUE", supplierId: 3, companyName: "업체 C", review: { id: 9, rating: 5, content: "좋았어요 정말 최고", createdAt: "2026-12-21T10:00:00" } },
      { stageId: 12, stageType: "EQUIPMENT", supplierId: 4, companyName: "업체 D", review: null },
    ],
  };

  it("별점과 10자 이상 후기를 넣어야 보내고, 보낸 값은 stageId·rating·content", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/performances/5/reviews": { status: 200, body: PAGE },
      "POST /api/v1/performances/5/reviews": { status: 201, body: { id: 10, rating: 4, content: "설치가 빨라서 좋았습니다", createdAt: "2026-12-21T10:00:00" } },
    });
    withClient(<PerformanceReviews performanceId={5} />);

    expect(await screen.findByText("1곳의 후기를 기다리고 있어요. 다음 사람이 업체를 고를 때 큰 도움이 돼요.")).toBeInTheDocument();
    expect(screen.getByText("좋았어요 정말 최고")).toBeInTheDocument(); // 쓴 후기

    await user.click(screen.getByRole("button", { name: "후기 남기기" }));
    expect(screen.getByText("별점을 골라 주세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "4점 좋아요" }));
    await user.type(screen.getByLabelText("업체 D 후기"), "짧음");
    await user.click(screen.getByRole("button", { name: "후기 남기기" }));
    expect(screen.getByText("후기는 10자 이상 써 주세요.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await user.clear(screen.getByLabelText("업체 D 후기"));
    await user.type(screen.getByLabelText("업체 D 후기"), "설치가 빨라서 좋았습니다");
    await user.click(screen.getByRole("button", { name: "후기 남기기" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({ stageId: 12, rating: 4, content: "설치가 빨라서 좋았습니다" }),
    );
  });

  it("아직 쓸 수 없는 공연(공연 전·결제 전)이면 칸을 보이지 않는다", async () => {
    mockServer({ "GET /api/v1/performances/5/reviews": { status: 200, body: { ...PAGE, canWrite: false } } });
    const { container } = withClient(<PerformanceReviews performanceId={5} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
