import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { SupplierReservationsPage } from "../src/pages/SupplierReservationsPage";
import type { Me } from "../src/shared/api/types";
import { RequireAuth } from "../src/shared/auth/RequireAuth";
import { AppLayout } from "../src/shared/layout/AppLayout";
import { NotFound } from "../src/shared/layout/NotFound";

const USER: Me = {
  id: 1,
  role: "USER",
  status: "ACTIVE",
  email: "host@stageduck.test",
  name: "시연사용자",
  phone: "01000000000",
  nickname: "광주밴드",
  supplierReviewStatus: null,
  landing: "/me/performances",
};
const SUPPLIER: Me = { ...USER, id: 2, role: "SUPPLIER", nickname: null, name: "업체D담당", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };
const PENDING: Me = { ...SUPPLIER, id: 3, supplierReviewStatus: "PENDING", landing: "/supplier/onboarding" };

type Reply = { status: number; body?: unknown };

/**
 * 주소별로 정해 둔 응답을 돌려주는 가짜 fetch. 부른 주소·메서드를 기록한다.
 * then: 어떤 요청을 받은 뒤 바뀌는 응답 (예: 로그아웃 뒤에는 /me 가 401 — 진짜 서버와 같게)
 */
function mockServer(routes: Record<string, Reply>, then: Record<string, Record<string, Reply>> = {}) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${url}`;
      calls.push({ url, method });
      const r = routes[key] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      Object.assign(routes, then[key] ?? {});
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

const notLoggedIn: Reply = { status: 401, body: { code: "UNAUTHENTICATED", message: "로그인이 필요해요.", fieldErrors: [] } };

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<p>처음 화면</p>} />
            <Route element={<RequireAuth roles={["USER"]} />}>
              <Route path="/me/performances" element={<p>내 공연 화면</p>} />
            </Route>
            <Route element={<RequireAuth roles={["SUPPLIER"]} approvedOnly />}>
              <Route path="/supplier/postings" element={<p>공고 목록 화면</p>} />
              <Route path="/supplier/reservations" element={<SupplierReservationsPage />} />
              <Route path="/supplier/posts" element={<p>내 소개 글 화면</p>} />
            </Route>
            <Route path="/login" element={<Where />} />
            <Route path="/supplier/onboarding" element={<Where />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("레이아웃 머리 메뉴 (역할별)", () => {
  it("방문자는 공간 찾기·업체 찾기와 로그인·가입하기를 본다", async () => {
    mockServer({ "GET /api/v1/me": notLoggedIn });
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "공간 찾기" })).toHaveAttribute("href", "/venues");
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "가입하기" })).toHaveAttribute("href", "/signup");
  });

  it("방문자 메뉴는 목업 v4와 같다 (공간 찾기·업체 찾기·커뮤니티, DESIGN.md 2026-11-18 머리 메뉴 통일)", async () => {
    mockServer({ "GET /api/v1/me": notLoggedIn });
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["공간 찾기", "업체 찾기", "커뮤니티"]);
    expect(within(nav).getByRole("link", { name: "업체 찾기" })).toHaveAttribute("href", "/board");
    expect(within(nav).getByRole("link", { name: "공간 찾기" })).not.toHaveAttribute("aria-current");
  });

  it("지금 화면의 메뉴에는 선택 표시가 켜진다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderAt("/me/performances");
    expect(await screen.findByRole("link", { name: "내 공연" })).toHaveAttribute("aria-current", "page");
  });

  it("사용자는 내 공연 메뉴와 자기 닉네임을 본다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderAt("/");
    expect(await screen.findByRole("link", { name: "내 공연" })).toHaveAttribute("href", "/me/performances");
    expect(screen.getByRole("button", { name: /광주밴드/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("로고를 누르면 메인으로 간다 — 사용자도 내 공연이 아니라 / (11/19 피드백)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderAt("/me/performances");
    const logo = (await screen.findAllByRole("img", { name: "STAGE DUCK" }))[0]; // 머리 로고 (바닥글에도 있다)
    expect(logo.closest("a")).toHaveAttribute("href", "/");
  });

  it("사용자 메뉴·계정 메뉴는 목업 v4(layout.js)와 같은 항목·순서다 (견적함은 계정 메뉴로)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderAt("/");
    await screen.findByRole("button", { name: /광주밴드/ });
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["내 공연", "채팅", "공간 찾기", "업체 찾기", "커뮤니티"]);
    expect(screen.getByRole("button", { name: "알림" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /광주밴드/ }));
    expect(screen.getAllByRole("menuitem").map((a) => a.textContent)).toEqual(["마이페이지", "견적함", "관심 업체", "최종 담당표", "1:1 문의", "알림", "로그아웃"]);
    expect(screen.getByText("사용자 계정")).toBeInTheDocument();
  });

  it("승인 업체는 내 예약에서 맡은 공연과 담당표·현장 준비 링크를 본다", async () => {
    mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/supplier/reservations": {
        status: 200,
        body: [{
          performanceId: 5, title: "가을밤 밴드 공연", showDate: "2026-11-28",
          showStart: "19:00:00", showEnd: "21:00:00", sido: "광주", sigungu: "동구",
          status: "AWAITING_PAYMENT", stageTypes: ["EQUIPMENT"], amount: 420000,
        }],
      },
    });
    renderAt("/");
    await screen.findByRole("button", { name: /업체D담당/ });
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["공고 목록", "내 예약", "채팅", "공간 찾기", "업체 찾기", "커뮤니티"]);
    const reservationLink = within(nav).getByRole("link", { name: "내 예약" });
    await userEvent.click(reservationLink);
    expect(await screen.findByRole("heading", { name: "가을밤 밴드 공연" })).toBeInTheDocument();
    const reservations = within(screen.getByRole("list", { name: "맡은 공연" }));
    expect(reservations.getByText("결제 대기")).toBeInTheDocument();
    expect(reservations.getByText("420,000원")).toBeInTheDocument();
    expect(reservations.getByRole("link", { name: "담당표 보기" })).toHaveAttribute("href", "/performances/5/sheet");
    expect(reservations.getByRole("link", { name: "현장 준비 확인" })).toHaveAttribute("href", "/supplier/tech/5");
    expect(reservationLink).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: /업체D담당/ }));
    expect(screen.getAllByRole("menuitem").map((a) => a.textContent)).toEqual([
      "업체 프로필",
      "내 소개 글",
      "내 예약",
      "받은 견적 요청",
      "1:1 문의",
      "알림",
      "로그아웃",
    ]);
  });

  it("심사 중 업체는 알림 종이 없고 계정 메뉴는 알림·로그아웃뿐이다 (목업)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: PENDING } });
    renderAt("/");
    await userEvent.click(await screen.findByRole("button", { name: /업체D담당/ }));
    expect(screen.queryByRole("button", { name: "알림" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((a) => a.textContent)).toEqual(["알림", "로그아웃"]);
    expect(screen.getByText("업체 계정 · 심사 중")).toBeInTheDocument();
  });

  it("승인된 업체는 업체 색(data-theme=partner)과 공고 목록 메뉴를 본다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER } });
    const { container } = renderAt("/");
    expect(await screen.findByRole("link", { name: "공고 목록" })).toBeInTheDocument();
    expect(container.querySelector('[data-theme="partner"]')).not.toBeNull();
    expect(screen.getByText("파트너")).toBeInTheDocument();
  });

  it("심사 중 업체는 메뉴가 없다 (공고를 볼 수 없다)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: PENDING } });
    renderAt("/");
    await screen.findByRole("button", { name: /업체D담당/ });
    expect(within(screen.getByRole("navigation", { name: "주 메뉴" })).queryAllByRole("link")).toHaveLength(0);
  });

  it("D-41 화면 맨 위에 시뮬레이션 안내 띠를 두지 않는다", async () => {
    mockServer({ "GET /api/v1/me": notLoggedIn });
    renderAt("/");
    await screen.findByText("처음 화면");
    expect(screen.queryByText(/시뮬레이션/)).not.toBeInTheDocument();
  });
});

describe("보호 라우트 (FR-AUTH-07)", () => {
  it("로그인하지 않으면 /login 으로 보내고 돌아올 주소를 기억한다", async () => {
    mockServer({ "GET /api/v1/me": notLoggedIn });
    renderAt("/me/performances");
    expect(await screen.findByTestId("where")).toHaveTextContent("/login?next=%2Fme%2Fperformances");
    expect(screen.queryByText("내 공연 화면")).not.toBeInTheDocument();
  });

  it("로그인한 사용자는 자기 화면을 본다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderAt("/me/performances");
    expect(await screen.findByText("내 공연 화면")).toBeInTheDocument();
  });

  it("다른 역할의 화면은 '찾을 수 없어요'로 숨긴다 (CLAUDE.md 10)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER } });
    renderAt("/me/performances");
    expect(await screen.findByRole("heading", { name: "화면을 찾을 수 없어요" })).toBeInTheDocument();
    expect(screen.queryByText("내 공연 화면")).not.toBeInTheDocument();
    // 목업 v4 error.html 404 와 같은 버튼 두 개 (홈은 계정 종류별 첫 화면)
    expect(screen.getByRole("button", { name: "이전 화면" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute("href", "/supplier/postings");
  });

  it("심사 중 업체가 공고 목록에 오면 입점·심사 화면으로 보낸다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: PENDING } });
    renderAt("/supplier/postings");
    expect(await screen.findByTestId("where")).toHaveTextContent("/supplier/onboarding");
  });

  it("서버 오류(500)는 로그인 화면으로 보내지 않고 오류 화면과 오류 번호를 보여 준다 (목업 v4 error.html)", async () => {
    mockServer({ "GET /api/v1/me": { status: 500, body: { code: "INTERNAL", message: "잠시 뒤 다시 시도해 주세요.", fieldErrors: [], traceId: "req_7f3a2c" } } });
    renderAt("/me/performances");
    expect(await screen.findByRole("heading", { name: "서버에 문제가 생겼어요" })).toBeInTheDocument();
    expect(screen.getByText(/오류 번호 req_7f3a2c/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("이용 정지 계정은 로그인 화면 대신 정지 안내를 본다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: { ...USER, status: "SUSPENDED" } } });
    renderAt("/me/performances");
    expect(await screen.findByRole("heading", { name: "이용이 정지된 계정이에요" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("link", { name: "1:1 문의" })).toHaveAttribute("href", "/inquiries/new");
  });

  it("인터넷이 끊기면 연결 끊김 화면을 덮고, 다시 연결되면 쓰던 화면이 그대로 남아 있다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderAt("/community");
    await screen.findByRole("button", { name: /광주밴드/ });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("heading", { name: "인터넷 연결이 끊겼어요" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("heading", { name: "인터넷 연결이 끊겼어요" })).not.toBeInTheDocument();
  });
});

describe("로그아웃 (AC-F1-12 화면 부분)", () => {
  it("로그아웃하면 서버에 POST 하고, 남은 내 정보를 지우고 /login 으로 간다", async () => {
    const calls = mockServer(
      { "GET /api/v1/me": { status: 200, body: USER }, "POST /api/v1/auth/logout": { status: 204 } },
      { "POST /api/v1/auth/logout": { "GET /api/v1/me": notLoggedIn } },
    );
    renderAt("/me/performances");
    await userEvent.click(await screen.findByRole("button", { name: /광주밴드/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "로그아웃" }));
    expect(await screen.findByTestId("where")).toHaveTextContent("/login");
    // 보던 화면(?next=)을 달고 가지 않는다 — 다음 사람이 로그인하면 앞사람 화면으로 가는 문제 (E2E 로 찾음)
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/login$/));
    expect(calls).toContainEqual({ url: "/api/v1/auth/logout", method: "POST" });
    await waitFor(() => expect(screen.queryByText("광주밴드")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByText("내 공연 화면")).not.toBeInTheDocument();
  });
});
