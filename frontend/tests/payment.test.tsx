import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { TERMS } from "../src/features/support/terms";
import type { Me, Order, PerformanceDetail } from "../src/shared/api/types";

/** 통합 청구서·테스트 결제 화면 (#50·#51) — AC-F5-03·05·06·07. 금액은 서버가 준 그대로 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밴드", supplierReviewStatus: null, landing: "/me/performances",
};

const PERF = {
  id: 5, title: "가을밤 밴드 공연", form: "BAND", status: "AWAITING_PAYMENT", showDate: "2026-11-28",
  rehearsalStart: "17:00:00", showStart: "19:00:00", showEnd: "21:00:00", audience: 80,
  sido: "광주광역시", sigungu: "동구", currentVersion: 1,
  stages: [
    { id: 1, stageType: "VENUE", seq: 1, status: "CONFIRMED", quoteCount: 3 },
    { id: 2, stageType: "EQUIPMENT", seq: 2, status: "CONFIRMED", quoteCount: 2 },
    { id: 3, stageType: "ENGINEER", seq: 3, status: "SKIPPED", quoteCount: null },
  ],
  nextAction: "PAY", nextStageId: null, lineup: [], hasContactPhone: true, publishedAt: null,
  needs: {} as PerformanceDetail["needs"],
} as PerformanceDetail;

function order(over: Partial<Order> = {}): Order {
  return {
    id: 9, performanceId: 5, status: "ISSUED", itemsTotal: 1850000, platformFee: 92500, totalAmount: 1942500,
    issuedAt: "2026-11-13T15:05:00", paidAt: null,
    lines: [
      { stageId: 1, stageType: "VENUE", supplierId: 3, companyName: "업체 C", quoteVersionId: 11, amount: 500000, ledgerState: null },
      { stageId: 2, stageType: "EQUIPMENT", supplierId: 4, companyName: "업체 D", quoteVersionId: 12, amount: 1350000, ledgerState: null },
    ],
    ...over,
  };
}

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown; headers: Headers };

function mockServer(routes: Record<string, Reply | (() => Reply)>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
    const route = routes[`${method} ${url}`];
    const r = typeof route === "function" ? route() : route ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  }));
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
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BASE = { "GET /api/v1/me": { status: 200, body: USER }, "GET /api/v1/performances/5": { status: 200, body: PERF } };

afterEach(() => vi.unstubAllGlobals());

describe("통합 청구서 (/performances/:id/order)", () => {
  it("AC-F5-03 청구서가 없으면 발행하고, 서버 금액 그대로 1,942,500원을 보여 준다", async () => {
    const calls = mockServer({ ...BASE, "POST /api/v1/performances/5/order": { status: 201, body: order() } });
    renderAt("/performances/5/order");

    const box = await screen.findByRole("complementary", { name: "결제 정보" });
    expect(within(box).getByText("1,942,500")).toBeInTheDocument();
    expect(screen.getByText("업체 C")).toBeInTheDocument();
    expect(screen.getByText("건너뜀")).toBeInTheDocument();
    expect(screen.getByText("테스트 결제 — 실제 청구되지 않습니다")).toBeInTheDocument();
    const penaltyTable = screen.getByRole("table", { name: "취소 시점별 위약금" });
    expect(within(penaltyTable).getByRole("row", { name: /공연 1일 전 70%/ })).toBeInTheDocument();
    expect(within(penaltyTable).getByRole("row", { name: /결제 전.*없음/ })).toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toContain("POST /api/v1/performances/5/order");
  });

  it("AC-F5-03 필수 동의 두 개를 해야 [결제하기]가 열린다", async () => {
    mockServer({ ...BASE, "GET /api/v1/performances/5/order": { status: 200, body: order() } });
    renderAt("/performances/5/order");

    expect(await screen.findByRole("button", { name: "결제하기" })).toBeDisabled();
    const [transactionCheckbox, cancellationCheckbox] = screen.getAllByRole("checkbox");
    expect(transactionCheckbox).toHaveAccessibleName("서비스 이용·예약·결제 조건 동의 (필수)");
    expect(cancellationCheckbox).toHaveAccessibleName("취소·환불 및 분쟁 문의 확인 (필수)");
    const terms = screen.getByRole("button", { name: "취소·환불 및 분쟁 문의" });
    await userEvent.click(terms);
    const dialog = screen.getByRole("dialog", { name: "취소·환불 및 분쟁 문의" });
    const cancellation = within(dialog);
    const cancellationArticles = cancellation.getAllByRole("article").map((article) => article.id);
    expect(cancellationArticles).toEqual(["service-7", "service-11"]);
    expect(cancellation.getByRole("heading", { name: "부칙" })).toBeInTheDocument();
    expect(cancellation.getByRole("heading", { name: "제7조 (취소와 위약금)" })).toBeInTheDocument();
    expect(cancellation.getByRole("table", { name: "취소 시점별 위약금" })).toBeInTheDocument();
    expect(cancellation.getByText(/다른 업체의 예약은 유지되고/)).toBeInTheDocument();
    expect(cancellation.queryByRole("heading", { name: "제6조 (결제와 보관)" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(dialog).not.toBeInTheDocument();
    expect(terms).toHaveFocus();
    const rulesConsent = screen.getByRole("checkbox", { name: /취소·환불 및 분쟁 문의 확인/ });
    expect(rulesConsent).not.toBeChecked();
    await userEvent.click(rulesConsent);
    expect(rulesConsent).not.toBeChecked();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "이 항목에 동의" }));
    expect(rulesConsent).toBeChecked();
    const paymentConsent = screen.getByRole("checkbox", { name: /서비스 이용·예약·결제 조건 동의/ });
    await userEvent.click(paymentConsent);
    const paymentDialog = screen.getByRole("dialog", { name: "서비스 이용·예약·결제 조건" });
    const payment = within(paymentDialog);
    const paymentArticles = payment.getAllByRole("article").map((article) => article.id);
    expect([...paymentArticles, ...cancellationArticles].sort()).toEqual(
      TERMS.service.chapters.flatMap((chapter) => chapter.articles.map((article) => article.id)).sort(),
    );
    expect(payment.getByRole("heading", { name: "제8조 (하면 안 되는 일)" })).toBeInTheDocument();
    expect(payment.getByRole("heading", { name: "제10조 (게시물)" })).toBeInTheDocument();
    expect(payment.getByRole("heading", { name: "제5조 (요청과 결제 기한)" })).toBeInTheDocument();
    expect(payment.getByRole("heading", { name: "제6조 (결제와 보관)" })).toBeInTheDocument();
    expect(payment.getByText(/공연이 끝나면 업체별로 정산해요/)).toBeInTheDocument();
    expect(payment.queryByRole("table", { name: "취소 시점별 위약금" })).not.toBeInTheDocument();
    await userEvent.click(within(paymentDialog).getByRole("button", { name: "본문 닫기" }));
    expect(paymentConsent).toHaveFocus();
    expect(paymentConsent).not.toBeChecked();
    expect(screen.getByRole("button", { name: "결제하기" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "개인정보 처리방침 보기" }));
    const privacy = within(screen.getByRole("dialog", { name: "개인정보 처리방침" }));
    expect(privacy.getAllByRole("article")).toHaveLength(TERMS.privacy.chapters.flatMap((chapter) => chapter.articles).length);
    expect(privacy.queryByRole("button", { name: "이 항목에 동의" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(paymentConsent);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "이 항목에 동의" }));
    await userEvent.click(screen.getByRole("link", { name: "결제하기" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/performances/5/pay");
  });

  it("확정 안 된 단계가 있으면 서버 문구를 그대로 보여 준다 (AC-F5-04)", async () => {
    mockServer({ ...BASE, "POST /api/v1/performances/5/order": { status: 409, body: { code: "INVALID_STATE", message: "아직 확정하지 않은 단계가 있어요.", fieldErrors: [] } } });
    renderAt("/performances/5/order");
    expect(await screen.findByText("아직 확정하지 않은 단계가 있어요.")).toBeInTheDocument();
  });

  it("AC-F5-07 결제 뒤에는 보관 중, 공연 뒤에는 업체별 정산 예정", async () => {
    mockServer({ ...BASE, "GET /api/v1/performances/5/order": { status: 200, body: order({ status: "SETTLEMENT_SCHEDULED", paidAt: "2026-11-13T15:20:00" }) } });
    renderAt("/performances/5/order");

    const escrow = await screen.findByRole("list", { name: "결제금 상태" });
    expect(within(escrow).getByText("업체 C 500,000원 · 업체 D 1,350,000원")).toBeInTheDocument();
    expect(within(escrow).getByText("11월 13일 15:20")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "결제하기" })).not.toBeInTheDocument();
  });
});

describe("테스트 결제 (/performances/:id/pay)", () => {
  it("AC-F5-06 청구서 금액과 Idempotency-Key 를 보내고, 성공하면 청구서로 돌아간다", async () => {
    const calls = mockServer({
      ...BASE,
      "GET /api/v1/performances/5/order": { status: 200, body: order() },
      "POST /api/v1/orders/9/payments": { status: 200, body: { paymentId: 1, status: "SUCCEEDED", amount: 1942500, orderStatus: "PAID" } },
    });
    renderAt("/performances/5/pay");

    await userEvent.click(await screen.findByRole("button", { name: "1,942,500원 결제" }));

    const payCalls = calls.filter((c) => c.url === "/api/v1/orders/9/payments");
    expect(payCalls).toHaveLength(1);
    expect(payCalls[0].body).toEqual({ amount: 1942500, mockResult: "SUCCESS" });
    expect(payCalls[0].headers.get("Idempotency-Key")).toBeTruthy();
    expect(await screen.findByTestId("where")).toHaveTextContent("/performances/5/order");
  });

  it("AC-F5-05 금액이 다르다는 서버 오류는 그대로 보여 주고, 다시 결제할 수 있다", async () => {
    const keys: string[] = [];
    const calls = mockServer({
      ...BASE,
      "GET /api/v1/performances/5/order": { status: 200, body: order() },
      "POST /api/v1/orders/9/payments": { status: 400, body: { code: "AMOUNT_MISMATCH", message: "결제 금액이 청구서 금액과 달라요.", fieldErrors: [] } },
    });
    renderAt("/performances/5/pay");

    await userEvent.click(await screen.findByRole("button", { name: "1,942,500원 결제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("결제 금액이 청구서 금액과 달라요.");
    await userEvent.click(screen.getByRole("button", { name: "다시 결제" }));
    await userEvent.click(await screen.findByRole("button", { name: "1,942,500원 결제" }));

    calls.filter((c) => c.method === "POST").forEach((c) => keys.push(c.headers.get("Idempotency-Key") ?? ""));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toEqual(keys[1]); // 다시 결제는 새 키
  });
});
