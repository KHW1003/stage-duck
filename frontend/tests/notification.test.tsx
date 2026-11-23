import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { NotificationItem } from "../src/features/notification/api";
import { NotificationList } from "../src/features/notification/NotificationList";
import type { Me } from "../src/shared/api/types";

/** 사이트 안 알림 화면 (#45, specs/notifications.md 6장) */

const USER: Me = {
  id: 12, role: "USER", status: "ACTIVE", email: "u@stageduck.test", name: "김사용", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};

const now = new Date();
const ago = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
function item(id: number, title: string, extra: Partial<NotificationItem> = {}): NotificationItem {
  return { id, type: "QUOTE_RECEIVED", category: "QUOTE_CHAT", title, body: "장비 · 1,250,000원", link: "/faq", read: false, createdAt: ago(0.2), ...extra };
}

type Reply = { status: number; body?: unknown };
type Call = { key: string; body: unknown };

function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[key];
      const r = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
      if (!r && url === "/api/v1/chat-rooms") return new Response("[]", { status: 200 });
      const reply = r ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status });
    }),
  );
  return calls;
}

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {}
  close() {}
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.stubGlobal("WebSocket", FakeSocket));
afterEach(() => vi.unstubAllGlobals());

const ME = { "GET /api/v1/me": { status: 200, body: USER } };

describe("머리 알림 종", () => {
  it("안 읽은 수 배지, 누르면 최근 5개 + [모두 읽음] → POST read {all}", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 7 }, (_, i) => item(20 - i, `알림 ${i + 1}`));
    const calls = mockServer({
      ...ME,
      "GET /api/v1/me/notifications/unread-count": [{ status: 200, body: { count: 7 } }, { status: 200, body: { count: 0 } }],
      "GET /api/v1/me/notifications": { status: 200, body: { items, nextBefore: null, unreadCount: 7 } },
      "POST /api/v1/me/notifications/read": { status: 204 },
    });
    renderAt("/faq");
    expect(await screen.findByLabelText("안 읽은 알림 7개")).toHaveTextContent("7");
    await user.click(screen.getAllByRole("button", { name: "알림" })[0]);
    const panel = await screen.findByRole("dialog", { name: "알림" });
    const list = await within(panel).findByRole("list", { name: "최근 알림" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    await user.click(within(panel).getByRole("button", { name: "모두 읽음" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/v1/me/notifications/read")?.body).toEqual({ all: true }));
    await waitFor(() => expect(screen.queryByLabelText(/안 읽은 알림/)).not.toBeInTheDocument());
  });

  it("99개가 넘으면 99+", async () => {
    mockServer({ ...ME, "GET /api/v1/me/notifications/unread-count": { status: 200, body: { count: 130 } } });
    renderAt("/faq");
    expect(await screen.findByLabelText("안 읽은 알림 130개")).toHaveTextContent("99+");
  });
});

describe("알림 누르기", () => {
  function Where() {
    const l = useLocation();
    return <p data-testid="where">{l.pathname + l.search}</p>;
  }
  function renderList(items: NotificationItem[]) {
    return render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/me/performances"]}>
          <NotificationList items={items} label="알림 목록" />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("안 읽은 알림은 읽음 처리 후 링크로, 채팅 알림은 지금 화면에 ?chat= 을 붙여 채팅 창을 연다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ "POST /api/v1/me/notifications/read": { status: 204 } });
    renderList([item(1, "업체 D가 견적서를 보냈어요", { link: "/performances/5/compare" }), item(2, "가을밤밴드님이 채팅을 시작했어요", { link: "/chats/31", read: true })]);

    await user.click(screen.getByRole("button", { name: /업체 D가 견적서를 보냈어요/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/performances/5/compare");
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/v1/me/notifications/read")?.body).toEqual({ ids: [1] }));

    await user.click(screen.getByRole("button", { name: /채팅을 시작했어요/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/performances/5/compare?chat=31");
    expect(calls.filter((c) => c.key === "POST /api/v1/me/notifications/read")).toHaveLength(1); // 이미 읽은 것은 다시 보내지 않는다
  });
});

describe("알림 화면 (/notifications)", () => {
  it("오늘 / 이전 묶음, 분류 탭을 누르면 category 로 다시 받고, [더 보기]는 before", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/me/notifications/unread-count": { status: 200, body: { count: 1 } },
      "GET /api/v1/me/notifications": {
        status: 200,
        body: { items: [item(9, "오늘 온 알림"), item(8, "지난주 알림", { createdAt: ago(24 * 7), read: true })], nextBefore: 8, unreadCount: 1 },
      },
      "GET /api/v1/me/notifications?before=8": { status: 200, body: { items: [item(3, "아주 예전 알림", { createdAt: ago(24 * 30), read: true })], nextBefore: null, unreadCount: 1 } },
      "GET /api/v1/me/notifications?category=OFFER": {
        status: 200,
        body: { items: [item(5, "견적 요청을 받았어요", { category: "OFFER", type: "OFFER_RECEIVED" })], nextBefore: null, unreadCount: 1 },
      },
    });
    renderAt("/notifications");
    expect(await screen.findByRole("list", { name: "오늘 알림" })).toHaveTextContent("오늘 온 알림");
    expect(screen.getByRole("list", { name: "이전 알림" })).toHaveTextContent("지난주 알림");
    expect(within(screen.getByRole("list", { name: "오늘 알림" })).getByLabelText("안 읽음")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "더 보기" }));
    expect(await screen.findByText("아주 예전 알림")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();

    const tabs = screen.getByRole("group", { name: "알림 분류" });
    await user.click(within(tabs).getByRole("button", { name: "견적 요청" }));
    expect(await screen.findByText("견적 요청을 받았어요")).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: "견적 요청" })).toHaveAttribute("aria-pressed", "true");
    expect(calls.some((c) => c.key === "GET /api/v1/me/notifications?category=OFFER")).toBe(true);
  });

  it("알림이 없으면 빈 화면", async () => {
    mockServer({
      ...ME,
      "GET /api/v1/me/notifications": { status: 200, body: { items: [], nextBefore: null, unreadCount: 0 } },
    });
    renderAt("/notifications");
    expect(await screen.findByText("새 알림이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모두 읽음" })).not.toBeInTheDocument();
  });
});

describe("메일로도 받기 (notifications.md 10장)", () => {
  it("알림 화면 아래에서 메일 알림을 끄면 PUT emailEnabled=false", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/me/notifications/unread-count": { status: 200, body: { count: 0 } },
      "GET /api/v1/me/notifications": { status: 200, body: { items: [], nextBefore: null, unreadCount: 0 } },
      "GET /api/v1/me/notifications/settings": { status: 200, body: { emailEnabled: true, email: "host@example.com" } },
      "PUT /api/v1/me/notifications/settings": { status: 200, body: { emailEnabled: false, email: "host@example.com" } },
    });
    renderAt("/notifications");
    const toggle = await screen.findByRole("switch", { name: "중요한 알림은 메일로도 받기" });
    expect(toggle).toBeChecked();
    expect(screen.getByText("host@example.com")).toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /api/v1/me/notifications/settings")?.body).toEqual({ emailEnabled: false }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "중요한 알림은 메일로도 받기" })).not.toBeChecked());
  });
});
