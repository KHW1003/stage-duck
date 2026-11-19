import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, PostingDetail, QuoteOut, QuoteVersionOut } from "../src/shared/api/types";

/** 업체 견적서 고치기 (#41 화면 마지막) — AC-F2-20, 409 VERSION_CONFLICT·INVALID_STATE, 남의 견적서 404 */

const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "이음향", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

const POSTING: PostingDetail = {
  stageId: 2, performanceId: 5, stageType: "EQUIPMENT", status: "OPEN", performanceVersion: 1,
  title: "가을밤 밴드 공연", showDate: "2026-11-28", sido: "광주광역시", sigungu: "동구",
  nickname: "가을밤밴드", rejectionCount: 1, usageCount: 2,
  form: "BAND", rehearsalStart: "17:00", showStart: "19:00", showEnd: "21:00", audience: 80,
  needs: {
    venue: { needed: true, proposalWanted: false, types: ["CULTURE_SPACE"], capacity: 80, budget: null, checkinWish: null, checkoutWish: null, mustHave: [], note: "" },
    equipment: { needed: true, proposalWanted: true, items: [], services: ["TRANSPORT", "INSTALL"], budget: 1500000, owned: [], note: "" },
    engineer: { needed: true, tasks: ["FOH"], conditions: [], etc: "", note: "" },
    ownedVenue: null,
  },
  previousStages: [],
};

/** AC-F2-20 예시: D 견적서 v1 = 품목 600,000 + 운반 150,000 + 설치 200,000 + 인건비 300,000 = 1,250,000원 */
const V1: QuoteVersionOut = {
  version: 1, basedOnPerfVersion: 1, venueId: null, venueSnapshot: null,
  checkinTime: null, setupAvailableTime: null, setupStart: "15:00", setupMinutes: 90, teardownMinutes: null,
  staff: [],
  items: [{ name: "추가 마이크·밴드 음향", category: "음향", qty: 2, unitPrice: 300000, amount: 600000 }],
  includesEquipment: true, includesEngineer: true, includesInstall: true, includesTransport: false,
  amountItems: 600000, amountTransport: 150000, amountInstall: 200000, amountLabor: 300000, amountEtc: 0,
  discountAmount: 0, totalAmount: 1250000, extraCostNote: null, validUntil: null, techNote: null,
  createdAt: "2026-11-19T10:00:00.000",
};
/** 운반비를 250,000으로 고친 v2 = 1,350,000원 */
const V2: QuoteVersionOut = { ...V1, version: 2, amountTransport: 250000, totalAmount: 1350000, createdAt: "2026-11-19T11:00:00.000" };

const QUOTE_V1: QuoteOut = {
  quoteId: 77, stageId: 2, supplierId: 4, label: "기본형", status: "SENT", isFullSpec: true,
  currentVersion: 1, current: V1, versions: [V1],
  stageType: "EQUIPMENT", performanceId: 5, performanceTitle: "가을밤 밴드 공연", showDate: "2026-11-28", companyName: "업체 D", checks: [],
};
const QUOTE_V2: QuoteOut = { ...QUOTE_V1, currentVersion: 2, current: V2, versions: [V1, V2] };

type Reply = { status: number; body?: unknown };
type Call = { key: string; body: unknown };

