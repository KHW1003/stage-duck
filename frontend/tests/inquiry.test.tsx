import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { hasContact, type InquiryDetail, type InquirySummary } from "../src/features/support/inquiry";
import type { Me } from "../src/shared/api/types";

/** 1:1 문의 (#102, AC-F5-18~20) — 목록·쓰기·보기 (목업 v4 inquiry-list · inquiry-write · inquiry-post) */

const ME: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = { ...ME, id: 9, role: "SUPPLIER", nickname: null, supplierReviewStatus: "SUSPENDED", landing: "/supplier/postings" };

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

function mockServer(routes: Record<string, Reply>, me: Me = ME) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body && typeof init.body === "string" ? JSON.parse(init.body) : undefined });
      const r = url === "/api/v1/me" ? { status: 200, body: me } : (routes[`${method} ${url}`] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } });
      return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
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

afterEach(() => vi.unstubAllGlobals());

// 서버 모양: backend/app/support/schemas.py (InquiryItem · InquiryOut, 목산 #178)
const summary = (id: number, over: Partial<InquirySummary> = {}): InquirySummary => ({
  id, category: "PAYMENT", title: `문의 ${id}`, status: "WAITING", createdAt: "2026-11-16T15:10:00", ...over,
});
const detail = (over: Partial<InquiryDetail> = {}): InquiryDetail => ({
  ...summary(7, { title: "하루 전 취소 위약금" }),
  performanceId: 1, body: "공연 하루 전에 취소하면 어떻게 되나요?", answer: null, answeredAt: null,
  updatedAt: "2026-11-16T15:10:00", photos: [], ...over,
});
const list = (items: InquirySummary[]) => ({ status: 200, body: items });
const MY_PERFS = { status: 200, body: { active: [{ id: 1, title: "가을밤 밴드 공연", showDate: "2026-11-22" }], draft: [], past: [] } };

describe("1:1 문의 목록 (/inquiries)", () => {
  it("요약 숫자, 유형·제목·상태를 보인다", async () => {
    mockServer({
      "GET /api/v1/me/inquiries": list([summary(2), summary(1, { category: "ACCOUNT", status: "ANSWERED" })]),
    });
    renderAt("/inquiries");
    await screen.findByRole("link", { name: "문의 2" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("답변 대기")).toHaveClass("state--on");
    expect(within(rows[1]).getByText("답변 완료")).toHaveClass("state--done");
    expect(within(rows[1]).getByText("계정")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "문의 2" })).toHaveAttribute("href", "/inquiries/2");
    expect(screen.getByText("전체 문의").nextSibling).toHaveTextContent("2");
  });

  it("상태·유형으로 거르면 화면에서 거르고 주소에 남긴다 (요약 숫자는 그대로)", async () => {
    mockServer({
      "GET /api/v1/me/inquiries": list([summary(3, { category: "QUOTE" }), summary(2, { status: "ANSWERED" }), summary(1, { category: "QUOTE", status: "ANSWERED" })]),
    });
    renderAt("/inquiries");
    await screen.findByText("문의 3");
    await userEvent.click(screen.getByRole("button", { name: "답변 완료" }));
    expect(screen.queryByText("문의 3")).not.toBeInTheDocument();
    expect(screen.getByText("문의 2")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "문의 유형" }), "QUOTE");
    expect(screen.getByTestId("where")).toHaveTextContent("/inquiries?status=ANSWERED&category=QUOTE");
    expect(screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("link").textContent)).toEqual(["문의 1"]);
    expect(screen.getByText("전체 문의").nextSibling).toHaveTextContent("3");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "문의 유형" }), "ETC");
    expect(screen.getByText("조건에 맞는 문의가 없어요")).toBeInTheDocument();
  });

  it("10개가 넘으면 쪽을 나눈다", async () => {
    mockServer({ "GET /api/v1/me/inquiries": list(Array.from({ length: 12 }, (_, i) => summary(12 - i))) });
    renderAt("/inquiries");
    await screen.findByText("문의 12");
    expect(screen.getAllByRole("row")).toHaveLength(11);
    await userEvent.click(screen.getByRole("link", { name: "2" }));
    expect(screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("link").textContent)).toEqual(["문의 2", "문의 1"]);
  });

  it("로그인하지 않으면 로그인 화면으로 보낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "", fieldErrors: [] }), { status: 401 })));
    renderAt("/inquiries");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/login?next=%2Finquiries"));
  });
});

