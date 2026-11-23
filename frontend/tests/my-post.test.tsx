import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, MyPrPost, SupplierApplication } from "../src/shared/api/types";

/**
 * 내 소개 글 (/supplier/posts, #31, 목업 v4 p-post.html "글 고치기"·"블라인드됨")
 * FR-BOARD-02(고치기·내리기) · FR-BOARD-03(끌어올리기 7일 1회) · AC-F4-10(블라인드 안내)
 * GET /pr-posts/mine 은 계약서 반영 대기 (11/23) — 제안한 모양으로 목업한다.
 */

const SUPPLIER_D: Me = {
  id: 5, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "업체D담당", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

const APPLICATION: SupplierApplication = {
  businessType: "SOLE_PROPRIETOR", companyName: "업체 D", representativeName: "가상대표D", businessRegNo: null, businessAddress: null,
  mainPhone: "01000000000", mailOrderNo: null, categories: ["EQUIPMENT", "INSTALL", "ENGINEER"], reviewStatus: "APPROVED",
  rejectReason: null, appliedAt: "2026-11-01T10:00:00",
};

const MINE: MyPrPost = {
  id: 11, category: "EQUIPMENT", title: "밴드 공연 음향, 설치부터 철수까지 맡아요", supplierId: 4, companyName: "업체 D",
  sido: "광주광역시", priceRange: "장비 40~60만 원", bumpedAt: "2026-11-20T10:00:00", createdAt: "2026-11-01T10:00:00",
  body: "관객 50~150명 밴드 공연을 주로 해요.",
  photos: [
    { id: 41, url: "/files/public/d1.jpg", thumbUrl: "/files/public/d1-thumb.jpg" },
    { id: 42, url: "/files/public/d2.jpg", thumbUrl: "/files/public/d2-thumb.jpg" },
  ],
  status: "ACTIVE", blindReason: null, canBump: false, nextBumpAt: "2026-11-27T10:00:00",
};

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };
const err = (status: number, code: string, message: string): Reply => ({ status, body: { code, message, fieldErrors: [] } });

