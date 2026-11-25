import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, PostingDetail, PostingSummary } from "../src/shared/api/types";

/** 업체 공고 목록·상세 (#41 화면) — AC-F2-11·12, AC-F3-03, AC-F4-07, AC-F5-12 */

const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "이음향", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

/** 공연 주인(사용자)의 연락처·실명. 서버가 실수로 보내도 화면에 나오면 안 된다 (AC-F5-12) */
const OWNER_SECRET = { name: "김비밀", phone: "010-0000-1234", email: "owner@stageduck.test", birthDate: "1990-01-01" };

const POSTING: PostingSummary = {
  stageId: 2, performanceId: 5, stageType: "EQUIPMENT", status: "OPEN", performanceVersion: 1,
  title: "가을밤 밴드 공연", showDate: "2026-11-28", sido: "광주광역시", sigungu: "동구",
  nickname: "가을밤밴드", rejectionCount: 1, usageCount: 2,
};

const DETAIL: PostingDetail = {
  ...POSTING,
  form: "BAND", rehearsalStart: "17:00", showStart: "19:00", showEnd: "21:00", audience: 80,
  needs: {
    venue: { needed: true, proposalWanted: false, types: ["CULTURE_SPACE"], capacity: 80, budget: null, checkinWish: null, checkoutWish: null, mustHave: [], note: "" },
    equipment: { needed: true, proposalWanted: true, items: [], services: ["TRANSPORT", "INSTALL"], budget: 1500000, owned: [{ name: "드럼 세트", detail: "심벌 포함" }], note: "" },
    engineer: { needed: true, tasks: ["FOH"], conditions: [], etc: "", note: "" },
    ownedVenue: null,
  },
  previousStages: [
    {
      stageType: "VENUE",
      venueSnapshot: {
        name: "공간 C", venueType: "CULTURE_SPACE", maxCapacity: 120, checkinTime: "15:00", checkoutTime: "22:00",
        hasResidentEngineer: false,
        conditions: { EXTERNAL_EQUIPMENT_ALLOWED: true, HAS_PARKING: null },
        equipment: [{ category: "MIC", name: "유선 마이크", quantity: 2 }],
      },
      checkinTime: "15:00", setupAvailableTime: "15:00", items: [],
      techNote: "무대 4구 · 단상 220V",
    },
  ],
};

type Reply = { status: number; body?: unknown };

function mockServer(routes: Record<string, Reply>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push(`${method} ${url}`);
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

const ME = { "GET /api/v1/me": { status: 200, body: SUPPLIER } };

function expectNoOwnerSecret() {
  const text = document.body.textContent ?? "";
  for (const v of Object.values(OWNER_SECRET)) expect(text).not.toContain(v);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("공고 목록 (/supplier/postings)", () => {
  it("AC-F4-07 공고 줄에 제목·공연일·지역·부문·닉네임·이용·반려 횟수가 보인다", async () => {
    mockServer({ ...ME, "GET /api/v1/postings": { status: 200, body: [{ ...POSTING, ...OWNER_SECRET }] } });
    renderAt("/supplier/postings");

    const row = await screen.findByRole("row", { name: /가을밤 밴드 공연/ });
    expect(within(row).getByText("11월 28일(토)")).toBeInTheDocument();
    expect(within(row).getByText(/광주광역시 동구/)).toBeInTheDocument();
    expect(within(row).getByText(/장비 단계/)).toBeInTheDocument();
    expect(within(row).getByText("가을밤밴드")).toBeInTheDocument();
    expect(within(row).getByText("이용 2 · 반려 1")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "상세" })).toHaveAttribute("href", "/supplier/postings/2");
  });

  it("공고 목록: 분류 옆에 지금 견적을 보낼 수 있는지(견적 가능 / 모집 전) 보인다", async () => {
    const body = [POSTING, { ...POSTING, stageId: 3, title: "겨울 공연", stageType: "ENGINEER", status: "WAITING" }];
    mockServer({ ...ME, "GET /api/v1/postings": { status: 200, body } });
    renderAt("/supplier/postings");

    const open = await screen.findByRole("row", { name: /가을밤 밴드 공연/ });
    expect(within(open).getByText("견적 가능")).toBeInTheDocument();
    const wait = screen.getByRole("row", { name: /겨울 공연/ });
    expect(within(wait).getByText("모집 전")).toBeInTheDocument();
    expect(within(wait).queryByText("견적 가능")).not.toBeInTheDocument();
  });

  it("AC-F2-12 볼 수 있는 공고가 없으면 빈 화면 문구가 보인다", async () => {
    mockServer({ ...ME, "GET /api/v1/postings": { status: 200, body: [] } });
    renderAt("/supplier/postings");

    expect(await screen.findByText("지금 볼 수 있는 공고가 없어요")).toBeInTheDocument();
  });

  it("AC-F2-12 심사 중인 업체는 공고 목록 대신 입점·심사 화면으로 간다", async () => {
    const calls = mockServer({ "GET /api/v1/me": { status: 200, body: { ...SUPPLIER, supplierReviewStatus: "PENDING" } } });
    renderAt("/supplier/postings");

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/supplier/onboarding"));
    expect(calls.some((c) => c.includes("/postings"))).toBe(false);
  });

  it("AC-F2-11 지역을 고르면 ?sido= 로 다시 불러온다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/postings": { status: 200, body: [POSTING] },
      "GET /api/v1/postings?sido=%EA%B4%91%EC%A3%BC%EA%B4%91%EC%97%AD%EC%8B%9C": { status: 200, body: [] },
    });
    renderAt("/supplier/postings");

    await screen.findByRole("row", { name: /가을밤 밴드 공연/ });
    await user.click(screen.getByRole("combobox", { name: "지역" }));
    await user.click(screen.getByRole("option", { name: "광주광역시" }));

    expect(await screen.findByText("지금 볼 수 있는 공고가 없어요")).toBeInTheDocument();
    expect(calls).toContain(`GET /api/v1/postings?sido=${encodeURIComponent("광주광역시")}`);
  });
});

