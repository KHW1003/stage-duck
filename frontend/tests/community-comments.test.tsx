import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { FreeComment, FreePost, Me } from "../src/shared/api/types";

/** 커뮤니티 댓글·답글·도움 돼요·저장·신고 (#101) — AC-F4-14, AC-F4-15(신고), AC-F4-17 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "광주밴드", supplierReviewStatus: null, landing: "/me/performances",
};

function comment(over: Partial<FreeComment> = {}): FreeComment {
  return {
    id: 31, author: { name: "업체 D", kind: "SUPPLIER" }, body: "17시 리허설 괜찮아요", status: "ACTIVE", blindReason: null,
    isPostAuthor: false, isMine: false, helpfulCount: 2, myHelpful: false, createdAt: "2026-11-16T14:42:00", replies: [], ...over,
  };
}

function post(over: Partial<FreePost> = {}): FreePost {
  return {
    id: 9, category: "QUESTION", title: "리허설 질문", author: { name: "광주밴드", kind: "USER" }, viewCount: 10,
    commentCount: 2, helpfulCount: 4, hasPhotos: false, createdAt: "2026-11-16T14:20:00", body: "몇 시간 전에?",
    photoIds: [], status: "ACTIVE", blindReason: null, prevId: null, nextId: null, isMine: false, updatedAt: "2026-11-16T14:20:00",
    comments: [comment({ replies: [comment({ id: 32, author: { name: "광주밴드", kind: "USER" }, body: "감사해요!", isPostAuthor: true })] })],
    myHelpful: false, bookmarked: false, ...over,
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
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = routes[`${method} ${url}`] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
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

const ME = { "GET /api/v1/me": { status: 200, body: USER } };
const GUEST = { "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "로그인이 필요해요.", fieldErrors: [] } } };

afterEach(() => vi.unstubAllGlobals());

describe("커뮤니티 댓글 (#101)", () => {
  it("AC-F4-14 업체 댓글은 '업체 D · 업체', 답글은 한 단계라 답글에는 [답글]이 없고 글쓴이 표시가 있다", async () => {
    mockServer({ ...ME, "GET /api/v1/free-posts/9": { status: 200, body: post() } });
    renderAt("/community/9");

    const top = (await screen.findByText("17시 리허설 괜찮아요")).closest("li")!;
    expect(within(top).getByText("업체 D · 업체")).toBeInTheDocument();
    const reply = screen.getByText("감사해요!").closest("li")!;
    expect(within(reply).getByText("글쓴이")).toBeInTheDocument();
    expect(within(reply).queryByRole("button", { name: "답글" })).not.toBeInTheDocument();
    expect(within(top).getAllByRole("button", { name: "답글" })).toHaveLength(1);
  });

  it("댓글에 답글을 달면 parentId 와 함께 보낸다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/free-posts/9": { status: 200, body: post() },
      "POST /api/v1/free-posts/9/comments": { status: 201, body: { ...comment({ id: 33, body: "좋아요" }), contactWarning: false } },
    });
    renderAt("/community/9");

    const top = (await screen.findByText("17시 리허설 괜찮아요")).closest("li")!;
    await user.click(within(top).getAllByRole("button", { name: "답글" })[0]);
    await user.type(screen.getByLabelText("답글"), "좋아요");
    await user.click(within(top).getByRole("button", { name: "등록" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ body: "좋아요", parentId: 31 });
  });

  it("AC-F4-17 [도움 돼요]는 누르면 PUT, 이미 눌렀으면 DELETE 로 취소한다", async () => {
    const user = userEvent.setup();
    const routes: Record<string, Reply> = {
      ...ME,
      "GET /api/v1/free-posts/9": { status: 200, body: post() },
      "PUT /api/v1/free-helpfuls": { status: 200, body: { helpfulCount: 5 } },
      "DELETE /api/v1/free-helpfuls": { status: 200, body: { helpfulCount: 4 } },
    };
    const calls = mockServer(routes);
    renderAt("/community/9");

    const first = await screen.findByRole("button", { name: "도움 돼요 4" });
    routes["GET /api/v1/free-posts/9"] = { status: 200, body: post({ myHelpful: true, helpfulCount: 5 }) }; // 누른 뒤 서버 상태
    await user.click(first);
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ targetType: "POST", targetId: 9 });

    await user.click(await screen.findByRole("button", { name: "도움 돼요 5", pressed: true }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("AC-F4-17 [저장]을 누르면 저장되고, 저장한 글 화면에 모인다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/free-posts/9": { status: 200, body: post() },
      "PUT /api/v1/free-posts/9/bookmark": { status: 204 },
      "GET /api/v1/me/free-bookmarks": { status: 200, body: { items: [post()], total: 1, page: 1, pageSize: 1 } },
    });
    const view = renderAt("/community/9");

    await user.click(await screen.findByRole("button", { name: "저장" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/v1/free-posts/9/bookmark" && c.method === "PUT")).toBe(true));

    view.unmount();
    renderAt("/community/saved");
    expect(await screen.findByRole("link", { name: "리허설 질문" })).toHaveAttribute("href", "/community/9");
  });

  it("남의 댓글은 사유를 적어 신고한다 (POST /reports FREE_COMMENT)", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...ME,
      "GET /api/v1/free-posts/9": { status: 200, body: post({ comments: [comment()] }) },
      "POST /api/v1/reports": { status: 201, body: { id: 1 } },
    });
    renderAt("/community/9");

    const top = (await screen.findByText("17시 리허설 괜찮아요")).closest("li")!;
    await user.click(within(top).getByRole("button", { name: "신고" }));
    const dialog = await screen.findByRole("dialog", { name: "댓글 신고" });
    await user.type(within(dialog).getByLabelText("신고 사유"), "업체 홍보");
    await user.click(within(dialog).getByRole("button", { name: "신고하기" }));

    expect(await within(dialog).findByText(/신고를 받았어요/)).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/v1/reports")!.body).toEqual({ targetType: "FREE_COMMENT", targetId: 31, reason: "업체 홍보" });
  });

  it("방문자는 댓글을 읽고, 쓰기는 로그인으로 간다. 삭제된 댓글은 자리만 남는다", async () => {
    mockServer({
      ...GUEST,
      "GET /api/v1/free-posts/9": { status: 200, body: post({ comments: [comment({ body: null, status: "DELETED", replies: [] })] }) },
    });
    renderAt("/community/9");

    expect(await screen.findByText("삭제된 댓글이에요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하고 댓글 쓰기" })).toHaveAttribute("href", "/login?next=%2Fcommunity%2F9");
    expect(screen.queryByRole("button", { name: "신고" })).not.toBeInTheDocument();
  });

  it("블라인드된 내 댓글은 사유가 보인다", async () => {
    mockServer({
      ...ME,
      "GET /api/v1/free-posts/9": { status: 200, body: post({ comments: [comment({ isMine: true, status: "BLINDED", blindReason: "업체 홍보" })] }) },
    });
    renderAt("/community/9");

    expect(await screen.findByText(/사유: 업체 홍보/)).toBeInTheDocument();
  });
});
