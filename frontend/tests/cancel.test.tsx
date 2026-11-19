import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { CancelQuote, Me } from "../src/shared/api/types";

/** 공연 취소 화면 (#52) — AC-F5-08·09. 금액은 서버 cancel-quote 그대로 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밴드", supplierReviewStatus: null, landing: "/me/performances",
};

const D1: CancelQuote = {
  phase: "D1", ratePercent: 70, paid: 1942500, penaltyBase: 1850000, penaltyTotal: 1295000,
  penaltyBySupplier: [{ supplierId: 3, name: "업체 C", amount: 350000 }, { supplierId: 4, name: "업체 D", amount: 945000 }],
  feeRefunded: 0, refundTotal: 555000, cancellationId: null,
};
const BEFORE: CancelQuote = { ...D1, phase: "BEFORE_PAYMENT", ratePercent: 0, paid: 0, penaltyTotal: 0, penaltyBySupplier: [], refundTotal: 0 };

type Reply = { status: number; body: unknown };
function mockServer(routes: Record<string, Reply>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    calls.push(key);
    const r = routes[key] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
  return calls;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>,
  );
}

const ME = { "GET /api/v1/me": { status: 200, body: USER } };

afterEach(() => vi.unstubAllGlobals());

describe("공연 취소 (/performances/:id/cancel)", () => {
  it("AC-F5-08 D-1 은 70% 구간이 '지금'이고, 서버 금액(위약금·업체별·환불 예정)을 그대로 보여 준다", async () => {
    mockServer({ ...ME, "GET /api/v1/performances/5/cancel-quote": { status: 200, body: D1 } });
    renderAt("/performances/5/cancel");

    const scale = await screen.findByRole("list", { name: "취소 시점별 위약금" });
    expect(within(scale).getByText("D-1 · 지금")).toBeInTheDocument();
    expect(screen.getByText(/업체 C 350,000원 · 업체 D 945,000원/)).toBeInTheDocument();
    expect(screen.getByText("555,000원")).toBeInTheDocument();
    expect(screen.getByText("환불되지 않습니다")).toBeInTheDocument();
    expect(screen.getByText(/테스트 결제 — 실제 청구되지 않습니다/)).toBeInTheDocument();
  });

  it("AC-F5-09 결제 전에는 수수료 0원과 반려 안내", async () => {
    mockServer({ ...ME, "GET /api/v1/performances/5/cancel-quote": { status: 200, body: BEFORE } });
    renderAt("/performances/5/cancel");

    expect(await screen.findByText("결제 전 · 지금")).toBeInTheDocument();
    expect(screen.getByText(/반려 1회로 기록됩니다/)).toBeInTheDocument();
  });

  it("AC-F5-08 두 번째 확인 창에서만 취소를 접수하고 결과를 보여 준다", async () => {
    const calls = mockServer({
      ...ME,
      "GET /api/v1/performances/5/cancel-quote": { status: 200, body: D1 },
      "POST /api/v1/performances/5/cancel": { status: 200, body: { ...D1, cancellationId: 1 } },
    });
    renderAt("/performances/5/cancel");

    await userEvent.click(await screen.findByRole("button", { name: "취소 요청" }));
    const review = screen.getByRole("dialog", { name: "취소 요청" });
    await userEvent.click(within(review).getByRole("button", { name: "다음 · 금액 최종 확인" }));
    const final = await screen.findByRole("dialog", { name: "공연 취소 최종 확인" });
    expect(review).not.toBeInTheDocument();
    expect(within(final).getByText(/위약금 1,295,000원이 발생합니다/)).toBeInTheDocument();
    expect(within(final).getByText("92,500원")).toBeInTheDocument();
    expect(within(final).getByText("555,000원")).toBeInTheDocument();
    expect(calls).not.toContain("POST /api/v1/performances/5/cancel");
    await userEvent.click(within(final).getByRole("button", { name: "예약 유지" }));
    expect(final).not.toBeInTheDocument();
    expect(calls).not.toContain("POST /api/v1/performances/5/cancel");

    await userEvent.click(screen.getByRole("button", { name: "취소 요청" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "다음 · 금액 최종 확인" }));
    const secondFinal = await screen.findByRole("dialog", { name: "공연 취소 최종 확인" });
    await userEvent.click(within(secondFinal).getByRole("button", { name: "공연 취소 확정" }));

    expect(await screen.findByText("취소되었습니다")).toBeInTheDocument();
    expect(screen.getByText("환불 예정액 555,000원")).toBeInTheDocument();
    expect(calls.filter((c) => c === "POST /api/v1/performances/5/cancel")).toHaveLength(1);
  });
});
