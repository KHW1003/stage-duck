import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { ConfirmCardOut } from "../src/features/confirm/api";
import { ConfirmedCard, ConfirmRequestCard } from "../src/features/confirm/ConfirmCards";
import type { Me, QuoteOut, QuoteVersionOut } from "../src/shared/api/types";

/** 최종 견적 카드·확정 (#43, AC-F3-09·10·12·14) */

const USER: Me = {
  id: 12, role: "USER", status: "ACTIVE", email: "u@stageduck.test", name: "김사용", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "이음향", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

const CARD: ConfirmCardOut = {
  id: 41, roomId: 31, quoteId: 77, quoteVersionId: 88, version: 2, currentVersion: 2, label: "기본형", totalAmount: 1350000,
  stageId: 50, stageType: "EQUIPMENT", performanceId: 5, status: "PENDING",
  expiresAt: new Date(Date.now() + 47.5 * 3600000).toISOString(), viewedAt: null, decidedAt: null, nextStageType: null, checkoutAvailable: null,
};

const V2: QuoteVersionOut = {
  version: 2, basedOnPerfVersion: 1, venueId: null, venueSnapshot: null, checkinTime: null, setupAvailableTime: null,
  setupStart: "15:00", setupMinutes: 90, teardownMinutes: null, staff: [],
  items: [{ name: "추가 마이크·밴드 음향", category: "음향", qty: 2, unitPrice: 300000, amount: 600000 }],
  includesEquipment: true, includesEngineer: true, includesInstall: true, includesTransport: false,
  amountItems: 600000, amountTransport: 250000, amountInstall: 200000, amountLabor: 300000, amountEtc: 0,
  discountAmount: 0, totalAmount: 1350000, extraCostNote: null, validUntil: null, techNote: null, createdAt: "2026-11-19T11:00:00.000",
};
const QUOTE: QuoteOut = {
  quoteId: 77, stageId: 50, supplierId: 4, label: "기본형", status: "SENT", isFullSpec: true, currentVersion: 2, current: V2, versions: [V2],
  stageType: "EQUIPMENT", performanceId: 5, performanceTitle: "가을밤 밴드 공연", showDate: "2026-11-28", companyName: "업체 D", checks: [],
};

type Reply = { status: number; body?: unknown };
type Call = { key: string; body: unknown; headers: Headers };

function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
      const route = routes[key];
      const r = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
      if (!r && url === "/api/v1/chat-rooms") return new Response("[]", { status: 200 });
      const reply = r ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status });
    }),
  );
  return calls;
}

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {}
  close() {}
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderEl(el: React.ReactElement) {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.stubGlobal("WebSocket", FakeSocket));
afterEach(() => vi.unstubAllGlobals());

describe("채팅 최종 견적 카드", () => {
  it("AC-F3-10 내역서를 열기 전에는 [확정하기]가 눌리지 않고, [내역서 보기]는 ?confirm= 으로 연다", async () => {
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: CARD } });
    renderEl(<ConfirmRequestCard id={41} role="USER" partner="업체 D" onLeave={() => {}} />);
    const btn = await screen.findByRole("button", { name: "확정하기" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("내역서를 먼저 열어 확인해 주세요.");
    expect(screen.getByRole("link", { name: "내역서 보기" })).toHaveAttribute("href", "/quotes/by-version/88?confirm=41");
    expect(screen.getByText("47시간 남음")).toBeInTheDocument();
    expect(screen.getByText(/1,350,000원/)).toBeInTheDocument();
  });

  it("열람한 뒤 [확정하기] → Idempotency-Key 와 함께 POST accept", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/confirm-requests/41": [{ status: 200, body: { ...CARD, viewedAt: "2026-11-19T10:05:00" } }, { status: 200, body: { ...CARD, status: "CONFIRMED" } }],
      "POST /api/v1/confirm-requests/41/accept": {
        status: 200,
        body: { stageId: 50, stageStatus: "CONFIRMED", confirmedQuoteVersionId: 88, performanceId: 5, next: { stageType: null, suggestSkip: false }, checkoutAvailable: true, card: { ...CARD, status: "CONFIRMED" } },
      },
    });
    renderEl(<ConfirmRequestCard id={41} role="USER" partner="업체 D" onLeave={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "확정하기" }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/v1/confirm-requests/41/accept")).toBe(true));
    const accept = calls.find((c) => c.key === "POST /api/v1/confirm-requests/41/accept")!;
    expect(accept.headers.get("Idempotency-Key")).toMatch(/^confirm-41-/);
    expect(await screen.findByText("확정했어요")).toBeInTheDocument();
  });

  it("AC-F3-09·12 고친 견적·만료 카드는 버튼 없이 안내만, 업체에게는 확정 버튼이 없다", async () => {
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: { ...CARD, status: "INVALIDATED", currentVersion: 3 } } });
    const a = renderEl(<ConfirmRequestCard id={41} role="USER" partner="업체 D" onLeave={() => {}} />);
    expect(await screen.findByText("새 견적이 있어요. 업체에게 새 최종 견적을 요청해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확정하기" })).not.toBeInTheDocument();
    a.unmount();
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: { ...CARD, status: "EXPIRED" } } });
    const b = renderEl(<ConfirmRequestCard id={41} role="USER" partner="업체 D" onLeave={() => {}} />);
    expect(await screen.findByText("만료")).toBeInTheDocument();
    b.unmount();
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: CARD } });
    renderEl(<ConfirmRequestCard id={41} role="SUPPLIER" partner="가을밤밴드" onLeave={() => {}} />);
    expect(await screen.findByText("최종 견적을 보냈어요 · 장비")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "확정하기" })).not.toBeInTheDocument();
  });
});

