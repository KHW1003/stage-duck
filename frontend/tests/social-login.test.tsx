import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";

/** 네이버 로그인·카카오(기본 꺼짐)·소셜 추가 정보 화면 — AC-F1-04~10 (목업 v4 login·signup 의 social 모드, 이슈 #25) */

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = routes[`${method} ${url}`] ?? { status: 401, body: { code: "UNAUTHENTICATED", message: "로그인이 필요해요. 다시 로그인해 주세요.", fieldErrors: [] } };
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const PENDING = "GET /api/v1/auth/social/pending";
const COMPLETE = "POST /api/v1/auth/social/complete";
const PREFILL = { provider: "NAVER", email: "naver1@stageduck.test", name: "김덕구", phone: "01000000000", birthDate: "1999-03-02", nickname: "덕구밴드" };
const DONE = { id: 9, role: "USER", nickname: "덕구밴드", landing: "/me/performances" };
const err = (code: string, message: string, fieldErrors: { field: string; reason: string }[] = []) => ({ code, message, fieldErrors });

async function agreeRequired() {
  await userEvent.click(screen.getByLabelText("STAGE DUCK 이용약관 (필수)"));
  await userEvent.click(screen.getByLabelText(/개인정보 수집·이용 \(필수\)/));
}

describe("로그인 화면의 간편 로그인 (/login)", () => {
  it("AC-F1-04 [네이버로 로그인]은 서버의 네이버 로그인 시작 주소로 간다", () => {
    mockServer({});
    renderAt("/login");
    expect(screen.getByRole("link", { name: /네이버로 로그인/ })).toHaveAttribute("href", "/api/v1/auth/naver/start");
  });

  it("AC-F1-08 카카오가 꺼져 있으면(기본) 카카오 버튼이 없다", () => {
    mockServer({});
    renderAt("/login");
    expect(screen.queryByRole("link", { name: /카카오로 로그인/ })).toBeNull();
  });

  it("AC-F1-09 카카오를 켜면 카카오 버튼이 서버의 카카오 로그인 시작 주소로 간다", () => {
    vi.stubEnv("VITE_KAKAO_LOGIN_ENABLED", "true");
    mockServer({});
    renderAt("/login");
    expect(screen.getByRole("link", { name: /카카오로 로그인/ })).toHaveAttribute("href", "/api/v1/auth/kakao/start");
  });

  it("AC-F1-04 소셜 로그인을 마치지 못하고 돌아오면(?social=failed) 안내가 보인다", () => {
    mockServer({});
    renderAt("/login?social=failed");
    expect(screen.getByRole("alert")).toHaveTextContent("간편 로그인을 마치지 못했어요");
  });
});

describe("소셜 추가 정보 (/signup/extra)", () => {
  it("AC-F1-06 소셜에서 받은 값이 미리 채워지고, 고친 값으로 가입한다 (비밀번호는 받지 않는다)", async () => {
    const calls = mockServer({ [PENDING]: { status: 200, body: PREFILL }, [COMPLETE]: { status: 201, body: DONE } });
    renderAt("/signup/extra");

    expect(await screen.findByRole("heading", { name: "추가 정보 입력" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("김덕구"));
    expect(screen.getByLabelText("이메일")).toHaveValue("naver1@stageduck.test");
    expect(screen.getByLabelText("전화번호")).toHaveValue("01000000000");
    expect(screen.getByLabelText("생년월일")).toHaveValue("1999-03-02");
    expect(screen.getByLabelText("닉네임")).toHaveValue("덕구밴드");
    expect(screen.queryByLabelText("비밀번호")).toBeNull();
    expect(screen.queryByLabelText("비밀번호 확인")).toBeNull();

    await userEvent.clear(screen.getByLabelText("이름"));
    await userEvent.type(screen.getByLabelText("이름"), "김덕구수정");
    await agreeRequired();
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("가입이 완료됐어요")).toBeInTheDocument();
    const sent = calls.find((c) => c.method === "POST")!;
    expect(sent.url).toBe("/api/v1/auth/social/complete");
    expect(sent.body).toMatchObject({ name: "김덕구수정", email: "naver1@stageduck.test", phone: "01000000000", birthDate: "1999-03-02", nickname: "덕구밴드" });
    expect(sent.body).not.toHaveProperty("password");
  });

  it("AC-F1-05 선택 동의를 해제해 생일·별명이 비어 오면, 직접 입력해서 가입한다", async () => {
    const calls = mockServer({ [PENDING]: { status: 200, body: { ...PREFILL, birthDate: null, nickname: null } }, [COMPLETE]: { status: 201, body: DONE } });
    renderAt("/signup/extra");
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("김덕구"));
    expect(screen.getByLabelText("생년월일")).toHaveValue("");
    expect(screen.getByLabelText("닉네임")).toHaveValue("");

    await agreeRequired();
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(screen.getByText("생년월일을 적어 주세요.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await userEvent.type(screen.getByLabelText("생년월일"), "1999-03-02");
    await userEvent.type(screen.getByLabelText("닉네임"), "직접쓴닉네임");
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    await screen.findByText("가입이 완료됐어요");
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ birthDate: "1999-03-02", nickname: "직접쓴닉네임" });
  });

  it("AC-F1-07 우리 약관에 동의하지 않으면 가입 요청을 보내지 않는다", async () => {
    const calls = mockServer({ [PENDING]: { status: 200, body: PREFILL } });
    renderAt("/signup/extra");
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("김덕구"));
    expect(screen.getByText(/네이버 동의와 따로 STAGE DUCK 약관에 동의해야 가입이 끝나요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("필수 약관에 동의해 주세요.");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("AC-F1-10 같은 이메일 계정이 있으면 서버가 알려 준 이유를 이메일 칸 아래에 보여 준다", async () => {
    mockServer({
      [PENDING]: { status: 200, body: PREFILL },
      [COMPLETE]: { status: 409, body: err("EMAIL_TAKEN", "이미 가입된 이메일이에요.", [{ field: "email", reason: "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요." }]) },
    });
    renderAt("/signup/extra");
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("김덕구"));
    await agreeRequired();
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(await screen.findByText("이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
  });

  it("임시 가입 정보가 없거나 10분이 지나면 다시 로그인하라고 안내한다", async () => {
    mockServer({});
    renderAt("/signup/extra");
    expect(await screen.findByText("로그인이 필요해요. 다시 로그인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다시 로그인하기" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "가입하기" })).toBeNull();
  });
});
