import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, PrPost, SupplierApplication } from "../src/shared/api/types";

/** 업체 찾기 소개 글 — 연락처 경고 표시·신고 (AC-F4-03, 이슈 #31, 목업 v4 p-post.html · post.html) */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "host@stageduck.test", name: "시연사용자", phone: "01000000000",
  nickname: "광주밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER_D: Me = { ...USER, id: 5, role: "SUPPLIER", nickname: null, name: "업체D담당", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };
const APPLICATION: SupplierApplication = {
  businessType: "SOLE_PROPRIETOR", companyName: "업체 D", representativeName: "가상대표D", businessRegNo: null, businessAddress: null,
  mainPhone: "01000000000", mailOrderNo: null, categories: ["EQUIPMENT"], reviewStatus: "APPROVED",
  rejectReason: null, appliedAt: "2026-11-01T10:00:00",
};
const POST: PrPost = {
  id: 11, category: "EQUIPMENT", title: "밴드 공연 음향, 설치부터 철수까지 맡아요", supplierId: 4, companyName: "업체 D",
  sido: "광주광역시", priceRange: null, bumpedAt: "2026-11-10T09:00:00", createdAt: "2026-11-01T10:00:00",
  body: "관객 50~150명 밴드 공연을 주로 해요.", photos: [],
};

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };
const err = (status: number, code: string, message: string): Reply => ({ status, body: { code, message, fieldErrors: [] } });

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : undefined });
      const r = routes[`${method} ${url}`] ?? err(404, "NOT_FOUND", "찾을 수 없어요.");
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

const GUEST = { "GET /api/v1/me": err(401, "UNAUTHENTICATED", "로그인이 필요해요.") };
const AS_USER = { "GET /api/v1/me": { status: 200, body: USER } };
const AS_SUPPLIER = { "GET /api/v1/me": { status: 200, body: SUPPLIER_D }, "GET /api/v1/supplier/application": { status: 200, body: APPLICATION } };
const WARNING = /외부 연락처로 보이는 글자가 있어요/;

afterEach(() => vi.unstubAllGlobals());

async function writePost(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("combobox", { name: /말머리/ }));
  await user.click(screen.getByRole("option", { name: "[장비]" }));
  await user.type(screen.getByLabelText(/제목/), "밴드 공연 음향");
  await user.click(screen.getByRole("combobox", { name: /활동 지역/ }));
  await user.click(screen.getByRole("option", { name: "광주광역시" }));
  await user.type(screen.getByLabelText(/본문/), "문의 010-0000-0000");
  await user.click(screen.getByRole("button", { name: "저장" }));
}

describe("AC-F4-03 소개 글 연락처 경고", () => {
  it("저장한 글에 연락처·계좌·외부 링크가 있으면, 올린 소개 글 화면에 경고가 보인다", async () => {
    const user = userEvent.setup();
    mockServer({
      ...AS_SUPPLIER,
      "POST /api/v1/pr-posts": { status: 201, body: { ...POST, contactWarning: true } },
      "GET /api/v1/pr-posts/11": { status: 200, body: POST },
    });
    renderAt("/supplier/posts");

    await writePost(user);

    expect(await screen.findByRole("status")).toHaveTextContent(WARNING);
    expect(screen.getByRole("status")).toHaveTextContent("신고되면 블라인드되고 경고가 기록돼요");
  });

  it("경고가 없으면 아무 안내도 보이지 않는다", async () => {
    const user = userEvent.setup();
    mockServer({
      ...AS_SUPPLIER,
      "POST /api/v1/pr-posts": { status: 201, body: { ...POST, contactWarning: false } },
      "GET /api/v1/pr-posts/11": { status: 200, body: POST },
    });
    renderAt("/supplier/posts");

    await writePost(user);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(POST.title);
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("다른 사람이 같은 소개 글을 열면 경고가 보이지 않는다 (저장한 사람에게만)", async () => {
    mockServer({ ...GUEST, "GET /api/v1/pr-posts/11": { status: 200, body: POST } });
    renderAt("/board/11");

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(POST.title);
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});

describe("AC-F4-03 소개 글 신고", () => {
  it("로그인한 사람이 [신고]로 사유를 보내면 PR_POST 신고가 접수된다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/pr-posts/11": { status: 200, body: POST },
      "POST /api/v1/reports": { status: 201, body: { id: 1 } },
    });
    renderAt("/board/11");

    await user.click(await screen.findByRole("button", { name: "신고" }));
    const dialog = await screen.findByRole("dialog", { name: "소개 글 신고" });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "신고하기" }));
    expect(screen.getByText("신고 사유를 적어 주세요.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await user.type(screen.getByLabelText("신고 사유"), "본문에 외부 연락처가 있어요");
    await user.click(screen.getByRole("button", { name: "신고하기" }));

    expect(await screen.findByText("신고를 받았어요. 관리자가 확인한 뒤 처리해요.")).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({ targetType: "PR_POST", targetId: 11, reason: "본문에 외부 연락처가 있어요" }),
    );
  });


  it("방문자에게는 [신고]가 보이지 않는다 (신고는 로그인해야 해요)", async () => {
    mockServer({ ...GUEST, "GET /api/v1/pr-posts/11": { status: 200, body: POST } });
    renderAt("/board/11");

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(POST.title);
    expect(screen.queryByRole("button", { name: "신고" })).toBeNull();
  });
});