describe("공고 상세 (/supplier/postings/:stageId)", () => {
  it("11/25 내 단계가 아직 대기면 요청서는 보이고 [견적서 쓰기]는 잠긴 채 안내 문구가 붙는다", async () => {
    mockServer({ ...ME, "GET /api/v1/postings/2": { status: 200, body: { ...DETAIL, status: "WAITING" } } });
    renderAt("/supplier/postings/2");

    expect(await screen.findByRole("heading", { level: 2, name: /가을밤 밴드 공연/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "견적서 쓰기" })).toBeDisabled();
    expect(screen.getAllByText(/앞 단계가 확정되면 이 단계 모집이 열려요/).length).toBeGreaterThan(0);
  });

  it("AC-F3-03 요청서 내용과 앞 단계에서 확정된 공간의 입실 시각·기본 장비·전원이 보인다", async () => {
    mockServer({ ...ME, "GET /api/v1/postings/2": { status: 200, body: { ...DETAIL, ...OWNER_SECRET } } });
    renderAt("/supplier/postings/2");

    // 11/25: 요청서 기본 정보는 큰 카드(PostingBrief)로 보인다
    expect(await screen.findByRole("heading", { level: 2, name: /가을밤 밴드 공연/ })).toBeInTheDocument();
    expect(screen.getByText("리허설 17:00")).toBeInTheDocument();
    expect(screen.getByText(/19:00 ~ 21:00/)).toBeInTheDocument();
    expect(screen.getByText(/^80명/)).toBeInTheDocument();
    expect(screen.getByText("가을밤밴드 · 이용 2 · 반려 1")).toBeInTheDocument();

    const prior = screen.getByRole("region", { name: "앞 단계에서 확정된 공간" });
    expect(within(prior).getByText(/공간 C/)).toBeInTheDocument();
    expect(within(prior).getByText("15:00")).toBeInTheDocument();
    expect(within(prior).getByText(/유선 마이크 2/)).toBeInTheDocument();
    expect(within(prior).getByText("무대 4구 · 단상 220V")).toBeInTheDocument();

    const need = screen.getByRole("region", { name: "장비 요청" });
    expect(within(need).getByText(/업체 제안 받기/)).toBeInTheDocument();
    expect(within(need).getByText("운반 · 설치 및 철수")).toBeInTheDocument();
    expect(within(need).getByText("1,500,000원")).toBeInTheDocument();
    expect(within(need).getByText(/드럼 세트/)).toBeInTheDocument();
  });

  it("[견적서 쓰기]는 견적서 작성 주소로 이동한다", async () => {
    mockServer({ ...ME, "GET /api/v1/postings/2": { status: 200, body: DETAIL } });
    renderAt("/supplier/postings/2");

    expect(await screen.findByRole("link", { name: "견적서 쓰기" })).toHaveAttribute("href", "/supplier/postings/2/quote");
  });

  it("AC-F2-14 볼 수 없는 공고(404)는 안내를 보여 준다", async () => {
    mockServer({ ...ME });
    renderAt("/supplier/postings/99");

    expect(await screen.findByText("볼 수 없는 공고예요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공고 목록으로" })).toHaveAttribute("href", "/supplier/postings");
  });

  it("AC-F5-12 결제 전에는 사용자 연락처·실명이 목록·상세 어디에도 없다", async () => {
    mockServer({
      ...ME,
      "GET /api/v1/postings": { status: 200, body: [{ ...POSTING, ...OWNER_SECRET }] },
      "GET /api/v1/postings/2": { status: 200, body: { ...DETAIL, ...OWNER_SECRET } },
    });
    const { unmount } = renderAt("/supplier/postings");
    await screen.findByRole("row", { name: /가을밤 밴드 공연/ });
    expectNoOwnerSecret();
    unmount();

    renderAt("/supplier/postings/2");
    await screen.findByRole("region", { name: "앞 단계에서 확정된 공간" });
    expectNoOwnerSecret();
  });
});