describe("확정 완료 카드 (AC-F3-14)", () => {
  it("마지막 단계면 [통합 결제하기], 아니면 [다음 단계로], 업체에게는 버튼 없음", async () => {
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: { ...CARD, status: "CONFIRMED", checkoutAvailable: true } } });
    const a = renderEl(<ConfirmedCard id={41} role="USER" onLeave={() => {}} />);
    expect(await screen.findByRole("link", { name: "통합 결제하기" })).toHaveAttribute("href", "/performances/5/order");
    a.unmount();
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: { ...CARD, status: "CONFIRMED", checkoutAvailable: false, nextStageType: "ENGINEER" } } });
    const b = renderEl(<ConfirmedCard id={41} role="USER" onLeave={() => {}} />);
    expect(await screen.findByRole("link", { name: "다음 단계로 (엔지니어)" })).toHaveAttribute("href", "/performances/5/next");
    b.unmount();
    mockServer({ "GET /api/v1/confirm-requests/41": { status: 200, body: { ...CARD, status: "CONFIRMED", checkoutAvailable: true } } });
    renderEl(<ConfirmedCard id={41} role="SUPPLIER" onLeave={() => {}} />);
    expect(await screen.findByText("장비 단계를 우리 업체로 확정했어요")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("내역서에서 확정·최종 견적 보내기", () => {
  it("사용자가 카드에서 열면 열람을 기록하고, [확정하기] 뒤 [통합 결제하기]", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: USER },
      "GET /api/v1/quotes/by-version/88": { status: 200, body: QUOTE },
      "GET /api/v1/confirm-requests/41": [{ status: 200, body: CARD }, { status: 200, body: { ...CARD, viewedAt: "2026-11-19T10:05:00" } }],
      "POST /api/v1/confirm-requests/41/view": { status: 200, body: { ...CARD, viewedAt: "2026-11-19T10:05:00" } },
      "POST /api/v1/confirm-requests/41/accept": {
        status: 200,
        body: { stageId: 50, stageStatus: "CONFIRMED", confirmedQuoteVersionId: 88, performanceId: 5, next: { stageType: null, suggestSkip: false }, checkoutAvailable: true, card: { ...CARD, status: "CONFIRMED" } },
      },
    });
    renderAt("/quotes/by-version/88?confirm=41");
    const box = await screen.findByRole("group", { name: "최종 견적 확정" });
    await waitFor(() => expect(calls.filter((c) => c.key === "POST /api/v1/confirm-requests/41/view")).toHaveLength(1));
    const confirm = within(box).getByRole("button", { name: "확정하기" });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    expect(await within(box).findByRole("link", { name: "통합 결제하기" })).toHaveAttribute("href", "/performances/5/order");
  });

  it("업체는 보낸 견적서에서 [최종 견적 보내기] → POST /quotes/{id}/confirm-requests, 이미 있으면 서버 문구", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/quotes/77": { status: 200, body: QUOTE },
      "POST /api/v1/quotes/77/confirm-requests": [
        { status: 409, body: { code: "INVALID_STATE", message: "이미 보낸 최종 견적이 있어요. 사용자가 답하거나 기한이 지나면 다시 보낼 수 있어요.", fieldErrors: [] } },
        { status: 201, body: CARD },
      ],
    });
    renderAt("/quotes/77");
    await user.click(await screen.findByRole("button", { name: "최종 견적 보내기" }));
    expect(await screen.findByText(/이미 보낸 최종 견적이 있어요/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "최종 견적 보내기" }));
    expect(await screen.findByText("최종 견적을 보냈어요. 사용자가 확정하면 알려 드려요.")).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "POST /api/v1/quotes/77/confirm-requests")).toHaveLength(2);
  });
});
