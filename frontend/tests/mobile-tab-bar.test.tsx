import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HomeLayout } from "../src/features/home/HomeLayout";
import type { Me } from "../src/shared/api/types";
import { AppLayout } from "../src/shared/layout/AppLayout";

/** 모바일(560px 이하) 아래 탭 + 글자 로고 머리 */

const USER: Me = {
  id: 1, role: "USER", status: "ACTIVE", email: "host@stageduck.test", name: "시연사용자", phone: "01000000000",
  nickname: "광주밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = { ...USER, id: 2, role: "SUPPLIER", nickname: null, name: "업체D담당", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };
const PENDING: Me = { ...SUPPLIER, id: 3, supplierReviewStatus: "PENDING", landing: "/supplier/onboarding" };
const ADMIN: Me = { ...USER, id: 4, role: "ADMIN", nickname: null, name: "관리자", landing: "/admin" };

function mockServer(me: Me | null) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    const body: Record<string, unknown> = { "/api/v1/me": me, "/api/v1/me/notifications/unread-count": { count: 28 }, "/api/v1/chat-rooms": [] };
    if (url === "/api/v1/me" && !me) return new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "", fieldErrors: [] }), { status: 401 });
    return new Response(JSON.stringify(body[url] ?? { code: "NOT_FOUND", message: "", fieldErrors: [] }), { status: url in body ? 200 : 404 });
  }));
  return urls;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function renderAt(path: string, mobile = true) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: mobile && query.includes("560px"), addEventListener() {}, removeEventListener() {} }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<HomeLayout />}>
            <Route path="/" element={<Where />} />
            <Route path="/partner" element={<Where />} />
          </Route>
          <Route element={<AppLayout />}>
            <Route path="*" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const bar = () => screen.findByRole("navigation", { name: "아래 메뉴" });
const items = (el: HTMLElement) => [...el.querySelectorAll("a, button")].map((x) => x.lastChild?.textContent);
const links = (el: HTMLElement) => within(el).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

