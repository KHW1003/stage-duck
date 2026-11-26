import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { bodyBlocks, type NoticeDetail, type NoticeItem } from "../src/features/support/api";
import { FAQ, searchFaq } from "../src/features/support/faq";

/** 고객지원: 공지사항(AC-F5-21)·자주 묻는 질문·업체 이용 가이드·약관 (목업 v4 notices·faq·guide·terms) */

type Reply = { status: number; body?: unknown };

function mockServer(routes: Record<string, Reply>) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      urls.push(url);
      const r = routes[`${method} ${url}`] ?? { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return urls;
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

const item = (id: number, title: string, over: Partial<NoticeItem> = {}): NoticeItem => ({
  id, title, category: "GUIDE", isPinned: false, publishedAt: "2026-11-16T10:00:00", ...over,
});

describe("공지사항 (/notices)", () => {
  it("AC-F5-21 서버가 준 순서대로(고정 먼저) 고정 표시와 분류를 보인다", async () => {
    mockServer({
      "GET /api/v1/notices": {
        status: 200,
        body: {
          items: [
            item(1, "포트폴리오 시연 서비스 안내", { isPinned: true, publishedAt: "2026-11-10T09:00:00" }),
            item(3, "서버 점검", { category: "MAINTENANCE", publishedAt: "2026-11-17T09:00:00" }),
            item(2, "견적서 최소 금액", { category: "POLICY" }),
          ],
          page: 1,
          totalPages: 1,
          total: 3,
        },
      },
    });
    renderAt("/notices");
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["포트폴리오 시연 서비스 안내", "서버 점검", "견적서 최소 금액"]);
    expect(within(rows[0]).getByText("고정")).toHaveClass("tag--fill");
    expect(rows[0]).toHaveClass("is-pin");
    expect(within(rows[1]).getByText("점검")).toBeInTheDocument();
    expect(within(rows[2]).getByText("11.16")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/notices/1");
  });

  it("쪽 번호를 누르면 그 쪽을 불러오고 주소에 남긴다", async () => {
    const page = (n: number) => ({ status: 200, body: { items: [item(n, `공지 ${n}`)], page: n, totalPages: 2, total: 21 } });
    const urls = mockServer({ "GET /api/v1/notices": page(1), "GET /api/v1/notices?page=2": page(2) });
    renderAt("/notices");
    await userEvent.click(await screen.findByRole("link", { name: "2" }));
    expect(await screen.findByText("공지 2")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/notices?page=2");
    expect(urls).toContain("/api/v1/notices?page=2");
  });

  it("글 보기: 본문 문단·목록, 이전·다음 글, [목록]", async () => {
    const detail: NoticeDetail = {
      ...item(5, "견적서 최소 금액 10,000원 적용", { category: "POLICY" }),
      body: "11월 16일부터 적용해요.\n\n- 0원 견적서는 못 보내요.\n- 할인 뒤 합계 기준이에요.\n\n궁금한 점은 1:1 문의로 알려 주세요.",
      prev: { id: 4, title: "업체할인 칸이 생겼어요", publishedAt: "2026-11-15T10:00:00" },
      next: null,
    };
    mockServer({ "GET /api/v1/notices/5": { status: 200, body: detail } });
    renderAt("/notices/5");
    expect(await screen.findByRole("heading", { level: 1, name: "견적서 최소 금액 10,000원 적용" })).toBeInTheDocument();
    expect(screen.getByText("운영팀 · 2026년 11월 16일")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      expect.arrayContaining(["0원 견적서는 못 보내요.", "할인 뒤 합계 기준이에요."]),
    );
    const nav = screen.getByRole("navigation", { name: "이전·다음 글" });
    expect(within(nav).getByRole("link")).toHaveAttribute("href", "/notices/4");
    expect(within(nav).queryByText("다음 글")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "목록" })).toHaveAttribute("href", "/notices");
  });

  it("없는 공지는 찾을 수 없다고 보인다", async () => {
    mockServer({ "GET /api/v1/notices/9": { status: 404, body: { code: "NOT_FOUND", message: "", fieldErrors: [] } } });
    renderAt("/notices/9");
    expect(await screen.findByRole("heading", { level: 1, name: "공지를 찾을 수 없어요" })).toBeInTheDocument();
  });

  it("본문 나누기: 빈 줄은 문단, '- ' 줄은 목록 (빈 줄로 나뉜 목록은 따로)", () => {
    expect(bodyBlocks("가\n나\n\n- 하나\n- 둘\n\n- 셋")).toEqual([
      { kind: "p", text: "가 나" },
      { kind: "ul", items: ["하나", "둘"] },
      { kind: "ul", items: ["셋"] },
    ]);
  });
});

