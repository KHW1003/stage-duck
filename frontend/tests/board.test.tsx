import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, PrPost, PrPostPage, SupplierApplication } from "../src/shared/api/types";

/** 업체 찾기 (#30, 목업 v4 board.html · post.html · p-post.html) — AC-F4-01, AC-F4-04, AC-F4-09 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "host@stageduck.test", name: "시연사용자", phone: "01000000000",
  nickname: "광주밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER_D: Me = { ...USER, id: 5, role: "SUPPLIER", nickname: null, name: "업체D담당", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };

const ITEM = {
  id: 11, category: "EQUIPMENT", title: "밴드 공연 음향, 설치부터 철수까지 맡아요", supplierId: 4, companyName: "업체 D",
  sido: "광주광역시", priceRange: "장비 40~60만 원", thumbUrl: "/files/public/d1-thumb.jpg", bumpedAt: "2026-11-10T09:00:00",
} as const;

function page(items: PrPostPage["items"], total = items.length): PrPostPage {
  return { items, page: 1, size: 20, total };
}

const ALL = page([
  ITEM,
  { ...ITEM, id: 12, category: "VENUE", title: "스탠딩 80명, 장비 반입 쉬운 1층 공간", companyName: "업체 C", thumbUrl: null },
  { ...ITEM, id: 13, category: "ENGINEER", title: "리허설부터 공연까지 음향 운영해요", companyName: "업체 F", priceRange: null },
]);
const ENGINEER_ONLY = page([ALL.items[2]]);

const POST: PrPost = {
  ...ITEM,
  body: "관객 50~150명 밴드 공연을 주로 해요.\n공연이 끝나면 철수까지 해요.",
  photos: [
    { id: 41, url: "/files/public/d1.jpg", thumbUrl: "/files/public/d1-thumb.jpg" },
    { id: 42, url: "/files/public/d2.jpg", thumbUrl: "/files/public/d2-thumb.jpg" },
  ],
  createdAt: "2026-11-01T10:00:00",
};

const APPLICATION: SupplierApplication = {
  businessType: "SOLE_PROPRIETOR", companyName: "업체 D", representativeName: "가상대표D", businessRegNo: null, businessAddress: null,
  mainPhone: "01000000000", mailOrderNo: null, categories: ["EQUIPMENT", "INSTALL", "ENGINEER"], reviewStatus: "APPROVED",
  rejectReason: null, appliedAt: "2026-11-01T10:00:00",
};

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

const err = (status: number, code: string, message: string, fieldErrors: { field: string; reason: string }[] = []): Reply => ({
  status,
  body: { code, message, fieldErrors },
});

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${decodeURIComponent(url)}`;
      calls.push({ url: decodeURIComponent(url), method, body: init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : undefined });
      const r = routes[key] ?? err(404, "NOT_FOUND", "찾을 수 없어요.");
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + decodeURIComponent(loc.search)}</p>;
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

const GUEST = { "GET /api/v1/me": err(401, "UNAUTHENTICATED", "로그인이 필요해요.") };
const AS_USER = { "GET /api/v1/me": { status: 200, body: USER } };
const AS_SUPPLIER = { "GET /api/v1/me": { status: 200, body: SUPPLIER_D }, "GET /api/v1/supplier/application": { status: 200, body: APPLICATION } };

afterEach(() => vi.unstubAllGlobals());

describe("업체 찾기 목록 (/board)", () => {
  it("AC-F4-04 방문자도 로그인 없이 목록을 보고, 카드를 누르면 소개 글로 간다", async () => {
    const user = userEvent.setup();
    mockServer({ ...GUEST, "GET /api/v1/pr-posts": { status: 200, body: ALL } });
    renderAt("/board");

    expect(await screen.findByRole("heading", { level: 1, name: "업체 찾기" })).toBeInTheDocument();
    const card = await screen.findByRole("link", { name: /밴드 공연 음향, 설치부터 철수까지 맡아요/ });
    expect(card).toHaveTextContent("[장비]");
    expect(card).toHaveTextContent("업체 D");
    expect(card).toHaveTextContent("광주광역시");
    expect(card).toHaveTextContent("11월 10일 끌어올림");
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "전체 지역 · 전체 3개")).toBeInTheDocument();

    await user.click(card);
    expect(screen.getByTestId("where")).toHaveTextContent("/board/11");
  });

  it("AC-F4-09 [엔지니어] 탭을 누르면 엔지니어 글만 받아 보여 주고, [전체]는 말머리 없이 다시 받는다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...GUEST,
      "GET /api/v1/pr-posts": { status: 200, body: ALL },
      "GET /api/v1/pr-posts?category=ENGINEER": { status: 200, body: ENGINEER_ONLY },
    });
    renderAt("/board");
    await screen.findByRole("link", { name: /스탠딩 80명/ });

    await user.click(screen.getByRole("tab", { name: "[엔지니어]" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /스탠딩 80명/ })).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "[엔지니어]" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /리허설부터 공연까지/ })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/board?category=ENGINEER");

    await user.click(screen.getByRole("tab", { name: "전체" }));
    expect(await screen.findByRole("link", { name: /스탠딩 80명/ })).toBeInTheDocument();
    // [전체]로 돌아오면 저장해 둔 목록을 바로 보여 주고 뒤에서 한 번 더 받을 수 있다 (TanStack Query)
    const urls = calls.filter((c) => c.url.startsWith("/api/v1/pr-posts")).map((c) => c.url);
    expect(urls.slice(0, 2)).toEqual(["/api/v1/pr-posts", "/api/v1/pr-posts?category=ENGINEER"]);
    expect(urls.slice(2).every((u) => u === "/api/v1/pr-posts")).toBe(true);
  });

  it("AC-F4-09 주소의 말머리로 바로 들어와도 그 탭이 켜진다", async () => {
    mockServer({ ...GUEST, "GET /api/v1/pr-posts?category=ENGINEER": { status: 200, body: ENGINEER_ONLY } });
    renderAt("/board?category=ENGINEER");
    expect(await screen.findByRole("link", { name: /리허설부터 공연까지/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "[엔지니어]" })).toHaveAttribute("aria-selected", "true");
  });

  it("시·도를 고르면 그 지역 글만 받고, 글이 없으면 [전체 지역 보기]로 돌아간다", async () => {
    const user = userEvent.setup();
    mockServer({
      ...GUEST,
      "GET /api/v1/pr-posts": { status: 200, body: ALL },
      "GET /api/v1/pr-posts?sido=제주특별자치도": { status: 200, body: page([]) },
    });
    renderAt("/board");
    await screen.findByRole("link", { name: /스탠딩 80명/ });

    await user.click(screen.getByRole("combobox", { name: "지역" }));
    await user.click(screen.getByRole("option", { name: "제주특별자치도" }));
    expect(await screen.findByText("이 지역에 올라온 소개 글이 없어요")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/board?sido=제주특별자치도");

    await user.click(screen.getByRole("button", { name: "전체 지역 보기" }));
    expect(await screen.findByRole("link", { name: /스탠딩 80명/ })).toBeInTheDocument();
  });

  it("서버 오류는 서버 문구를 그대로 보여 준다", async () => {
    mockServer({ ...GUEST, "GET /api/v1/pr-posts": err(500, "INTERNAL", "잠시 뒤 다시 시도해 주세요.") });
    renderAt("/board");
    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 뒤 다시 시도해 주세요.");
  });
});

describe("소개 글 (/board/:id)", () => {
  it("AC-F4-04 방문자도 소개 글을 보고, 사진을 넘겨 볼 수 있다. 연락처는 없다", async () => {
    const user = userEvent.setup();
    mockServer({ ...GUEST, "GET /api/v1/pr-posts/11": { status: 200, body: POST } });
    renderAt("/board/11");

    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("[장비]밴드 공연 음향, 설치부터 철수까지 맡아요");
    expect(screen.getByText(/관객 50~150명 밴드 공연을 주로 해요/)).toBeInTheDocument();
    expect(screen.getByText("장비 40~60만 원")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "[장비]" })).toHaveAttribute("href", "/board?category=EQUIPMENT");

    expect(screen.getByRole("img", { name: "업체 D 소개 사진 1" })).toHaveAttribute("src", "/files/public/d1.jpg");
    await user.click(screen.getByRole("button", { name: "사진 2" }));
    expect(screen.getByRole("img", { name: "업체 D 소개 사진 2" })).toHaveAttribute("src", "/files/public/d2.jpg");
    expect(screen.getByRole("button", { name: "사진 2" })).toHaveAttribute("aria-current", "true");

    expect(screen.getByText(/연락처는 결제 뒤 최종 담당표에서 공개돼요/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("010");
  });

  it("없거나 내려간 글은 '찾을 수 없어요'를 보여 준다", async () => {
    mockServer({ ...GUEST, "GET /api/v1/pr-posts/99": err(404, "NOT_FOUND", "찾을 수 없어요.") });
    renderAt("/board/99");
    expect(await screen.findByRole("heading", { name: "화면을 찾을 수 없어요" })).toBeInTheDocument();
  });
});

describe("내 소개 글 쓰기 (/supplier/posts)", () => {
  it("AC-F4-01 승인받지 않은 부문 말머리는 고를 수 없다 (설치만 있는 INSTALL 은 말머리가 아니다)", async () => {
    const user = userEvent.setup();
    mockServer(AS_SUPPLIER);
    renderAt("/supplier/posts");

    await user.click(await screen.findByRole("combobox", { name: /말머리/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "[공연장] · 승인된 부문이 아니에요",
      "[장비]",
      "[엔지니어]",
    ]);
    expect(screen.getByRole("option", { name: /\[공연장\]/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("AC-F4-01 승인 부문으로 쓰면 저장하고 올린 소개 글로 간다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ ...AS_SUPPLIER, "POST /api/v1/pr-posts": { status: 201, body: POST }, "GET /api/v1/pr-posts/11": { status: 200, body: POST } });
    renderAt("/supplier/posts");

    await user.click(await screen.findByRole("combobox", { name: /말머리/ }));
    await user.click(screen.getByRole("option", { name: "[장비]" }));
    await user.type(screen.getByLabelText(/제목/), "밴드 공연 음향, 설치부터 철수까지 맡아요");
    await user.click(screen.getByRole("combobox", { name: /활동 지역/ }));
    await user.click(screen.getByRole("option", { name: "광주광역시" }));
    await user.type(screen.getByLabelText(/대표 가격대/), "장비 40~60만 원");
    await user.type(screen.getByLabelText(/본문/), "관객 50~150명 밴드 공연을 주로 해요.");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/board/11"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      category: "EQUIPMENT",
      title: "밴드 공연 음향, 설치부터 철수까지 맡아요",
      sido: "광주광역시",
      priceRange: "장비 40~60만 원",
      body: "관객 50~150명 밴드 공연을 주로 해요.",
      fileIds: [],
    });
  });

  it("AC-F4-02 그 부문에 이미 글이 있으면 서버 문구를 보여 주고 머문다", async () => {
    const user = userEvent.setup();
    mockServer({ ...AS_SUPPLIER, "POST /api/v1/pr-posts": err(409, "ACTIVE_POST_EXISTS", "이 부문에는 이미 올린 소개 글이 있어요. 올린 글을 고쳐 주세요.") });
    renderAt("/supplier/posts");

    await user.click(await screen.findByRole("combobox", { name: /말머리/ }));
    await user.click(screen.getByRole("option", { name: "[장비]" }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이 부문에는 이미 올린 소개 글이 있어요. 올린 글을 고쳐 주세요.");
    expect(screen.getByTestId("where")).toHaveTextContent("/supplier/posts");
  });

  it("서버가 칸을 거부하면 그 칸 아래에 서버 문구가 보인다", async () => {
    const user = userEvent.setup();
    mockServer({
      ...AS_SUPPLIER,
      "POST /api/v1/pr-posts": err(400, "VALIDATION_FAILED", "입력한 내용을 확인해 주세요.", [{ field: "title", reason: "제목을 적어 주세요." }]),
    });
    renderAt("/supplier/posts");
    await user.click(await screen.findByRole("button", { name: "저장" }));

    expect(await screen.findByLabelText(/제목/)).toHaveAccessibleDescription("제목을 적어 주세요.");
  });

  it("사용자는 이 화면이 있는지조차 모른다 (CLAUDE.md 10)", async () => {
    mockServer(AS_USER);
    renderAt("/supplier/posts");
    expect(await screen.findByRole("heading", { name: "화면을 찾을 수 없어요" })).toBeInTheDocument();
  });

  it("방문자는 로그인으로 보낸다", async () => {
    mockServer(GUEST);
    renderAt("/supplier/posts");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/login?next=/supplier/posts"));
  });
});

describe("업체 찾기 머리 메뉴", () => {
  it("업체 계정 메뉴의 [내 소개 글]이 쓰기 화면으로 간다", async () => {
    const user = userEvent.setup();
    mockServer({ ...AS_SUPPLIER, "GET /api/v1/pr-posts": { status: 200, body: ALL } });
    renderAt("/board");
    await user.click(await screen.findByRole("button", { name: /업체D담당/ }));
    const menu = screen.getByRole("menuitem", { name: "내 소개 글" });
    expect(menu).toHaveAttribute("href", "/supplier/posts");
    expect(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "업체 찾기" })).toHaveAttribute("aria-current", "page");
  });
});