/** 응답을 함수로도 줄 수 있다 — 내린 뒤 목록이 비는 것처럼 호출할 때마다 바뀌는 응답 */
function mockServer(routes: Record<string, Reply | (() => Reply)>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${decodeURIComponent(url)}`;
      calls.push({ url: decodeURIComponent(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[key];
      const r = typeof route === "function" ? route() : route ?? err(404, "NOT_FOUND", "찾을 수 없어요.");
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/supplier/posts"]}>
        <AppRoutes />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function asSupplier(items: MyPrPost[], extra: Record<string, Reply | (() => Reply)> = {}) {
  return mockServer({
    "GET /api/v1/me": { status: 200, body: SUPPLIER_D },
    "GET /api/v1/supplier/application": { status: 200, body: APPLICATION },
    "GET /api/v1/pr-posts/mine": { status: 200, body: { items } },
    ...extra,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("내 소개 글 (/supplier/posts)", () => {
  it("FR-BOARD-02 말머리 탭이 부문마다 게시 중·새 글·승인 안 됨을 보여 주고, 글이 있는 탭이 먼저 열린다", async () => {
    asSupplier([MINE]);
    renderPage();

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["[공연장] 승인 안 됨", "[장비] 게시 중", "[엔지니어] 새 글"]);
    expect(tabs[0]).toHaveAttribute("aria-disabled", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/제목/)).toHaveValue("밴드 공연 음향, 설치부터 철수까지 맡아요");
    expect(screen.getByRole("textbox", { name: /말머리/ })).toBeDisabled();
  });

  it("FR-BOARD-02 [새 글] 탭을 누르면 그 부문으로 새 글을 쓰고, 이미 글이 있는 부문은 고를 수 없다", async () => {
    const user = userEvent.setup();
    asSupplier([MINE]);
    renderPage();

    await user.click(await screen.findByRole("tab", { name: "[엔지니어] 새 글" }));

    expect(screen.getByRole("tab", { name: "[엔지니어] 새 글" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/제목/)).toHaveValue("");
    await user.click(screen.getByRole("combobox", { name: /말머리/ }));
    expect(screen.getByRole("option", { name: "[장비] · 이미 올린 글이 있어요" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "[엔지니어]" })).toHaveAttribute("aria-selected", "true");
  });

  it("AC-F4-03 고쳐서 저장하면 말머리 없이 PUT 하고, 올린 소개 글로 간다", async () => {
    const user = userEvent.setup();
    const calls = asSupplier([MINE], {
      "PUT /api/v1/pr-posts/11": { status: 200, body: { ...MINE, title: "밴드 공연 음향 맡아요", contactWarning: false } },
    });
    renderPage();

    const title = await screen.findByLabelText(/제목/);
    await user.clear(title);
    await user.type(title, "밴드 공연 음향 맡아요");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/board/11"));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
      title: "밴드 공연 음향 맡아요",
      body: "관객 50~150명 밴드 공연을 주로 해요.",
      sido: "광주광역시",
      priceRange: "장비 40~60만 원",
      fileIds: [41, 42],
    });
  });

  it("FR-BOARD-03 7일이 안 됐으면 서버가 준 시각까지 끌어올리기를 꺼 둔다", async () => {
    const calls = asSupplier([MINE]);
    renderPage();

    const button = await screen.findByRole("button", { name: "11월 27일 10:00부터 끌어올리기" });
    expect(button).toBeDisabled();
    expect(screen.getByText("마지막 끌어올리기").nextSibling).toHaveTextContent("11월 20일");
    expect(calls.some((c) => c.url.endsWith("/bump"))).toBe(false);
  });

  it("FR-BOARD-03 끌어올릴 수 있으면 누르고, 끝나면 안내를 보여 준다", async () => {
    const user = userEvent.setup();
    const calls = asSupplier([{ ...MINE, canBump: true }], {
      "POST /api/v1/pr-posts/11/bump": { status: 200, body: { ...MINE, bumpedAt: "2026-11-23T13:00:00" } },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "끌어올리기" }));

    expect(await screen.findByText("끌어올렸어요. 업체 찾기 맨 위에 보여요.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST" && c.url === "/api/v1/pr-posts/11/bump")).toHaveLength(1);
  });

  it("FR-BOARD-03 서버가 429 BUMP_TOO_SOON 이면 서버 문구를 그대로 보여 준다", async () => {
    const user = userEvent.setup();
    asSupplier([{ ...MINE, canBump: true }], {
      "POST /api/v1/pr-posts/11/bump": err(429, "BUMP_TOO_SOON", "끌어올리기는 7일에 한 번 할 수 있어요. 11월 27일 10:00부터 다시 할 수 있어요."),
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "끌어올리기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("끌어올리기는 7일에 한 번 할 수 있어요. 11월 27일 10:00부터 다시 할 수 있어요.");
  });

  it("FR-BOARD-02 [글 내리기]는 한 번 더 묻고, 내리면 그 탭이 새 글로 바뀐다", async () => {
    const user = userEvent.setup();
    let items = [MINE];
    const calls = asSupplier([], {
      "GET /api/v1/pr-posts/mine": () => ({ status: 200, body: { items } }),
      "DELETE /api/v1/pr-posts/11": () => {
        items = [];
        return { status: 204 };
      },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "글 내리기" }));
    const dialog = await screen.findByRole("dialog", { name: "글을 내릴까요?" });
    expect(dialog).toHaveTextContent("되돌릴 수 없어요");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "글 내리기" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "내리기" }));

    expect(await screen.findByRole("tab", { name: "[장비] 새 글" })).toHaveAttribute("aria-selected", "true");
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/제목/)).toHaveValue("");
  });

  it("AC-F4-10 가려진 글은 사유를 보여 주고, 고치기·내리기·끌어올리기를 모두 잠근다", async () => {
    asSupplier([{ ...MINE, status: "BLINDED", blindReason: "본문에 외부 연락처가 있어요" }]);
    renderPage();

    expect(await screen.findByRole("tab", { name: "[장비] 블라인드됨" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("status")).toHaveTextContent("이 글은 관리자가 블라인드했어요. 사유: 본문에 외부 연락처가 있어요.");
    expect(screen.getByLabelText(/제목/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "글 내리기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /끌어올리기/ })).not.toBeInTheDocument();
  });
});