describe("자주 묻는 질문 (/faq)", () => {
  it("탭을 바꾸면 업체 질문이 보이고 주소에 남는다", async () => {
    renderAt("/faq");
    expect(screen.getByRole("heading", { level: 2, name: "요청서·견적" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "업체" }));
    expect(screen.getByRole("tab", { name: "업체" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 2, name: "입점" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/faq?tab=supplier");
  });

  it("검색하면 맞는 질문만 펼쳐서 보이고, 없으면 1:1 문의를 안내한다", async () => {
    renderAt("/faq");
    await userEvent.type(screen.getByRole("searchbox", { name: "질문 검색" }), "위약금");
    await userEvent.click(screen.getByRole("button", { name: "검색" }));
    const summary = screen.getByText("취소하면 얼마를 돌려받나요?");
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.queryByText("결제는 언제 하나요?")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox", { name: "질문 검색" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "질문 검색" }), "없는말");
    await userEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(screen.getByText("'없는말'에 맞는 질문이 없어요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1:1 문의하기" })).toHaveAttribute("href", "/inquiries/new");
  });

  it("searchFaq: 낱말이 모두 들어간 질문만, 빈 분류는 뺀다", () => {
    expect(searchFaq(FAQ.user, "  ")).toBe(FAQ.user);
    const found = searchFaq(FAQ.supplier, "정산 입금");
    expect(found.map((g) => g.title)).toEqual(["견적서·정산"]);
    expect(found[0].items.map((i) => i.q)).toEqual(["정산은 언제 되나요?"]);
  });
});

describe("업체 이용 가이드 (/guide/supplier)", () => {
  it("8단계와 핵심 단계(5·6), 바로가기 버튼", () => {
    renderAt("/guide/supplier");
    const steps = screen.getAllByRole("listitem").filter((li) => li.querySelector(".guide__no"));
    expect(steps).toHaveLength(8);
    expect(steps.filter((li) => li.classList.contains("is-key")).map((li) => li.querySelector("b")!.textContent)).toEqual([
      "공고 보고 견적서 보내기",
      "채팅으로 조율하고 확정 받기",
    ]);
    expect(screen.getByRole("link", { name: "업체 가입" })).toHaveAttribute("href", "/signup/supplier");
    expect(within(document.querySelector(".guide") as HTMLElement).getByRole("link", { name: "업체 이용약관" })).toHaveAttribute("href", "/terms/supplier");
  });

  it("방문자에게는 업체 화면 버튼이 보이고, 로그인한 뮤지션에게는 숨긴다 (11/26 시연 서버 점검)", async () => {
    mockServer({});
    const guest = renderAt("/guide/supplier");
    expect(await screen.findByRole("link", { name: "서비스 등록" })).toHaveAttribute("href", "/supplier/onboarding");
    guest.unmount();

    mockServer({ "GET /api/v1/me": { status: 200, body: { id: 59, role: "USER", nickname: "광주밴드", landing: "/me/performances" } } });
    renderAt("/guide/supplier");
    expect(await screen.findByRole("link", { name: "업체 가입" })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole("link", { name: "서비스 등록" })).toBeNull());
    expect(screen.queryByRole("link", { name: "공고 목록" })).toBeNull();
    expect(screen.queryByRole("link", { name: "내 예약" })).toBeNull();
  });
});

describe("약관·정책 (/terms/:type)", () => {
  it("주소의 탭을 열고, 시연용 요약본 안내와 버전·시행일을 보인다", () => {
    renderAt("/terms/privacy");
    expect(within(screen.getByRole("navigation", { name: "약관 종류" })).getByRole("link", { name: "개인정보 처리방침" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "STAGE DUCK 개인정보 처리방침" })).toBeInTheDocument();
    expect(screen.getByText("시행일 2026년 11월 17일 · 버전 1.0")).toBeInTheDocument();
    expect(screen.getByText(/포트폴리오 시연용 요약본입니다/)).toBeInTheDocument();
  });

  it("탭을 누르면 그 문서로 바뀌고, 이용약관에는 위약금 표가 있다", async () => {
    renderAt("/terms/supplier");
    await userEvent.click(within(screen.getByRole("navigation", { name: "약관 종류" })).getByRole("link", { name: "이용약관" }));
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/terms\/service$/);
    expect(screen.getByRole("heading", { level: 2, name: "STAGE DUCK 이용약관" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "공연 당일" })).toBeInTheDocument();
    const payment = document.getElementById("service-6")!;
    expect(within(payment).getByText(/플랫폼 밖에서 직접 결제한 거래에는/)).toBeInTheDocument();
    const conduct = document.getElementById("service-8")!;
    expect(within(conduct).queryByText(/계좌이체로 거래하는 일/)).not.toBeInTheDocument();
  });

  it("모르는 종류나 /terms 는 이용약관으로 보낸다", () => {
    renderAt("/terms/unknown");
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/terms\/service$/);
  });

  it("가입 화면 약관 [보기]가 화면을 옮기지 않고 해당 약관 모달을 연다 (#223)", async () => {
    mockServer({});
    renderAt("/signup");
    const [service, privacy] = screen.getAllByRole("button", { name: "보기" });
    await userEvent.click(service);
    expect(within(screen.getByRole("dialog")).getAllByText(/이용약관/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/signup$/);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(privacy);
    expect(within(screen.getByRole("dialog")).getAllByText(/개인정보/).length).toBeGreaterThan(0);
  });
});