describe("모바일 아래 탭", () => {
  it.each(["/", "/venues"])("손님 %s: 홈·찾기·커뮤니티·로그인, 찾기 판에 업체 입점 길", async (path) => {
    mockServer(null);
    renderAt(path);
    const nav = await bar();
    expect(items(nav)).toEqual(["홈", "찾기", "커뮤니티", "로그인"]);
    await userEvent.click(within(nav).getByRole("button", { name: "찾기" }));
    expect(links(screen.getByRole("dialog", { name: "찾기" }))).toEqual([["공간 찾기", "/venues"], ["업체 찾기", "/board"], ["업체신가요?", "/partner"]]);
  });

  it("사용자: 마이 판 맨 위는 내 공연, 안 읽은 수는 한 번만 부른다", async () => {
    const urls = mockServer(USER);
    renderAt("/mypage");
    const nav = await bar();
    expect(items(nav)).toEqual(["홈", "찾기", "채팅", "알림", "마이"]);
    expect(await within(nav).findByLabelText("안 읽은 알림 28개")).toBeInTheDocument();
    expect(urls.filter((u) => u.includes("unread-count"))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith("/chat-rooms"))).toHaveLength(1);
    expect(within(nav).getByRole("button", { name: "마이" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("button", { name: "마이" }));
    const sheet = screen.getByRole("dialog", { name: "마이" });
    expect(links(sheet)).toEqual([
      ["내 공연", "/me/performances"], ["마이페이지", "/mypage"], ["관심 업체", "/favorites"], ["1:1 문의", "/inquiries"], ["커뮤니티", "/community"],
    ]);
    expect(within(sheet).getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("업체: 공고 목록·내 예약이 맨 위, 마이페이지는 없고 업체 메인이 있다", async () => {
    mockServer(SUPPLIER);
    renderAt("/supplier/postings");
    await userEvent.click(within(await bar()).getByRole("button", { name: "마이" }));
    expect(links(screen.getByRole("dialog", { name: "마이" }))).toEqual([
      ["공고 목록", "/supplier/postings"], ["내 예약", "/supplier/reservations"], ["업체 프로필", "/supplier/profile"], ["내 소개 글", "/supplier/posts"],
      ["받은 견적 요청", "/supplier/offers"], ["1:1 문의", "/inquiries"], ["커뮤니티", "/community"], ["업체 메인", "/partner"],
    ]);
  });

  it("심사 중 업체: 지금 갈 수 있는 곳만, 안 읽은 수를 부르지 않는다", async () => {
    const urls = mockServer(PENDING);
    renderAt("/supplier/onboarding");
    const nav = await bar();
    expect(items(nav)).toEqual(["홈", "알림", "마이"]);
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/partner");
    await userEvent.click(within(nav).getByRole("button", { name: "마이" }));
    expect(within(screen.getByRole("dialog", { name: "마이" })).queryAllByRole("link")).toHaveLength(0);
    expect(urls.some((u) => u.includes("unread-count") || u.includes("chat-rooms"))).toBe(false);
  });

  it("561px 이상과 관리자에게는 탭이 없다", async () => {
    mockServer(USER);
    const a = renderAt("/venues", false);
    await screen.findByRole("button", { name: /광주밴드/ });
    expect(screen.queryByRole("navigation", { name: "아래 메뉴" })).not.toBeInTheDocument();
    a.unmount();
    mockServer(ADMIN);
    renderAt("/venues");
    await screen.findByRole("button", { name: /관리자/ });
    expect(screen.queryByRole("navigation", { name: "아래 메뉴" })).not.toBeInTheDocument();
  });

  it("판은 Esc·바깥 누르기·화면 옮기기로 닫히고 초점이 탭으로 돌아온다", async () => {
    mockServer(null);
    renderAt("/venues");
    const find = within(await bar()).getByRole("button", { name: "찾기" });
    await userEvent.click(find);
    expect(screen.getByRole("dialog", { name: "찾기" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(find).toHaveFocus();
    await userEvent.click(find);
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(find);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "업체 찾기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("where")).toHaveTextContent("/board");
  });

  it("채팅 탭은 지금 화면의 검색 조건을 지우지 않고 채팅 창을 연다", async () => {
    mockServer(USER);
    renderAt("/venues?sido=광주");
    await userEvent.click(within(await bar()).getByRole("button", { name: /채팅/ }));
    expect(await screen.findByRole("dialog", { name: "채팅" })).toBeInTheDocument();
    expect(new URLSearchParams(screen.getByTestId("where").textContent!.split("?")[1]).get("sido")).toBe("광주");
  });
});

describe("모바일 머리", () => {
  it.each(["/", "/partner", "/venues"])("%s: 아래로 내리면 숨고, 올리거나 맨 위면 다시, 초점이 안에 있으면 숨지 않는다", async (path) => {
    mockServer(null);
    renderAt(path);
    await bar();
    const header = screen.getByRole("banner");
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 5000, configurable: true });
    const scroll = (y: number) =>
      act(() => {
        Object.defineProperty(window, "scrollY", { value: y, configurable: true });
        window.dispatchEvent(new Event("scroll"));
      });
    scroll(300);
    expect(header).toHaveAttribute("data-scroll-hidden", "true");
    scroll(250);
    expect(header).not.toHaveAttribute("data-scroll-hidden");
    scroll(400);
    expect(header).toHaveAttribute("data-scroll-hidden", "true");
    scroll(0);
    expect(header).not.toHaveAttribute("data-scroll-hidden");
    const logo = within(header).getAllByRole("link")[0];
    expect(logo).toHaveAttribute("href", "/");
    act(() => logo.focus());
    scroll(400);
    expect(header).not.toHaveAttribute("data-scroll-hidden");
  });
});