/** 같은 주소에 여러 번 답할 때는 배열로 순서대로 (마지막 답은 계속 쓴다) */
function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${url}`;
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[key];
      const r = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
      const reply = r ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
    }),
  );
  return calls;
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

const BASE = {
  "GET /api/v1/me": { status: 200, body: SUPPLIER },
  "GET /api/v1/supplier/terms-review": { status: 200, body: { version: "1.0:1.0", reviewed: true } },
  "GET /api/v1/postings/2": { status: 200, body: POSTING },
};
const PATH = "/supplier/quotes/77/edit";
const SENT_V2 = { quoteId: 77, version: 2, chatRoomId: 31, checks: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("견적서 고치기 (/supplier/quotes/:quoteId/edit)", () => {
  it("기존 견적을 고칠 때도 약관을 확인한 뒤 수정 견적을 전송한다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({
      ...BASE,
      "GET /api/v1/quotes/77": { status: 200, body: QUOTE_V1 },
      "GET /api/v1/supplier/terms-review": { status: 200, body: { version: "1.0:1.0", reviewed: false } },
      "PUT /api/v1/supplier/terms-review": { status: 200, body: { version: "1.0:1.0", reviewed: true } },
      "PUT /api/v1/quotes/77": { status: 200, body: SENT_V2 },
    });
    renderAt(PATH);

    fireEvent.change(await screen.findByLabelText("운반비"), { target: { value: "250000" } });
    await user.click(screen.getByRole("button", { name: "고친 견적서 보내기" }));
    expect(screen.getByRole("dialog", { name: "입점·견적·이행 및 정산" })).toBeInTheDocument();
    expect(calls.filter(({ key }) => key.startsWith("PUT"))).toEqual([]);
    await user.click(screen.getByRole("button", { name: "확인하고 다음" }));
    await user.click(screen.getByRole("button", { name: "확인하고 다음" }));
    await user.click(screen.getByRole("button", { name: "확인하고 수정 견적 보내기" }));
    expect(await screen.findByRole("heading", { name: "v2로 고쳤어요" })).toBeInTheDocument();
    expect(calls.filter(({ key }) => key.startsWith("PUT")).map(({ key }) => key)).toEqual([
      "PUT /api/v1/supplier/terms-review", "PUT /api/v1/quotes/77",
    ]);
  });

  it("AC-F2-20 현재 버전 값이 미리 채워지고, 135만으로 고쳐 보내면 PUT 본문에 version 과 새 값만(label 없이) 담기고 v2 완료 안내가 보인다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({
      ...BASE,
      "GET /api/v1/quotes/77": [{ status: 200, body: QUOTE_V1 }, { status: 200, body: QUOTE_V2 }],
      "PUT /api/v1/quotes/77": { status: 200, body: SENT_V2 },
    });
    renderAt(PATH);

    expect(await screen.findByLabelText("1번 품목 이름")).toHaveValue("추가 마이크·밴드 음향");
    expect(screen.getByLabelText("1번 수량")).toHaveValue("2");
    expect(screen.getByLabelText("운반비")).toHaveValue("150,000");
    expect(screen.getByLabelText("설치 시작")).toHaveValue("15:00");
    expect(screen.getByLabelText(/설치 포함/)).toBeChecked();
    expect(screen.getByLabelText(/운반 포함/)).not.toBeChecked();
    expect(screen.getByTestId("quote-total")).toHaveTextContent("1,250,000원");

    fireEvent.change(screen.getByLabelText("운반비"), { target: { value: "250000" } });
    expect(screen.getByTestId("quote-total")).toHaveTextContent("1,350,000원");
    await user.click(screen.getByRole("button", { name: "고친 견적서 보내기" }));

    expect(await screen.findByRole("heading", { name: "v2로 고쳤어요" })).toBeInTheDocument();
    const put = calls.find((c) => c.key === "PUT /api/v1/quotes/77");
    expect(put?.body).toEqual({
      version: 1,
      venueId: null,
      items: [{ name: "추가 마이크·밴드 음향", category: "음향", qty: 2, unitPrice: 300000, amount: 600000 }],
      staff: [],
      setupStart: "15:00",
      setupMinutes: 90,
      teardownMinutes: null,
      includes: { equipment: true, engineer: true, install: true, transport: false },
      amounts: { items: 600000, transport: 250000, install: 200000, labor: 300000, etc: 0 },
      discountAmount: 0,
      totalAmount: 1350000,
      extraCostNote: null,
      techNote: null,
    });
    expect(put?.body).not.toHaveProperty("label");
  });

  it("AC-F2-20 버전 이력이 v1 1,250,000원 · v2 1,350,000원으로 남아 보인다", async () => {
    mockServer({ ...BASE, "GET /api/v1/quotes/77": { status: 200, body: QUOTE_V2 } });
    renderAt(PATH);

    const history = await screen.findByRole("list", { name: "버전 이력" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("v1");
    expect(rows[0]).toHaveTextContent("1,250,000원");
    expect(rows[1]).toHaveTextContent("v2");
    expect(rows[1]).toHaveTextContent("1,350,000원");
    expect(rows[1]).toHaveTextContent("현재");
  });

  it("견적서 이름(label)은 읽기 전용으로 보인다", async () => {
    mockServer({ ...BASE, "GET /api/v1/quotes/77": { status: 200, body: QUOTE_V1 } });
    renderAt(PATH);

    const label = await screen.findByLabelText(/견적서 이름/);
    expect(label).toHaveValue("기본형");
    expect(label).toHaveAttribute("readonly");
  });

  it("409 VERSION_CONFLICT 면 서버 문구와 [새로 불러오기]가 보이고, 누르면 새 버전 값으로 양식을 다시 채운다", async () => {
    const user = userEvent.setup({ delay: null });
    const conflict = { code: "VERSION_CONFLICT", message: "그사이 내용이 바뀌었어요. 새로 고친 뒤 다시 해 주세요.", fieldErrors: [] };
    const calls = mockServer({
      ...BASE,
      "GET /api/v1/quotes/77": [{ status: 200, body: QUOTE_V1 }, { status: 200, body: QUOTE_V2 }],
      "PUT /api/v1/quotes/77": { status: 409, body: conflict },
    });
    renderAt(PATH);

    await screen.findByLabelText("1번 품목 이름");
    fireEvent.change(screen.getByLabelText("인건비"), { target: { value: "400000" } });
    await user.click(screen.getByRole("button", { name: "고친 견적서 보내기" }));

    expect(await screen.findByText(conflict.message)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "새로 불러오기" }));

    await waitFor(() => expect(screen.getByTestId("quote-total")).toHaveTextContent("1,350,000원"));
    expect(screen.getByLabelText("운반비")).toHaveValue("250,000");
    expect(screen.getByLabelText("인건비")).toHaveValue("300,000");
    expect(screen.queryByText(conflict.message)).not.toBeInTheDocument();
    expect(calls.filter((c) => c.key === "GET /api/v1/quotes/77").length).toBeGreaterThanOrEqual(2);
  });

  it("409 INVALID_STATE 면 서버 문구를 그대로 보여 주고 양식을 닫는다", async () => {
    const user = userEvent.setup({ delay: null });
    const invalid = { code: "INVALID_STATE", message: "보낸 상태의 견적서만 고칠 수 있어요.", fieldErrors: [] };
    mockServer({
      ...BASE,
      "GET /api/v1/quotes/77": { status: 200, body: QUOTE_V1 },
      "PUT /api/v1/quotes/77": { status: 409, body: invalid },
    });
    renderAt(PATH);

    await screen.findByLabelText("1번 품목 이름");
    await user.click(screen.getByRole("button", { name: "고친 견적서 보내기" }));

    expect(await screen.findByText(invalid.message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "고친 견적서 보내기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로 불러오기" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공고 목록으로" })).toHaveAttribute("href", "/supplier/postings");
  });

  it("남의 견적서(404)면 볼 수 없다는 안내와 [공고 목록으로]만 보인다", async () => {
    mockServer({ ...BASE });
    renderAt("/supplier/quotes/99/edit");

    expect(await screen.findByText("볼 수 없는 견적서예요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공고 목록으로" })).toHaveAttribute("href", "/supplier/postings");
    expect(screen.queryByLabelText("1번 품목 이름")).not.toBeInTheDocument();
  });
});

describe("견적서 내역서 (/quotes/:quoteId · /quotes/by-version/:versionId)", () => {
  const SHEET: QuoteOut = {
    ...QUOTE_V2,
    checks: [{ id: "CHK-12", result: "PASS", message: "요청서 v1 기준이에요." }] as QuoteOut["checks"],
  };

  it("문서처럼 공연·업체·항목·합계·자동 검사를 보여 주고, 이전 버전을 고르면 그 금액으로 바뀐다", async () => {
    const user = userEvent.setup({ delay: null });
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER }, "GET /api/v1/quotes/77": { status: 200, body: SHEET } });
    renderAt("/quotes/77");
    const doc = await screen.findByRole("article", { name: "견적서 기본형 v2" });
    expect(within(doc).getByText("가을밤 밴드 공연")).toBeInTheDocument();
    expect(within(doc).getByText("업체 D")).toBeInTheDocument();
    expect(within(doc).getByText("1,350,000원")).toBeInTheDocument();
    expect(within(doc).getByText("요청서 버전")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /인쇄하기/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "견적서 고치기" })).toHaveAttribute("href", "/supplier/quotes/77/edit");
    await user.click(screen.getByRole("button", { name: /v1/ }));
    const old = await screen.findByRole("article", { name: "견적서 기본형 v1" });
    expect(within(old).getByText("1,250,000원")).toBeInTheDocument();
    expect(within(old).getByText(/이전 버전\(v1\)/)).toBeInTheDocument();
  });

  it("채팅 카드의 버전 번호(refId)로 연다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER }, "GET /api/v1/quotes/by-version/12": { status: 200, body: SHEET } });
    renderAt("/quotes/by-version/12");
    expect(await screen.findByRole("article", { name: "견적서 기본형 v2" })).toBeInTheDocument();
  });

  it("남의 견적서(서버 404)는 찾을 수 없어요", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER } });
    renderAt("/quotes/by-version/99");
    expect(await screen.findByText("견적서를 찾을 수 없어요")).toBeInTheDocument();
  });
});
