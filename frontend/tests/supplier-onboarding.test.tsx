import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, SupplierApplication } from "../src/shared/api/types";

/** 입점 신청 2단계·심사 상태 화면 (#26) — AC-F1-17, AC-F1-18, AC-F1-20 */

const SUPPLIER: Me = {
  id: 7,
  role: "SUPPLIER",
  status: "ACTIVE",
  email: "d@stageduck.test",
  name: "이음향",
  phone: "01000000000",
  nickname: null,
  supplierReviewStatus: null,
  landing: "/supplier/onboarding",
};

const APPLICATION: SupplierApplication = {
  businessType: "SOLE_PROPRIETOR",
  companyName: "업체 D",
  representativeName: "이음향",
  businessRegNo: "1234567891",
  businessAddress: "광주 북구 가상로 1",
  mainPhone: "0620000000",
  mailOrderNo: null,
  categories: ["EQUIPMENT"],
  reviewStatus: "PENDING",
  rejectReason: null,
  appliedAt: "2026-11-12T14:20:00",
};

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

/** then: 어떤 요청을 받은 뒤 바뀌는 응답 (예: 가입한 뒤에는 /me 가 업체) */
function mockServer(routes: Record<string, Reply>, then: Record<string, Record<string, Reply>> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = `${method} ${url}`;
      const r = routes[key] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      Object.assign(routes, then[key] ?? {});
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
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

const notApplied: Reply = { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };

async function fillBusinessForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^상호|^활동명/), "업체 D");
  await user.type(screen.getByLabelText(/대표자/), "이음향");
  await user.type(screen.getByLabelText(/대표 전화/), "0620000000");
  await user.click(screen.getByRole("checkbox", { name: /음향 장비/ }));
}

afterEach(() => vi.unstubAllGlobals());

describe("입점 신청 2단계 (/supplier/onboarding)", () => {
  it("AC-F1-17 개인(프리랜서)을 고르면 사업자등록번호·사업장 주소 칸이 사라지고 보내지도 않는다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/supplier/application": notApplied,
      "POST /api/v1/supplier/application": { status: 201, body: { ...APPLICATION, businessType: "INDIVIDUAL" } },
    });
    renderAt("/supplier/onboarding");

    expect(await screen.findByLabelText(/^사업자등록번호/)).toBeInTheDocument(); // 처음은 개인사업자
    await user.click(screen.getByRole("radio", { name: /개인 \(프리랜서\)/ }));
    expect(screen.queryByLabelText(/^사업자등록번호/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^사업장 주소/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/활동명/)).toBeInTheDocument();

    await fillBusinessForm(user);
    await user.click(screen.getByRole("button", { name: "심사 신청" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const sent = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(sent.businessType).toBe("INDIVIDUAL");
    expect(sent).not.toHaveProperty("businessRegNo");
    expect(sent).not.toHaveProperty("businessAddress");
  });

  it("AC-F1-18 체크섬이 틀린 번호는 저장되지 않고 서버가 준 이유가 그 칸 아래에 보인다", async () => {
    const user = userEvent.setup();
    const reason = "번호가 맞지 않아요. 등록증의 10자리를 다시 확인해 주세요.";
    mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/supplier/application": notApplied,
      "POST /api/v1/supplier/application": {
        status: 400,
        body: { code: "INVALID_BUSINESS_NO", message: reason, fieldErrors: [{ field: "businessRegNo", reason }] },
      },
    });
    renderAt("/supplier/onboarding");

    await fillBusinessForm(user);
    await user.type(screen.getByLabelText(/^사업자등록번호/), "1234567890");
    await user.type(screen.getByLabelText(/^사업장 주소/), "광주 북구 가상로 1");
    await user.click(screen.getByRole("button", { name: "심사 신청" }));

    const input = screen.getByLabelText(/^사업자등록번호/);
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAccessibleDescription(expect.stringContaining(reason));
    expect(screen.getByRole("button", { name: "심사 신청" })).toBeEnabled(); // 고쳐서 다시 누를 수 있다
  });

  it("AC-F1-20 반려되면 사유가 보이고 고쳐서 다시 신청(PUT)할 수 있다", async () => {
    const user = userEvent.setup();
    const rejected = { ...APPLICATION, reviewStatus: "REJECTED", rejectReason: "사업자등록증 사진이 흐려요" };
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: { ...SUPPLIER, supplierReviewStatus: "REJECTED" } },
      "GET /api/v1/supplier/application": { status: 200, body: rejected },
      "PUT /api/v1/supplier/application": { status: 200, body: APPLICATION },
    });
    renderAt("/supplier/onboarding");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/사업자등록증 사진이 흐려요/)).toBeInTheDocument();
    expect(screen.getByLabelText(/상호/)).toHaveValue("업체 D"); // 전에 낸 내용이 채워져 있다

    await user.clear(screen.getByLabelText(/상호/));
    await user.type(screen.getByLabelText(/상호/), "업체 D 사운드");
    await user.click(screen.getByRole("button", { name: "고쳐서 다시 신청" }));

    expect(await screen.findByText("입점 심사 중이에요")).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT");
    expect((put!.body as Record<string, unknown>).companyName).toBe("업체 D 사운드");
  });

  it("심사 중이면 입력 칸 없이 안내만 보인다", async () => {
    mockServer({
      "GET /api/v1/me": { status: 200, body: { ...SUPPLIER, supplierReviewStatus: "PENDING" } },
      "GET /api/v1/supplier/application": { status: 200, body: APPLICATION },
    });
    renderAt("/supplier/onboarding");
    expect(await screen.findByText("입점 심사 중이에요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "심사 신청" })).not.toBeInTheDocument();
    expect(screen.getByText("업체 D")).toBeInTheDocument();
  });

  it("뮤지션 계정은 입점 화면을 볼 수 없다 (찾을 수 없어요)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: { ...SUPPLIER, role: "USER", nickname: "광주밴드" } } });
    renderAt("/supplier/onboarding");
    expect(await screen.findByRole("heading", { name: "화면을 찾을 수 없어요" })).toBeInTheDocument();
  });
});
