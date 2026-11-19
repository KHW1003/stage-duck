import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me } from "../src/shared/api/types";
import { socketTiming } from "../src/shared/chat/useChatSocket";

/**
 * 메인(/)·업체 메인(/partner)에도 채팅 위젯 (D-42) — HomeLayout 이 AppLayout 과 같은 조건으로 띄운다.
 * 사용자·승인 업체만 보이고, 방문자·심사 중 업체·관리자에게는 없다.
 */

const USER: Me = {
  id: 12, role: "USER", status: "ACTIVE", email: "u@stageduck.test", name: "김사용", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "이음향", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};
const REVIEWING: Me = { ...SUPPLIER, supplierReviewStatus: "PENDING" };
const ADMIN: Me = { ...USER, id: 1, role: "ADMIN", nickname: null, landing: "/admin" };

/** /me 만 정해 두고 나머지는 빈 목록·404 (메인 화면의 다른 부분은 이 테스트가 보지 않는다) */
function mockServer(me: Me | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/v1/me") {
        return me
          ? new Response(JSON.stringify(me), { status: 200 })
          : new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "", fieldErrors: [] }), { status: 401 });
      }
      if (url === "/api/v1/chat-rooms") return new Response("[]", { status: 200 });
      return new Response(JSON.stringify({ code: "NOT_FOUND", message: "", fieldErrors: [] }), { status: 404 });
    }),
  );
}

/** 받기 전용 가짜 WebSocket — 위젯이 열 때 실제로 연결하지 않게 */
class FakeSocket {
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = 0;
  constructor(public url: string) {}
  close() {
    this.readyState = 3;
  }
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  socketTiming.retryMs = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("메인 화면의 채팅 위젯", () => {
  it.each([
    ["사용자", "/", USER],
    ["승인 업체", "/partner", SUPPLIER],
  ])("%s는 %s 에서도 채팅 버튼이 보인다", async (_, path, me) => {
    mockServer(me);
    renderAt(path);
    expect(await screen.findByRole("button", { name: /채팅 열기/ })).toBeInTheDocument();
  });

  it.each([
    ["방문자", "/", null, "guest"],
    ["심사 중 업체", "/partner", REVIEWING, "partner-review"],
    ["관리자", "/", ADMIN, "admin"],
  ])("%s는 %s 에서 채팅 버튼이 없다", async (_, path, me, kind) => {
    mockServer(me);
    const { container } = renderAt(path);
    // 내 정보를 받아 레이아웃이 그 계정 종류로 바뀐 뒤에 본다 (기다리는 시간에 기대지 않게)
    await waitFor(() => expect(container.querySelector(`[data-layout="${kind}"]`)).not.toBeNull());
    expect(screen.queryByRole("button", { name: /채팅 열기/ })).toBeNull();
  });
});
