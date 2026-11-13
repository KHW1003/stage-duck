import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { StatusBadge } from "../src/shared/StatusBadge";
import { ApiError, api } from "../src/shared/api/client";

function renderApp(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("공통 화면", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", env: "test", simulation: true }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("NFR-UX-05 모든 화면에 시뮬레이션 안내가 보인다", () => {
    renderApp("/");
    expect(screen.getByRole("note")).toHaveTextContent("포트폴리오 시뮬레이션");
    renderApp("/없는-페이지");
    expect(screen.getAllByRole("note")).toHaveLength(2);
  });

  it("서버 상태를 불러와 보여준다", async () => {
    renderApp("/");
    expect(await screen.findByText(/정상 \(test\)/)).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("NFR-UX-02 검사 결과를 색과 함께 글자로 보여준다", () => {
    render(<StatusBadge result="CONFLICT" />);
    expect(screen.getByRole("status")).toHaveTextContent("충돌");
  });
});

describe("api 클라이언트", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("공통 오류 형식을 ApiError 로 던진다", async () => {
    const body = { code: "STAGE_NOT_OPEN", message: "아직 열리지 않았어요.", fieldErrors: [] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 409 })));
    await expect(api("/stages/1/quotes", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 409,
      body: { code: "STAGE_NOT_OPEN" },
    });
    await expect(api("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("상태를 바꾸는 요청에 CSRF 헤더와 멱등 키를 붙인다", async () => {
    document.cookie = "csrf_token=abc123";
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await api("/orders/1/payments", { method: "POST", body: "{}", idempotencyKey: "k-1" });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.get("X-CSRF-Token")).toBe("abc123");
    expect(headers.get("Idempotency-Key")).toBe("k-1");
  });
});
