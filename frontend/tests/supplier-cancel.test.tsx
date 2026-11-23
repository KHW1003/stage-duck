import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me } from "../src/shared/api/types";

/** 내 예약 — 업체 사정 취소 (AC-F5-10, D-57 결제 전 업체 취소) */

const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "업체D담당", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

const reservation = (status: string) => ({
  performanceId: 5, title: "가을밤 밴드 공연", showDate: "2026-12-20", showStart: "19:00:00", showEnd: "21:00:00",
  sido: "광주", sigungu: "동구", status, stageTypes: ["EQUIPMENT"], amount: 1350000,
});

function mockServer(status: string, warningCount = 0) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const routes: Record<string, unknown> = {
      "GET /api/v1/me": SUPPLIER,
      "GET /api/v1/supplier/terms-review": { version: "1.0:1.0", reviewed: true },
      "GET /api/v1/supplier/reservations": [reservation(status)],
      "GET /api/v1/supplier/warnings": { warningCount, suspendAt: 3 },
      "POST /api/v1/performances/5/cancel-by-supplier": {
        phase: "SUPPLIER_FAULT", ratePercent: 0, paid: 0, penaltyBase: 0, penaltyTotal: 0, penaltyBySupplier: [],
        feeRefunded: 0, refundTotal: 0, cancellationId: 1,
      },
    };
    const body = routes[key];
    return new Response(JSON.stringify(body ?? { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] }),
      { status: body === undefined ? 404 : 200 });
  }));
  return calls;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("내 예약 — 업체 사정 취소", () => {
  it("D-57 결제 전 취소는 다시 모집·마감 48시간 연장 안내 뒤 사유와 함께 보낸다", async () => {
    const calls = mockServer("AWAITING_PAYMENT");
    renderAt("/supplier/reservations");

    await userEvent.click(await screen.findByRole("button", { name: "업체 사정 취소" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/결제 마감이 48시간 늘어납니다/)).toBeInTheDocument();
    expect(dialog.getByText(/경고 1회로 기록됩니다/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "취소하기" })).toBeDisabled(); // 사유 필수
    await userEvent.type(dialog.getByRole("textbox"), "장비 고장");
    await userEvent.click(dialog.getByRole("button", { name: "취소하기" }));

    const sent = calls.filter((c) => c.key === "POST /api/v1/performances/5/cancel-by-supplier");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ reason: "장비 고장" });
    expect(dialog.queryByText(/바로 이용이 정지/)).not.toBeInTheDocument(); // 경고 0회 — 정지 안내 없음
  });

  it("AC-F5-10 경고 2회인 업체는 이번 취소로 정지된다고 미리 알리고, 취소 뒤 정지 안내를 보여 준다", async () => {
    mockServer("AWAITING_PAYMENT", 2);
    renderAt("/supplier/reservations");

    await userEvent.click(await screen.findByRole("button", { name: "업체 사정 취소" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText(/지금 경고가 2회예요. 이번에 취소하면 3회가 되어 바로 이용이 정지/)).toBeInTheDocument();
    await userEvent.type(dialog.getByRole("textbox"), "장비 고장");
    await userEvent.click(dialog.getByRole("button", { name: "취소하기" }));

    expect(await screen.findByText(/경고가 3회 쌓여 이용이 정지됐어요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인 화면으로" })).toHaveAttribute("href", "/login");
  });

  it("AC-F5-10 결제 후 취소는 전액 환불 안내", async () => {
    mockServer("PAID");
    renderAt("/supplier/reservations");

    await userEvent.click(await screen.findByRole("button", { name: "업체 사정 취소" }));
    expect(within(screen.getByRole("dialog")).getByText(/전액 환불됩니다/)).toBeInTheDocument();
  });

  it("공연이 끝났거나 취소된 예약에는 버튼이 없다", async () => {
    mockServer("COMPLETED");
    renderAt("/supplier/reservations");

    expect(await screen.findByText("가을밤 밴드 공연")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업체 사정 취소" })).not.toBeInTheDocument();
  });
});
