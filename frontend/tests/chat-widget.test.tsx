import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { ChatMessageOut, ChatRoom, Me } from "../src/shared/api/types";
import { socketTiming } from "../src/shared/chat/useChatSocket";

/**
 * 떠 있는 채팅 위젯 (T3-02 #42 화면) — AC-F3-06·07·08·15·26·27
 * 서버 /ws 는 아직 머지 전이라 api-contract.md 7장 모양대로 가짜 WebSocket 으로 시험한다.
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

function room(roomId: number, partnerName: string, lastId: number, body: string | null, extra: Partial<ChatRoom> = {}): ChatRoom {
  return {
    roomId, stageId: 2, stageType: "EQUIPMENT", performanceId: 5, partnerName,
    startedAt: "2026-11-12T10:00:00+09:00", pinnedAt: null, unreadCount: 0,
    lastMessage: { id: lastId, type: body === null ? "QUOTE" : "TEXT", body, createdAt: "2026-11-13T13:24:00+09:00" },
    ...extra,
  };
}

/** 서버 정렬 (고정 먼저 → 최근 대화순): 고정 E·C, 나머지 D·A */
const ROOMS: ChatRoom[] = [
  room(32, "업체 E", 110, "설치 시간 확인했어요", { pinnedAt: "2026-11-12T11:00:00+09:00" }),
  room(33, "업체 C", 90, "공간 사진 보내 드려요", { stageType: "VENUE", stageId: 1, pinnedAt: "2026-11-12T12:00:00+09:00" }),
  room(31, "업체 D", 120, "드럼 마이크도 추가돼요?", { unreadCount: 1 }),
  room(34, "업체 A", 80, null, { startedAt: null }),
];

function msg(id: number, sender: number | null, body: string | null, extra: Partial<ChatMessageOut> = {}): ChatMessageOut {
  return {
    id, type: "TEXT", body, senderUserId: sender, refId: null, contactWarning: false,
    createdAt: "2026-11-13T13:20:00+09:00", attachmentUrl: null, ...extra,
  };
}

const THREAD_31 = {
  messages: [
    msg(114, null, null, { type: "QUOTE", refId: 501 }),
    msg(115, 7, null, { type: "IMAGE" }),
    msg(116, 7, null, { type: "IMAGE", attachmentUrl: "/api/v1/files/9/raw" }),
    msg(117, 7, "010-0000-0000 으로 연락 주세요", { contactWarning: true }),
    msg(119, 12, "안녕하세요"),
    msg(120, 7, "드럼 마이크도 추가돼요?"),
  ],
  partnerLastReadMessageId: 119,
};

/** wait 가 있으면 그 약속이 풀릴 때까지 답을 미룬다 (올리는 중 표시 확인용) */
type Reply = { status: number; body?: unknown; wait?: Promise<unknown> };
type Call = { key: string; body: unknown };

