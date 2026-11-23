import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me } from "../src/shared/api/types";

/** 업체 가입 1단계 화면 (#26, FR-SUP-01) */

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

afterEach(() => vi.unstubAllGlobals());

/** 화면 검사를 통과하는 칸을 모두 채운다 (약관은 넣지 않는다) */
async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/회사 이메일/), "d@stageduck.test");
  await user.type(screen.getByLabelText(/^비밀번호\*?$/), "duck1234");
  await user.type(screen.getByLabelText(/비밀번호 확인/), "duck1234");
  await user.type(screen.getByLabelText(/담당자 이름/), "이음향");
  await user.type(screen.getByLabelText(/담당자 전화/), "01000000000");
}

describe("업체 가입 1단계 (/signup/supplier)", () => {
  it("빈 칸·틀린 모양은 보내지 않고 칸 아래에 이유를 보인다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } } });
    renderAt("/signup/supplier");
    await user.type(await screen.findByLabelText(/회사 이메일/), "not-an-email");
    await user.type(screen.getByLabelText(/^비밀번호\*?$/), "short");
    await user.type(screen.getByLabelText(/비밀번호 확인/), "short");
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("이메일 형식을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("8자 이상, 영문과 숫자를 함께 써 주세요.", { selector: "p:not([id$=hint])" })).toBeInTheDocument();
    expect(screen.getByText("담당자 이름을 적어 주세요.")).toBeInTheDocument();
    expect(screen.getByText("전화번호는 숫자 9~11자리로 적어 주세요.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("이메일 [중복 확인]을 누르면 바로 이미 가입된 이메일인지 알려 준다", async () => {
    const user = userEvent.setup();
    mockServer({
      "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } },
      "POST /api/v1/auth/check-available": { status: 200, body: { available: false, message: "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요." } },
    });
    renderAt("/signup/supplier");
    await user.type(await screen.findByLabelText(/회사 이메일/), "d@stageduck.test");
    await user.click(screen.getByRole("button", { name: "이메일 중복 확인" }));
    expect(await screen.findByText("이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.")).toBeInTheDocument();
  });

  it("가입하면 서버가 준 첫 화면(입점 신청)으로 간다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "로그인이 필요해요.", fieldErrors: [] } },
      "POST /api/v1/auth/signup/supplier": {
        status: 201,
        body: { id: 7, role: "SUPPLIER", nickname: null, landing: "/supplier/onboarding" },
      },
    }, {
      "POST /api/v1/auth/signup/supplier": { "GET /api/v1/me": { status: 200, body: SUPPLIER } },
    });
    renderAt("/signup/supplier");

    await user.type(await screen.findByLabelText(/회사 이메일/), "d@stageduck.test");
    await user.type(screen.getByLabelText(/^비밀번호\*?$/), "duck1234");
    await user.type(screen.getByLabelText(/비밀번호 확인/), "duck1234");
    await user.type(screen.getByLabelText(/담당자 이름/), "이음향");
    await user.type(screen.getByLabelText(/담당자 전화/), "01000000000");
    await user.click(screen.getByRole("checkbox", { name: /이용약관/ }));
    await user.click(screen.getByRole("checkbox", { name: /개인정보/ }));
    await user.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/supplier/onboarding"));
    const sent = calls.find((c) => c.url.endsWith("/auth/signup/supplier"))!.body as Record<string, unknown>;
    expect(sent).toMatchObject({
      email: "d@stageduck.test",
      name: "이음향",
      agreements: { service: true, privacyRequired: true, marketing: false },
    });
  });

  it("비밀번호 확인이 다르면 보내지 않는다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } } });
    renderAt("/signup/supplier");
    await user.type(await screen.findByLabelText(/^비밀번호\*?$/), "duck1234");
    await user.type(screen.getByLabelText(/비밀번호 확인/), "duck1235");
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByLabelText(/비밀번호 확인/)).toHaveAttribute("aria-invalid", "true");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("서버가 준 칸 오류(이미 가입된 이메일)를 그 칸 아래에 보여 준다", async () => {
    const user = userEvent.setup();
    const msg = "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.";
    mockServer({
      "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } },
      "POST /api/v1/auth/signup/supplier": {
        status: 409,
        body: { code: "EMAIL_TAKEN", message: msg, fieldErrors: [{ field: "email", reason: msg }] },
      },
    });
    renderAt("/signup/supplier");
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "다음" }));
    await waitFor(() => expect(screen.getByLabelText(/회사 이메일/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText(msg).length).toBeGreaterThan(0);
  });
});

describe("업체 가입 — 칸 밖 오류", () => {
  it("필수 약관을 빠뜨리면 서버 문구를 위쪽 안내로 보여 준다", async () => {
    const user = userEvent.setup();
    const msg = "필수 약관에 동의해야 가입할 수 있어요.";
    mockServer({
      "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } },
      "POST /api/v1/auth/signup/supplier": {
        status: 400,
        body: { code: "TERMS_REQUIRED", message: msg, fieldErrors: [{ field: "agreements.service", reason: "필수 약관이에요" }] },
      },
    });
    renderAt("/signup/supplier");
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(msg);
  });
});
