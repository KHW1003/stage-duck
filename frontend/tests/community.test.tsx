import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { FreePost, FreePostPage, Me } from "../src/shared/api/types";

/** 커뮤니티 목록·글 보기·글쓰기 (#100) — AC-F4-12, AC-F4-13, AC-F4-16 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "광주밴드", supplierReviewStatus: null, landing: "/me/performances",
};

const ITEM = {
  id: 9, category: "QUESTION", title: "리허설은 몇 시간 전에 시작하나요?", author: { name: "광주밴드", kind: "USER" },
  viewCount: 86, commentCount: 0, helpfulCount: 0, hasPhotos: false, createdAt: "2026-11-16T14:20:00",
} as const;

const PAGE: FreePostPage = {
  items: [ITEM, { ...ITEM, id: 8, category: "FREE", title: "첫 공연 끝났어요", author: { name: "업체 D", kind: "SUPPLIER" } }],
  total: 2, page: 1, pageSize: 20,
};

function post(over: Partial<FreePost> = {}): FreePost {
  return {
    ...ITEM, body: "입실 15시, 공연 19시예요.\n조언 부탁드려요.", photoIds: [], status: "ACTIVE", blindReason: null,
    prevId: 8, nextId: null, isMine: false, updatedAt: "2026-11-16T14:20:00", ...over,
  };
}

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : undefined });
      const r = routes[`${method} ${url}`] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
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

const GUEST = { "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "로그인이 필요해요.", fieldErrors: [] } } };
const ME = { "GET /api/v1/me": { status: 200, body: USER } };

afterEach(() => vi.unstubAllGlobals());

describe("커뮤니티 (/community)", () => {
  it("AC-F4-12 방문자도 목록과 글을 읽고, [글쓰기]·[도움 돼요]·[저장]은 로그인으로 간다", async () => {
    const user = userEvent.setup();
    mockServer({ ...GUEST, "GET /api/v1/free-posts": { status: 200, body: PAGE }, "GET /api/v1/free-posts/9": { status: 200, body: post() } });
    renderAt("/community");

    const rows = await screen.findAllByRole("row");
    expect(rows.some((r) => within(r).queryByText("업체 D · 업체"))).toBe(true);
    expect(screen.getByRole("link", { name: "글쓰기" })).toHaveAttribute("href", "/login?next=%2Fcommunity%2Fwrite");

    await user.click(screen.getByRole("link", { name: /리허설은 몇 시간 전에/ }));
    expect(await screen.findByText(/조언 부탁드려요/)).toBeInTheDocument();
    for (const name of [/도움 돼요/, "저장"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/login?next=%2Fcommunity%2F9");
    }
  });

  it("AC-F4-13 말머리를 [질문]으로 바꾸면 질문 글만 불러온다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...GUEST,
      "GET /api/v1/free-posts": { status: 200, body: PAGE },
      "GET /api/v1/free-posts?category=QUESTION": { status: 200, body: { ...PAGE, items: [ITEM], total: 1 } },
    });
    renderAt("/community");
    await screen.findByText("첫 공연 끝났어요");

    await user.click(screen.getByRole("tab", { name: "질문" }));

    await waitFor(() => expect(screen.queryByText("첫 공연 끝났어요")).not.toBeInTheDocument());
    expect(calls.map((c) => c.url)).toContain("/api/v1/free-posts?category=QUESTION");
    expect(screen.getByText(/리허설은 몇 시간 전에/)).toBeInTheDocument();
  });

  it("글을 올리면 말머리·제목·본문을 보내고 그 글로 간다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "POST /api/v1/free-posts": { status: 201, body: { ...post({ isMine: true }), contactWarning: false } },
      "GET /api/v1/free-posts/9": { status: 200, body: post({ isMine: true }) },
    });
    renderAt("/community/write");

    await user.click(await screen.findByRole("radio", { name: "질문" }));
    await user.type(screen.getByLabelText(/^제목/), "리허설 질문");
    await user.type(screen.getByLabelText(/^본문/), "몇 시간 전에 시작하나요?");
    await user.click(screen.getByRole("button", { name: "올리기" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ category: "QUESTION", title: "리허설 질문", body: "몇 시간 전에 시작하나요?", fileIds: [] });
    expect(await screen.findByTestId("where")).toHaveTextContent("/community/9");
  });

  it("AC-F4-16 1분 안에 또 쓰면 서버 문구가 보이고 저장되지 않는다", async () => {
    const user = userEvent.setup();
    const message = "글은 1분에 하나씩 쓸 수 있어요. 잠시 뒤 다시 올려 주세요.";
    mockServer({ ...ME, "POST /api/v1/free-posts": { status: 403, body: { code: "POSTING_RATE_LIMITED", message, fieldErrors: [] } } });
    renderAt("/community/write");

    await user.click(await screen.findByRole("radio", { name: "자유" }));
    await user.type(screen.getByLabelText(/^제목/), "또 쓰기");
    await user.type(screen.getByLabelText(/^본문/), "내용");
    await user.click(screen.getByRole("button", { name: "올리기" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/community/write");
  });

  it("말머리를 안 고르면 올리지 않고 이유를 보여 준다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ ...ME });
    renderAt("/community/write");

    await user.type(await screen.findByLabelText(/^제목/), "제목");
    await user.type(screen.getByLabelText(/^본문/), "내용");
    await user.click(screen.getByRole("button", { name: "올리기" }));

    expect(await screen.findByText("말머리를 골라 주세요.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("내 글에는 [수정]·[삭제]가 있고, 삭제는 확인 창을 거쳐 목록으로 간다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/free-posts/9": { status: 200, body: post({ isMine: true }) },
      "DELETE /api/v1/free-posts/9": { status: 204 },
      "GET /api/v1/free-posts": { status: 200, body: PAGE },
    });
    renderAt("/community/9");

    expect(await screen.findByRole("link", { name: "수정" })).toHaveAttribute("href", "/community/9/edit");
    await user.click(screen.getByRole("button", { name: "삭제" }));
    await user.click(within(await screen.findByRole("dialog", { name: "글을 지울까요?" })).getByRole("button", { name: "지우기" }));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(await screen.findByTestId("where")).toHaveTextContent(/^\/community$/);
  });

  it("블라인드된 내 글에는 사유가 보인다", async () => {
    mockServer({ ...ME, "GET /api/v1/free-posts/9": { status: 200, body: post({ isMine: true, status: "BLINDED", blindReason: "연락처 노출" }) } });
    renderAt("/community/9");

    expect(await screen.findByText(/연락처 노출/)).toBeInTheDocument();
  });
});