/** FormData 는 { 이름: 글 또는 파일 이름 } 으로 적어 둔다 */
function parseBody(body: BodyInit | null | undefined): unknown {
  if (!body) return undefined;
  if (body instanceof FormData) {
    return Object.fromEntries([...body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
  }
  return JSON.parse(String(body));
}

/** 같은 주소에 여러 번 답할 때는 배열로 순서대로 */
function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${url}`;
      calls.push({ key, body: parseBody(init?.body) });
      const route = routes[key];
      const r = Array.isArray(route) ? route.shift() : route;
      if (r?.wait) await r.wait;
      const reply = r ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status });
    }),
  );
  return calls;
}

/** 받기 전용 가짜 WebSocket (api-contract.md 7장 { type, data }) */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = 0;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    act(() => {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    });
  }
  emit(type: string, data: unknown) {
    act(() => this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ type, data }) })));
  }
  drop() {
    act(() => {
      this.readyState = 3;
      this.onclose?.(new CloseEvent("close"));
    });
  }
}
const lastSocket = () => FakeSocket.all[FakeSocket.all.length - 1];

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

const AS_USER = {
  "GET /api/v1/me": { status: 200, body: USER },
  "GET /api/v1/chat-rooms": { status: 200, body: ROOMS },
  "GET /api/v1/chat-rooms/31/messages": { status: 200, body: THREAD_31 },
  "POST /api/v1/chat-rooms/31/read": { status: 204 },
};

async function openList() {
  const user = userEvent.setup({ pointerEventsCheck: 0 }); // 말풍선 아이콘은 마우스를 올려야 눌린다(CSS :hover) — jsdom 은 :hover 를 모른다
  await user.click(await screen.findByRole("button", { name: /채팅 열기/ }));
  const panel = await screen.findByRole("dialog", { name: "채팅" });
  await within(panel).findByText("업체 D");
  return { user, panel };
}
const order = () =>
  within(screen.getByRole("list", { name: "채팅 목록" }))
    .getAllByRole("listitem")
    .map((li) => li.dataset.room);

async function openRoom(name: string) {
  const r = await openList();
  await r.user.click(within(r.panel).getByText(name));
  await within(r.panel).findByRole("button", { name: "목록으로" });
  return r;
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  socketTiming.retryMs = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("chat-open");
});

describe("채팅 버튼과 목록", () => {
  it("로그인한 사용자에게 오른쪽 아래 채팅 버튼(안 읽은 수)이 있고, 누르면 목록 창이 뜬다", async () => {
    mockServer(AS_USER);
    renderAt("/faq");
    const fab = await screen.findByRole("button", { name: "채팅 열기 · 안 읽은 대화 1개" });
    await userEvent.click(fab);
    const panel = screen.getByRole("dialog", { name: "채팅" });
    expect(await within(panel).findByText("업체 D")).toBeInTheDocument();
    expect(within(panel).getByText("드럼 마이크도 추가돼요?")).toBeInTheDocument();
    expect(within(panel).getByText("견적서를 보냈어요")).toBeInTheDocument();
    expect(within(panel).getByText("1")).toHaveClass("count");
    expect(document.documentElement).toHaveClass("chat-open");
    // 창 밖을 누르면 닫힌다
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "채팅" })).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("chat-open");
  });

  it("머리 메뉴 [채팅]은 /chats(없는 화면)가 아니라 지금 화면에 ?chat=list 를 붙여 목록 창을 연다 (404 고침)", async () => {
    mockServer(AS_USER);
    renderAt("/faq");
    const menu = (await screen.findAllByRole("link", { name: "채팅" }))[0];
    expect(menu.getAttribute("href")).toBe("/faq?chat=list");
    await userEvent.click(menu);
    expect(await screen.findByRole("dialog", { name: "채팅" })).toBeInTheDocument();
    expect(screen.queryByText("화면을 찾을 수 없어요")).not.toBeInTheDocument();
  });

  it("승인된 업체에게도 버튼이 있고, 방문자·심사 중 업체에게는 없다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER }, "GET /api/v1/chat-rooms": { status: 200, body: [] } });
    const a = renderAt("/faq");
    expect(await screen.findByRole("button", { name: /채팅 열기/ })).toBeInTheDocument();
    a.unmount();
    FakeSocket.all = [];

    mockServer({ "GET /api/v1/me": { status: 200, body: REVIEWING } });
    const b = renderAt("/faq");
    await screen.findAllByRole("banner");
    await waitFor(() => expect(screen.queryByRole("button", { name: /채팅 열기/ })).not.toBeInTheDocument());
    expect(FakeSocket.all).toHaveLength(0);
    b.unmount();
    FakeSocket.all = [];

    mockServer({ "GET /api/v1/me": { status: 401, body: { code: "UNAUTHORIZED", message: "", fieldErrors: [] } } });
    renderAt("/faq");
    await screen.findAllByRole("banner");
    expect(screen.queryByRole("button", { name: /채팅 열기/ })).not.toBeInTheDocument();
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("AC-F3-27 고정한 방이 위(핀 배지)에 있고, [⇅]를 누르면 고정 묶음·나머지 묶음이 각각 뒤집힌다", async () => {
    mockServer(AS_USER);
    renderAt("/faq");
    const { user, panel } = await openList();
    expect(order()).toEqual(["32", "33", "31", "34"]);
    expect(within(panel).getAllByRole("img", { name: "고정됨" })).toHaveLength(2);

    await user.click(within(panel).getByRole("button", { name: "정렬 바꾸기, 지금 최신순" }));
    expect(order()).toEqual(["33", "32", "34", "31"]);
    await user.click(within(panel).getByRole("button", { name: "정렬 바꾸기, 지금 과거순" }));
    expect(order()).toEqual(["32", "33", "31", "34"]);
  });

  it("AC-F3-26 검색어는 이름·마지막 메시지에서 찾고 찾은 글자를 표시하며, 없으면 빈 상태 문구를 보인다", async () => {
    mockServer(AS_USER);
    renderAt("/faq");
    const { user, panel } = await openList();
    await user.click(within(panel).getByRole("button", { name: "채팅 검색" }));
    const q = within(panel).getByRole("searchbox", { name: "채팅 검색" });
    await user.type(q, "드럼");
    expect(order()).toEqual(["31"]);
    expect(panel.querySelector("mark")).toHaveTextContent("드럼");

    await user.clear(q);
    await user.type(q, "업체");
    expect(order()).toHaveLength(4);

    await user.clear(q);
    await user.type(q, "없는말");
    expect(within(panel).getByText("‘없는말’에 맞는 대화가 없어요")).toBeInTheDocument();
  });

  it("AC-F3-26 [안 읽음만]을 누르면 안 읽은 대화만, 없으면 빈 상태 문구", async () => {
    mockServer({ ...AS_USER, "GET /api/v1/chat-rooms": { status: 200, body: ROOMS } });
    renderAt("/faq");
    const { user, panel } = await openList();
    await user.click(within(panel).getByRole("button", { name: "안 읽음만" }));
    expect(order()).toEqual(["31"]);
  });

  it("AC-F3-26 안 읽은 대화가 없을 때 [안 읽음만]은 빈 상태 문구", async () => {
    const read = ROOMS.map((r) => ({ ...r, unreadCount: 0 }));
    mockServer({ ...AS_USER, "GET /api/v1/chat-rooms": { status: 200, body: read } });
    renderAt("/faq");
    const { user, panel } = await openList();
    await user.click(within(panel).getByRole("button", { name: "안 읽음만" }));
    expect(within(panel).getByText("안 읽은 대화가 없어요")).toBeInTheDocument();
  });

  it("AC-F3-27 목록 오른쪽 클릭 메뉴의 [상단에 고정] → PUT pin, 대화방 [⋯]의 [고정 해제] → DELETE pin", async () => {
    const calls = mockServer({
      ...AS_USER,
      "PUT /api/v1/chat-rooms/31/pin": { status: 200, body: { roomId: 31, pinnedAt: "2026-11-13T14:00:00+09:00" } },
      "DELETE /api/v1/chat-rooms/32/pin": { status: 204 },
      "GET /api/v1/chat-rooms/32/messages": { status: 200, body: { messages: [], partnerLastReadMessageId: null } },
    });
    renderAt("/faq");
    const { user, panel } = await openList();
    fireEvent.contextMenu(within(panel).getByText("업체 D"));
    await user.click(screen.getByRole("menuitem", { name: "상단에 고정" }));
    await waitFor(() => expect(calls.some((c) => c.key === "PUT /api/v1/chat-rooms/31/pin")).toBe(true));

    await user.click(within(panel).getByText("업체 E"));
    await user.click(await within(panel).findByRole("button", { name: "더보기" }));
    await user.click(screen.getByRole("menuitem", { name: "고정 해제" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /api/v1/chat-rooms/32/pin")).toBe(true));
  });

  it("목록 오른쪽 클릭 [읽음으로 표시] → 마지막 메시지 id 로 POST read, 안 읽은 수가 0 이 된다 (mockup-v3)", async () => {
    const read = ROOMS.map((r) => ({ ...r, unreadCount: 0 }));
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms": [{ status: 200, body: ROOMS }, { status: 200, body: read }, { status: 200, body: read }],
    });
    renderAt("/faq");
    const { user, panel } = await openList();
    const itemD = () => within(screen.getByRole("list", { name: "채팅 목록" })).getAllByRole("listitem").find((li) => li.dataset.room === "31")!;
    expect(within(itemD()).getByText("1")).toHaveClass("count");

    fireEvent.contextMenu(within(panel).getByText("업체 D"));
    await user.click(screen.getByRole("menuitem", { name: "읽음으로 표시" }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /api/v1/chat-rooms/31/read")?.body).toEqual({ lastMessageId: 120 }),
    );
    await waitFor(() => expect(itemD().querySelector(".count")).toBeNull());
    expect(within(panel).getByText("모두 읽음")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("대화방", () => {
  it("AC-F3-06 사용자는 시작 전 방에서 [채팅 시작]을 누른다", async () => {
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms/34/messages": { status: 200, body: { messages: [msg(80, null, null, { type: "QUOTE", refId: 400 })], partnerLastReadMessageId: null } },
      "POST /api/v1/chat-rooms/34/read": { status: 204 },
      "POST /api/v1/chat-rooms/34/start": { status: 200, body: { roomId: 34, startedAt: "2026-11-13T14:00:00+09:00" } },
    });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 A");
    expect(within(panel).queryByRole("textbox", { name: "메시지" })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "채팅 시작" }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /api/v1/chat-rooms/34/start")).toBe(true));
  });

  it("AC-F3-06 시작 전 방에서 업체는 입력창이 막혀 있고 안내가 보인다", async () => {
    const ROOM = room(34, "가을밤밴드", 80, null, { startedAt: null });
    mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/chat-rooms": { status: 200, body: [ROOM] },
      "GET /api/v1/chat-rooms/34/messages": { status: 200, body: { messages: [msg(80, null, null, { type: "QUOTE", refId: 400 })], partnerLastReadMessageId: null } },
      "POST /api/v1/chat-rooms/34/read": { status: 204 },
    });
    renderAt("/faq");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /채팅 열기/ }));
    const panel = screen.getByRole("dialog", { name: "채팅" });
    await user.click(await within(panel).findByText("가을밤밴드"));
    expect(await within(panel).findByText("사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.")).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: "메시지" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "채팅 시작" })).not.toBeInTheDocument();
  });

  it("AC-F3-06 업체가 시작 전 방을 열어 둔 채 WebSocket 으로 CHAT_STARTED 알림이 오면 새로고침 없이 입력창이 열린다", async () => {
    const routes: Record<string, Reply> = {
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/chat-rooms": { status: 200, body: [room(34, "가을밤밴드", 80, null, { startedAt: null })] },
      "GET /api/v1/chat-rooms/34/messages": { status: 200, body: { messages: [msg(80, null, null, { type: "QUOTE", refId: 400 })], partnerLastReadMessageId: null } },
      "POST /api/v1/chat-rooms/34/read": { status: 204 },
    };
    mockServer(routes);
    renderAt("/faq");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /채팅 열기/ }));
    const panel = screen.getByRole("dialog", { name: "채팅" });
    await user.click(await within(panel).findByText("가을밤밴드"));
    await within(panel).findByText("사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.");

    routes["GET /api/v1/chat-rooms"] = { status: 200, body: [room(34, "가을밤밴드", 80, null, { startedAt: "2026-11-13T14:00:00+09:00" })] };
    lastSocket().open();
    lastSocket().emit("notification", {
      id: 501, type: "CHAT_STARTED", category: "QUOTE_CHAT", title: "가을밤밴드님이 채팅을 시작했습니다",
      body: "가을밤 공연 · 장비", link: "/chats/34", createdAt: "2026-11-13T14:00:00+09:00",
    });
    expect(await within(panel).findByRole("textbox", { name: "메시지" })).toBeInTheDocument();
    expect(within(panel).queryByText("사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.")).not.toBeInTheDocument();
  });

  it("11/24 답장: 말풍선의 꺾인 화살표 → 입력창 위 인용 → replyToId 로 보내고, 말풍선 위에 원문을 보여 준다", async () => {
    const calls = mockServer({
      ...AS_USER,
      "POST /api/v1/chat-rooms/31/messages": {
        status: 201,
        body: msg(121, 12, "네 부탁드려요", { replyTo: { id: 120, type: "TEXT", senderUserId: 7, body: "드럼 마이크도 추가돼요?" } }),
      },
    });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    const original = await within(panel).findByText("드럼 마이크도 추가돼요?");
    await user.click(within(original.closest(".msg") as HTMLElement).getByRole("button", { name: "답장" }));
    expect(within(panel).getByText("업체 D에게 답장")).toBeInTheDocument();
    const box = within(panel).getByRole("textbox", { name: "메시지" });
    expect(box).toHaveFocus();
    await user.type(box, "네 부탁드려요");
    await user.click(within(panel).getByRole("button", { name: "보내기" }));
    expect(await within(panel).findByText("네 부탁드려요")).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/v1/chat-rooms/31/messages")?.body).toEqual({ type: "TEXT", body: "네 부탁드려요", replyToId: 120 });
    expect(within(panel).queryByRole("button", { name: "답장 취소" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /업체 D의 메시지로 이동: 드럼 마이크도 추가돼요\?/ })).toBeInTheDocument();
  });

  it("11/25 내 글 메시지 [수정]은 아래 입력창에서 고쳐 저장하고 '수정됨'이 붙는다. 상대 메시지에는 수정·삭제가 없다", async () => {
    const calls = mockServer({
      ...AS_USER,
      "PATCH /api/v1/chat-rooms/31/messages/119": { status: 200, body: msg(119, 12, "안녕하세요! 문의드려요", { editedAt: "2026-11-13T13:25:00+09:00" }) },
    });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    const mineMsg = (await within(panel).findByText("안녕하세요")).closest(".msg") as HTMLElement;
    const theirs = within(panel).getByText("드럼 마이크도 추가돼요?").closest(".msg") as HTMLElement;
    expect(within(theirs).queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
    expect(within(theirs).queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();

    await user.click(within(mineMsg).getByRole("button", { name: "수정" }));
    expect(within(panel).getByText("메시지 수정")).toBeInTheDocument();
    expect(mineMsg).toHaveClass("msg--editing");
    const box = within(panel).getByRole("textbox", { name: "메시지" });
    expect(box).toHaveValue("안녕하세요");
    expect(box).toHaveFocus();
    await user.clear(box);
    await user.type(box, "안녕하세요! 문의드려요");
    await user.click(within(panel).getByRole("button", { name: "수정 저장" }));
    expect(await within(panel).findByText("안녕하세요! 문의드려요")).toBeInTheDocument();
    expect(calls.find((c) => c.key === "PATCH /api/v1/chat-rooms/31/messages/119")?.body).toEqual({ body: "안녕하세요! 문의드려요" });
    expect(within(panel).getByText("수정됨")).toBeInTheDocument();
    expect(within(panel).queryByText("메시지 수정")).not.toBeInTheDocument();
    expect(within(panel).getByRole("textbox", { name: "메시지" })).toHaveValue("");
  });

  it("11/25 내 메시지를 [삭제]하면 확인 창 없이 바로 '삭제된 메시지예요'로 바뀐다", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const calls = mockServer({
      ...AS_USER,
      "DELETE /api/v1/chat-rooms/31/messages/119": { status: 200, body: msg(119, 12, null, { deleted: true }) },
    });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    const mineMsg = (await within(panel).findByText("안녕하세요")).closest(".msg") as HTMLElement;
    await user.click(within(mineMsg).getByRole("button", { name: "삭제" }));
    expect(await within(panel).findByText("삭제된 메시지예요")).toBeInTheDocument();
    expect(calls.some((c) => c.key === "DELETE /api/v1/chat-rooms/31/messages/119")).toBe(true);
    expect(within(panel).queryByText("안녕하세요")).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("11/24 대화가 50개를 넘으면 [예전 대화 더 보기]로 그 앞을 불러오고, 끝까지 오면 버튼이 사라진다", async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => msg(from + i, 7, `메시지 ${from + i}`));
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms/31/messages": { status: 200, body: { messages: page(200, 50), partnerLastReadMessageId: 249 } },
      "GET /api/v1/chat-rooms/31/messages?before=200&limit=50": { status: 200, body: { messages: page(190, 10), partnerLastReadMessageId: 249 } },
    });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    await within(panel).findByText("메시지 249");
    await user.click(within(panel).getByRole("button", { name: "예전 대화 더 보기" }));
    expect(await within(panel).findByText("메시지 190")).toBeInTheDocument();
    expect(calls.some((c) => c.key === "GET /api/v1/chat-rooms/31/messages?before=200&limit=50")).toBe(true);
    expect(within(panel).queryByRole("button", { name: "예전 대화 더 보기" })).not.toBeInTheDocument();
  });

  it("11/25 휴대폰: 말풍선을 꾹 누르면 그 말풍선의 아이콘이 열리고, 다른 곳을 누르면 닫힌다", async () => {
    mockServer({ ...AS_USER });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    const bubble = (await within(panel).findByText("드럼 마이크도 추가돼요?")).closest(".msg") as HTMLElement;
    fireEvent.touchStart(bubble.querySelector(".msg__col")!);
    await waitFor(() => expect(bubble).toHaveClass("msg--acts"), { timeout: 2000 });
    // 짧게 눌렀다 떼면(스크롤) 열리지 않는다
    const other = within(panel).getByText("안녕하세요").closest(".msg") as HTMLElement;
    fireEvent.touchStart(other.querySelector(".msg__col")!);
    fireEvent.touchEnd(other.querySelector(".msg__col")!);
    await new Promise((r) => setTimeout(r, 600));
    expect(other).not.toHaveClass("msg--acts");
    fireEvent.click(panel.querySelector(".room__msgs")!);
    expect(bubble).not.toHaveClass("msg--acts");
  });

  it("11/24 답장은 [답장 취소]나 Esc 로 그만둔다", async () => {
    mockServer({ ...AS_USER });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    const original = await within(panel).findByText("드럼 마이크도 추가돼요?");
    await user.click(within(original.closest(".msg") as HTMLElement).getByRole("button", { name: "답장" }));
    await user.click(within(panel).getByRole("button", { name: "답장 취소" }));
    expect(within(panel).queryByText("업체 D에게 답장")).not.toBeInTheDocument();
    await user.click(within(original.closest(".msg") as HTMLElement).getByRole("button", { name: "답장" }));
    await user.keyboard("{Escape}");
    expect(within(panel).queryByText("업체 D에게 답장")).not.toBeInTheDocument();
  });

  it("AC-F3-08 방을 열면 읽음을 보내고, 글을 보내면 말풍선이 생기고, WebSocket 으로 온 메시지·읽음이 새로고침 없이 반영된다", async () => {
    const calls = mockServer({
      ...AS_USER,
      "POST /api/v1/chat-rooms/31/messages": { status: 201, body: msg(121, 12, "네, 추가돼요") },
    });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /api/v1/chat-rooms/31/read")?.body).toEqual({ lastMessageId: 120 }),
    );
    expect(within(panel).getAllByText("읽음")).toHaveLength(1);

    await user.type(within(panel).getByRole("textbox", { name: "메시지" }), "네, 추가돼요");
    await user.click(within(panel).getByRole("button", { name: "보내기" }));
    expect(await within(panel).findByText("네, 추가돼요")).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/v1/chat-rooms/31/messages")?.body).toEqual({ type: "TEXT", body: "네, 추가돼요" });
    expect(within(panel).getByRole("textbox", { name: "메시지" })).toHaveValue("");

    const fetchCount = calls.filter((c) => c.key === "GET /api/v1/chat-rooms/31/messages").length;
    lastSocket().open();
    lastSocket().emit("message.created", {
      roomId: 31,
      message: { id: 122, type: "TEXT", body: "좋아요, 그럼 v2로 보낼게요", attachmentUrl: null, refId: null, senderId: 7, contactWarning: false, createdAt: "2026-11-13T13:30:00+09:00" },
    });
    expect(await within(panel).findByText("좋아요, 그럼 v2로 보낼게요")).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "GET /api/v1/chat-rooms/31/messages")).toHaveLength(fetchCount);
    await waitFor(() =>
      expect(calls.filter((c) => c.key === "POST /api/v1/chat-rooms/31/read").map((c) => c.body)).toContainEqual({ lastMessageId: 122 }),
    );

    lastSocket().emit("message.read", { roomId: 31, userId: 7, lastMessageId: 121 });
    await waitFor(() => expect(within(panel).getAllByText("읽음")).toHaveLength(2));
  });

  it("AC-F3-15 contactWarning 메시지 아래에 플랫폼 밖 거래 경고가 보인다", async () => {
    mockServer(AS_USER);
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("010-0000-0000 으로 연락 주세요");
    const notes = within(panel).getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent("플랫폼 밖에서 직접 결제한 거래에는 STAGE DUCK의 결제금 보관 및 환불 절차가 적용되지 않습니다.");
  });

  it("QUOTE 메시지는 견적서 카드(내역서 보기), IMAGE 는 attachmentUrl 이 있으면 사진 · 없으면 '사진' 글자", async () => {
    mockServer(AS_USER);
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    expect(await within(panel).findByRole("link", { name: "내역서 보기" })).toHaveAttribute("href", "/quotes/by-version/501");
    expect(within(panel).getByRole("img", { name: "업체 D가 보낸 사진" })).toHaveAttribute("src", "/api/v1/files/9/raw");
    expect(within(panel).getByText("사진", { selector: ".msg__b" })).toBeInTheDocument();
  });

  it("머리줄 아래 [견적서 보기]는 가장 최근 QUOTE 메시지의 견적서 버전(refId)으로 가고, 대화 목록 밖에 고정돼 있다", async () => {
    const thread = {
      ...THREAD_31,
      messages: [...THREAD_31.messages, msg(121, null, null, { type: "QUOTE", refId: 502 }), msg(122, 12, "고친 견적서 확인해 주세요")],
    };
    mockServer({ ...AS_USER, "GET /api/v1/chat-rooms/31/messages": { status: 200, body: thread } });
    renderAt("/faq");
    const { user, panel } = await openRoom("업체 D");
    const link = await within(panel).findByRole("link", { name: "견적서 보기" });
    expect(link).toHaveAttribute("href", "/quotes/by-version/502");
    // 스크롤되는 메시지 목록(.room__msgs) 밖에 있어 대화가 길어져도 보인다
    expect(link.closest(".room__msgs")).toBeNull();
    await user.click(link);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "채팅" })).not.toBeInTheDocument());
  });

  it("불러온 메시지에 QUOTE 가 없으면 [견적서 보기]를 숨긴다", async () => {
    mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms/32/messages": { status: 200, body: { messages: [msg(110, 12, "설치 시간 확인했어요")], partnerLastReadMessageId: 0 } },
      "POST /api/v1/chat-rooms/32/read": { status: 204 },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 E");
    await within(panel).findByText("설치 시간 확인했어요", { selector: ".msg__b" });
    expect(within(panel).queryByRole("link", { name: "견적서 보기" })).not.toBeInTheDocument();
  });

  it("11/25 견적서 카드가 예전 대화로 밀려나 불러온 메시지에 없어도, 목록의 latestQuoteVersionId 로 [견적서 보기]가 열린다", async () => {
    mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms": { status: 200, body: ROOMS.map((r) => (r.roomId === 32 ? { ...r, latestQuoteVersionId: 777 } : r)) },
      "GET /api/v1/chat-rooms/32/messages": { status: 200, body: { messages: [msg(110, 12, "설치 시간 확인했어요")], partnerLastReadMessageId: 0 } },
      "POST /api/v1/chat-rooms/32/read": { status: 204 },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 E");
    await within(panel).findByText("설치 시간 확인했어요", { selector: ".msg__b" });
    expect(within(panel).getByRole("link", { name: "견적서 보기" })).toHaveAttribute("href", "/quotes/by-version/777");
  });

  it("견적서 완료 화면의 [채팅방으로](?chat=<roomId>)로 오면 그 방이 열린다", async () => {
    mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/chat-rooms": { status: 200, body: [room(31, "가을밤밴드", 120, "드럼 마이크도 추가돼요?")] },
      "GET /api/v1/chat-rooms/31/messages": { status: 200, body: { messages: [msg(120, 12, "드럼 마이크도 추가돼요?")], partnerLastReadMessageId: null } },
      "POST /api/v1/chat-rooms/31/read": { status: 204 },
    });
    renderAt("/supplier/postings/2/quote?chat=31");
    const panel = await screen.findByRole("dialog", { name: "채팅" });
    expect(await within(panel).findByText("드럼 마이크도 추가돼요?", { selector: ".msg__b" })).toBeInTheDocument();
    expect(within(panel).getByRole("textbox", { name: "메시지" })).toBeInTheDocument();
  });

  it("AC-F3-07 내 방이 아니면(?chat=99, 서버 404) 열 수 없다는 안내만 보인다", async () => {
    mockServer({ ...AS_USER });
    renderAt("/faq?chat=99");
    const panel = await screen.findByRole("dialog", { name: "채팅" });
    expect(await within(panel).findByText("채팅방을 찾을 수 없어요.")).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: "메시지" })).not.toBeInTheDocument();
  });

  it("연결이 끊겼다가 다시 연결되면 ?after= 로 빠진 메시지를 채운다", async () => {
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms/31/messages?after=120": {
        status: 200,
        body: { messages: [msg(123, 7, "끊긴 동안 보낸 메시지")], partnerLastReadMessageId: 119 },
      },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    const first = lastSocket();
    first.open();
    first.drop();
    await waitFor(() => expect(FakeSocket.all.length).toBe(2));
    lastSocket().open();
    expect(await within(panel).findByText("끊긴 동안 보낸 메시지")).toBeInTheDocument();
    expect(calls.some((c) => c.key === "GET /api/v1/chat-rooms/31/messages?after=120")).toBe(true);
  });
});

/* ---- 사진·파일 보내기 (AC-F3-08, uploads.md CHAT: jpg·png·webp·pdf, 10MB, PRIVATE) ---- */

const MB = 1024 * 1024;
function fakeFile(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}
function pick(panel: HTMLElement, label: "사진 고르기" | "파일 고르기", file: File) {
  fireEvent.change(within(panel).getByLabelText(label), { target: { files: [file] } });
}
const UPLOADED = { status: 201, body: { id: 41, url: "/api/v1/files/41", thumbUrl: null, width: 1200, height: 800 } };

describe("사진·파일 보내기", () => {
  it("AC-F3-08 [사진 보내기]로 png 를 고르면 POST /files(CHAT) → POST messages(IMAGE, fileId) → 내 말풍선에 사진(누르면 크게 보기)", async () => {
    const calls = mockServer({
      ...AS_USER,
      "POST /api/v1/files": UPLOADED,
      "POST /api/v1/chat-rooms/31/messages": { status: 201, body: msg(121, 12, null, { type: "IMAGE", attachmentUrl: "/api/v1/files/41" }) },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    expect(within(panel).getByRole("button", { name: "사진 보내기" })).toBeEnabled();
    pick(panel, "사진 고르기", fakeFile("무대.png", "image/png"));

    const img = await within(panel).findByRole("img", { name: "내가 보낸 사진" });
    expect(img).toHaveAttribute("src", "/api/v1/files/41");
    expect(img.closest("a")).toHaveAttribute("href", "/api/v1/files/41");
    expect(img.closest("a")).toHaveAttribute("target", "_blank");
    expect(calls.find((c) => c.key === "POST /api/v1/files")?.body).toEqual({ file: "무대.png", purpose: "CHAT" });
    expect(calls.find((c) => c.key === "POST /api/v1/chat-rooms/31/messages")?.body).toEqual({ type: "IMAGE", fileId: 41 });
  });

  it("AC-F3-08 [파일 보내기]로 pdf 를 고르면 type FILE(파일 이름을 body 로), 말풍선에 파일 이름과 내려받기 링크", async () => {
    const calls = mockServer({
      ...AS_USER,
      "POST /api/v1/files": UPLOADED,
      "POST /api/v1/chat-rooms/31/messages": { status: 201, body: msg(121, 12, "장비목록.pdf", { type: "FILE", attachmentUrl: "/api/v1/files/41" }) },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    pick(panel, "파일 고르기", fakeFile("장비목록.pdf", "application/pdf"));

    expect(await within(panel).findByText("장비목록.pdf")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "장비목록.pdf 내려받기" })).toHaveAttribute("href", "/api/v1/files/41");
    expect(calls.find((c) => c.key === "POST /api/v1/files")?.body).toEqual({ file: "장비목록.pdf", purpose: "CHAT" });
    expect(calls.find((c) => c.key === "POST /api/v1/chat-rooms/31/messages")?.body).toEqual({ type: "FILE", fileId: 41, body: "장비목록.pdf" });
  });

  it("형식이 아니거나(gif·exe, 사진 칸의 pdf) 10MB 를 넘으면 보내기 전에 막고 안내한다", async () => {
    const calls = mockServer(AS_USER);
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");

    pick(panel, "사진 고르기", fakeFile("움짤.gif", "image/gif"));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("jpg·png·webp 사진만 올릴 수 있어요.");
    pick(panel, "사진 고르기", fakeFile("견적.pdf", "application/pdf"));
    expect(within(panel).getByRole("alert")).toHaveTextContent("jpg·png·webp 사진만 올릴 수 있어요.");
    pick(panel, "파일 고르기", fakeFile("setup.exe", "application/x-msdownload"));
    expect(within(panel).getByRole("alert")).toHaveTextContent("PDF 파일만 올릴 수 있어요.");
    pick(panel, "사진 고르기", fakeFile("큰사진.jpg", "image/jpeg", 10 * MB + 1));
    expect(within(panel).getByRole("alert")).toHaveTextContent("10MB 이하 파일만 올릴 수 있어요.");

    expect(calls.some((c) => c.key === "POST /api/v1/files")).toBe(false);
    expect(calls.some((c) => c.key === "POST /api/v1/chat-rooms/31/messages")).toBe(false);
  });

  it("10MB 딱 맞으면 올리고, 서버가 413 FILE_TOO_LARGE 를 돌려주면 서버 문구를 그대로 보인다", async () => {
    const calls = mockServer({
      ...AS_USER,
      "POST /api/v1/files": { status: 413, body: { code: "FILE_TOO_LARGE", message: "10MB 이하 파일만 올릴 수 있어요.", fieldErrors: [] } },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    pick(panel, "사진 고르기", fakeFile("경계.webp", "image/webp", 10 * MB));
    expect(await within(panel).findByRole("alert")).toHaveTextContent("10MB 이하 파일만 올릴 수 있어요.");
    expect(calls.filter((c) => c.key === "POST /api/v1/files")).toHaveLength(1);
    expect(calls.some((c) => c.key === "POST /api/v1/chat-rooms/31/messages")).toBe(false);
  });

  it("올리는 동안 '올리는 중'을 보이고 버튼을 끄며, 메시지 보내기가 실패하면 서버 message 를 그대로 보인다", async () => {
    let release: (v?: unknown) => void = () => {};
    const wait = new Promise((r) => (release = r));
    mockServer({
      ...AS_USER,
      "POST /api/v1/files": { ...UPLOADED, wait },
      "POST /api/v1/chat-rooms/31/messages": {
        status: 400,
        body: {
          code: "VALIDATION_FAILED",
          message: "사진은 [사진]으로, PDF는 [파일]로 보내 주세요.",
          fieldErrors: [{ field: "type", reason: "사진은 [사진]으로, PDF는 [파일]로 보내 주세요." }],
        },
      },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    pick(panel, "사진 고르기", fakeFile("무대.png", "image/png"));

    expect(await within(panel).findByRole("status")).toHaveTextContent("올리는 중이에요");
    expect(within(panel).getByRole("button", { name: "사진 보내기" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "파일 보내기" })).toBeDisabled();
    release();
    expect(await within(panel).findByRole("alert")).toHaveTextContent("사진은 [사진]으로, PDF는 [파일]로 보내 주세요.");
    expect(within(panel).queryByRole("status")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "사진 보내기" })).toBeEnabled();
  });

  it("AC-F3-06 시작 전 방에서 업체는 사진·파일 버튼도 없다", async () => {
    mockServer({
      "GET /api/v1/me": { status: 200, body: SUPPLIER },
      "GET /api/v1/chat-rooms": { status: 200, body: [room(34, "가을밤밴드", 80, null, { startedAt: null })] },
      "GET /api/v1/chat-rooms/34/messages": { status: 200, body: { messages: [msg(80, null, null, { type: "QUOTE", refId: 400 })], partnerLastReadMessageId: null } },
      "POST /api/v1/chat-rooms/34/read": { status: 204 },
    });
    renderAt("/faq");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /채팅 열기/ }));
    const panel = screen.getByRole("dialog", { name: "채팅" });
    await user.click(await within(panel).findByText("가을밤밴드"));
    await within(panel).findByText("사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.");
    expect(within(panel).queryByRole("button", { name: "사진 보내기" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "파일 보내기" })).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText("사진 고르기")).not.toBeInTheDocument();
  });

  it("AC-F3-08 새로고침 뒤 GET messages 의 IMAGE·FILE 도 attachmentUrl 로 사진·내려받기가 보인다", async () => {
    mockServer({
      ...AS_USER,
      "GET /api/v1/chat-rooms/31/messages": {
        status: 200,
        body: {
          messages: [
            msg(118, 12, null, { type: "IMAGE", attachmentUrl: "/api/v1/files/40" }),
            msg(119, 7, "장비목록.pdf", { type: "FILE", attachmentUrl: "/api/v1/files/42" }),
          ],
          partnerLastReadMessageId: 118,
        },
      },
    });
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    expect(await within(panel).findByRole("img", { name: "내가 보낸 사진" })).toHaveAttribute("src", "/api/v1/files/40");
    expect(within(panel).getByRole("link", { name: "장비목록.pdf 내려받기" })).toHaveAttribute("href", "/api/v1/files/42");
  });

  it("AC-F3-08 상대가 보낸 IMAGE 가 WebSocket message.created 로 오면 새로고침 없이 사진 말풍선이 생긴다", async () => {
    const calls = mockServer(AS_USER);
    renderAt("/faq");
    const { panel } = await openRoom("업체 D");
    await within(panel).findByText("드럼 마이크도 추가돼요?");
    const fetchCount = calls.filter((c) => c.key === "GET /api/v1/chat-rooms/31/messages").length;
    lastSocket().open();
    lastSocket().emit("message.created", {
      roomId: 31,
      message: { id: 122, type: "IMAGE", body: null, attachmentUrl: "/api/v1/files/43", refId: null, senderId: 7, contactWarning: false, createdAt: "2026-11-13T13:30:00+09:00" },
    });
    await waitFor(() =>
      expect(within(panel).getAllByRole("img", { name: "업체 D가 보낸 사진" }).map((i) => i.getAttribute("src"))).toContain("/api/v1/files/43"),
    );
    expect(calls.filter((c) => c.key === "GET /api/v1/chat-rooms/31/messages")).toHaveLength(fetchCount);
  });
});
