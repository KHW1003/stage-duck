import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me } from "../src/shared/api/types";

/** 메일의 채팅 링크 /chats/{방번호} (#45 메일, D-42 채팅 창) */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = { ...USER, id: 7, role: "SUPPLIER", nickname: null, name: "업체 D", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };
const ADMIN: Me = { ...USER, id: 9, role: "ADMIN", landing: "/admin" };

function setup(path: string, first: Me | null) {
  let me = first;
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    if (url.endsWith("/auth/login")) me = USER;
    const ok: Record<string, unknown> = { "/api/v1/me": me, "/api/v1/auth/login": { landing: USER.landing }, "/api/v1/chat-rooms": [] };
    if (ok[url]) return new Response(JSON.stringify(ok[url]), { status: 200 });
    return new Response(JSON.stringify({ code: "X", message: "", fieldErrors: [] }), { status: url === "/api/v1/me" ? 401 : 404 });
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return urls;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const where = () => screen.getByTestId("where").textContent;

afterEach(() => vi.unstubAllGlobals());

it.each([["사용자", USER, "/me/performances"], ["업체", SUPPLIER, "/partner"]] as const)("메일 채팅 링크: %s는 첫 화면에서 그 방의 채팅 창이 열린다", async (_, me, home) => {
  const urls = setup("/chats/31", me);
  expect(await screen.findByRole("dialog", { name: "채팅" })).toBeInTheDocument();
  await waitFor(() => expect(where()).toBe(home));
  await waitFor(() => expect(urls).toContain("/api/v1/chat-rooms/31/messages"));
});

it("메일 채팅 링크: 로그인 안 했으면 로그인 뒤 그 채팅이 열린다", async () => {
  const urls = setup("/chats/31", null);
  await waitFor(() => expect(where()).toBe("/login?next=%2Fchats%2F31"));
  await userEvent.type(screen.getByLabelText("이메일"), "a@stageduck.test");
  await userEvent.type(screen.getByLabelText("비밀번호"), "test-pass-1");
  await userEvent.click(screen.getByRole("button", { name: "로그인" }));
  expect(await screen.findByRole("dialog", { name: "채팅" })).toBeInTheDocument();
  expect(where()).toBe("/me/performances");
  await waitFor(() => expect(urls).toContain("/api/v1/chat-rooms/31/messages"));
});

it.each(["abc", "0", "-1", "1.5", "9999999999999999999"])("메일 채팅 링크: 번호가 아닌 값(%s)은 첫 화면만 연다", async (id) => {
  setup(`/chats/${id}`, USER);
  await waitFor(() => expect(where()).toBe("/me/performances"));
  expect(screen.queryByRole("dialog", { name: "채팅" })).not.toBeInTheDocument();
});

it("메일 채팅 링크: 관리자에게는 없는 화면이다", async () => {
  setup("/chats/31", ADMIN);
  expect(await screen.findByText("화면을 찾을 수 없어요")).toBeInTheDocument();
});