describe("문의하기 (/inquiries/new)", () => {
  it("AC-F5-18 유형·제목·내용·관련 공연을 보내고 보기 화면으로 간다", async () => {
    const calls = mockServer({
      "GET /api/v1/performances?mine=true": MY_PERFS,
      "POST /api/v1/inquiries": { status: 201, body: detail({ id: 7 }) },
      "GET /api/v1/inquiries/7": { status: 200, body: detail() },
    });
    renderAt("/inquiries/new");
    await userEvent.click(await screen.findByRole("radio", { name: "결제·환불" }));
    await userEvent.type(screen.getByRole("textbox", { name: "제목" }), "하루 전 취소 위약금");
    await userEvent.type(screen.getByRole("textbox", { name: "내용" }), "공연 하루 전에 취소하면 어떻게 되나요?");
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "관련 공연" }), "1");
    await userEvent.click(screen.getByRole("button", { name: "문의 보내기" }));
    expect(await screen.findByRole("heading", { level: 1, name: "하루 전 취소 위약금" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      category: "PAYMENT", performanceId: 1, title: "하루 전 취소 위약금", body: "공연 하루 전에 취소하면 어떻게 되나요?", fileIds: [],
    });
  });

  it("빈 칸·계좌번호는 보내기 전에 막는다", async () => {
    const calls = mockServer({ "GET /api/v1/performances?mine=true": { status: 200, body: { active: [], draft: [], past: [] } } });
    renderAt("/inquiries/new");
    await userEvent.click(await screen.findByRole("button", { name: "문의 보내기" }));
    expect(screen.getByText("문의 유형을 골라 주세요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "기타" }));
    await userEvent.type(screen.getByRole("textbox", { name: "제목" }), "환불");
    await userEvent.type(screen.getByRole("textbox", { name: "내용" }), "이 계좌로 주세요 110-123-456789");
    await userEvent.click(screen.getByRole("button", { name: "문의 보내기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("전화번호·계좌번호는 적을 수 없어요");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("업체(정지 포함)는 관련 공연 칸 없이 쓴다", async () => {
    const calls = mockServer({}, SUPPLIER);
    renderAt("/inquiries/new");
    expect(await screen.findByRole("heading", { level: 1, name: "문의하기" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "관련 공연" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.startsWith("/api/v1/performances"))).toBe(false);
  });

  it("서버 칸 오류는 그 칸 아래 그대로 보인다", async () => {
    mockServer({
      "GET /api/v1/performances?mine=true": { status: 200, body: { active: [], draft: [], past: [] } },
      "POST /api/v1/inquiries": { status: 400, body: { code: "VALIDATION_FAILED", message: "입력한 내용을 확인해 주세요.", fieldErrors: [{ field: "body", reason: "내용은 2,000자까지 적을 수 있어요" }] } },
    });
    renderAt("/inquiries/new");
    await userEvent.click(await screen.findByRole("radio", { name: "계정" }));
    await userEvent.type(screen.getByRole("textbox", { name: "제목" }), "제목");
    await userEvent.type(screen.getByRole("textbox", { name: "내용" }), "내용");
    await userEvent.click(screen.getByRole("button", { name: "문의 보내기" }));
    expect(await screen.findByText("내용은 2,000자까지 적을 수 있어요")).toBeInTheDocument();
  });
});

describe("문의 보기 (/inquiries/:id)", () => {
  it("답변 대기: 안내와 [지우기]·[고치기], 지우면 확인 뒤 목록으로", async () => {
    const calls = mockServer({
      "GET /api/v1/inquiries/7": { status: 200, body: detail() },
      "GET /api/v1/performances?mine=true": MY_PERFS,
      "DELETE /api/v1/inquiries/7": { status: 204 },
      "GET /api/v1/me/inquiries": list([]),
    });
    renderAt("/inquiries/7");
    expect(await screen.findByText("운영자가 문의를 확인하고 있어요")).toBeInTheDocument();
    expect(await screen.findByText("관련 공연 · 가을밤 밴드 공연 (11월 22일)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "고치기" })).toHaveAttribute("href", "/inquiries/7/edit");
    await userEvent.click(screen.getByRole("button", { name: "지우기" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "지우기" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/inquiries$/));
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("AC-F5-19 답변 완료: 운영자 답변이 보이고 고치기·지우기는 없다", async () => {
    mockServer({
      "GET /api/v1/inquiries/7": { status: 200, body: detail({ status: "ANSWERED", answer: "D-1 취소는 70%예요.", answeredAt: "2026-11-17T10:20:00" }) },
    });
    renderAt("/inquiries/7");
    expect(await screen.findByText("D-1 취소는 70%예요.")).toBeInTheDocument();
    expect(screen.getByText("11월 17일 10:20 답변")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지우기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "고치기" })).not.toBeInTheDocument();
  });

  it("AC-F5-20 남의 문의(404)는 찾을 수 없다고 보인다", async () => {
    mockServer({});
    renderAt("/inquiries/99");
    expect(await screen.findByText("문의를 찾을 수 없어요", { selector: "b" })).toBeInTheDocument();
  });

  it("답변 완료 문의를 고치기 주소로 열면 고칠 수 없다고 보인다", async () => {
    mockServer({ "GET /api/v1/inquiries/7": { status: 200, body: detail({ status: "ANSWERED", answer: "답" }) } });
    renderAt("/inquiries/7/edit");
    expect(await screen.findByText("답변이 달린 문의는 고칠 수 없어요")).toBeInTheDocument();
  });
});

it("연락처 검사: 서버와 같은 규칙", () => {
  expect(hasContact("010-1234-5678")).toBe(true);
  expect(hasContact("110-123-456789")).toBe(true);
  expect(hasContact("공연 2026-12-13 19:00")).toBe(false);
  expect(hasContact("금액 1,250,000원")).toBe(false);
});
