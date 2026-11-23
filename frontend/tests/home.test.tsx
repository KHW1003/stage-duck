import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { dDay } from "../src/features/home/NowPanel";
import { monthCells } from "../src/features/home/PartnerDashboard";
import type { Me, MyPerformances, PerformanceSummary, SupplierApplication } from "../src/shared/api/types";

/** 메인(/)·업체 메인(/partner) — 목업 mockup/home.html · partner.html 을 옮긴 화면 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = { ...USER, id: 7, role: "SUPPLIER", nickname: null, name: "업체 D", supplierReviewStatus: "APPROVED", landing: "/partner" };
const PENDING: Me = { ...SUPPLIER, supplierReviewStatus: "PENDING" };

const PERF: PerformanceSummary = {
  id: 5, title: "80명이 함께할 밴드 공연", form: "BAND", status: "ASSIGNING", showDate: "2026-11-28",
  rehearsalStart: "17:00:00", showStart: "19:00:00", showEnd: "21:00:00", audience: 80,
  sido: "광주", sigungu: "동구", currentVersion: 1,
  stages: [
    { id: 1, stageType: "VENUE", seq: 1, status: "CONFIRMED", quoteCount: 3 },
    { id: 2, stageType: "EQUIPMENT", seq: 2, status: "NEGOTIATING", quoteCount: 2 },
    { id: 3, stageType: "ENGINEER", seq: 3, status: "WAITING", quoteCount: null },
  ],
  nextAction: "NEGOTIATE", nextStageId: 2,
};

const APP: SupplierApplication = {
  businessType: "SOLE_PROPRIETOR", companyName: "업체 D", representativeName: "김대표", businessRegNo: "1234567890",
  businessAddress: "광주", mainPhone: "0620000000", mailOrderNo: null, categories: ["EQUIPMENT", "ENGINEER"],
  reviewStatus: "PENDING", rejectReason: null, appliedAt: "2026-11-12T14:20:00",
};

type Reply = { status: number; body?: unknown };

function mockServer(routes: Record<string, Reply>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const r = routes[`${(init?.method ?? "GET").toUpperCase()} ${url}`] ?? { status: 401, body: { code: "UNAUTHORIZED", message: "", fieldErrors: [] } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
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

describe("메인 (/)", () => {
  it("방문자는 목업과 같은 구역(히어로·공간·이용 방법·FAQ)과 메인 바닥글을 본다", async () => {
    mockServer({});
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: /공연할 공간부터/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "업체신가요?" })).toHaveAttribute("href", "/partner");
    expect(screen.getByRole("heading", { name: "어떤 공간에서 공연하고 싶나요?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "공연 준비, 이렇게 진행돼요." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "자주 묻는 질문" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "푸터 메뉴" })).toBeInTheDocument();
  });

  it("슬라이드는 다음·이전 버튼으로 넘기고, 멈춤 버튼은 재생 버튼으로 바뀐다", async () => {
    mockServer({});
    renderAt("/");
    const carousel = await screen.findByRole("region", { name: "STAGE DUCK 소개" }).catch(() => screen.getByLabelText("STAGE DUCK 소개"));
    const count = () => within(carousel).getByText((_, el) => el?.tagName === "SPAN" && /^\d \/ 5$/.test(el.textContent ?? "")).textContent;
    expect(count()).toMatch(/^\d \/ 5$/); // 처음엔 1 / 5 — 그리는 데 5초가 넘으면 이미 넘어갔을 수 있다
    // 자동 넘김(5초)을 먼저 멈춘다 — 느린 PC·CI 에서 테스트 중에 슬라이드가 저절로 넘어가지 않게
    await userEvent.click(within(carousel).getByRole("button", { name: "자동 넘김 멈추기" }));
    expect(within(carousel).getByRole("button", { name: "자동 넘김 시작" })).toBeInTheDocument();
    const start = Number(count()!.split(" / ")[0]);
    const at = (n: number) => `${((start - 1 + n + 5) % 5) + 1} / 5`;
    await userEvent.click(within(carousel).getByRole("button", { name: "다음 슬라이드" }));
    expect(count()).toBe(at(1));
    await userEvent.click(within(carousel).getByRole("button", { name: "이전 슬라이드" }));
    await userEvent.click(within(carousel).getByRole("button", { name: "이전 슬라이드" }));
    expect(count()).toBe(at(-1));
  });

  it("이용 방법 단계를 누르면 그 단계 미리보기만 보인다", async () => {
    mockServer({});
    renderAt("/");
    const tabs = await screen.findByRole("tablist", { name: "이용 단계" });
    await userEvent.click(within(tabs).getByRole("tab", { name: /업체별 컨펌/ }));
    expect(within(tabs).getByRole("tab", { name: /업체별 컨펌/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("견적 내역 확인");
  });

  it("공간 찾기는 고른 지역·관객 수를 쿼리로 넘긴다", async () => {
    mockServer({});
    renderAt("/");
    const search = await screen.findByRole("search");
    await userEvent.selectOptions(within(search).getByLabelText("지역"), "광주");
    await userEvent.selectOptions(within(search).getByLabelText("관객 수"), "50~150명");
    await userEvent.click(within(search).getByRole("button", { name: "공간 찾기" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/venues?sido=%EA%B4%91%EC%A3%BC&audience=50%7E150%EB%AA%85");
  });

  it("로그인한 사용자는 진행 중인 공연의 단계(컨펌·지금·대기)를 본다", async () => {
    const mine: MyPerformances = { active: [PERF], draft: [], past: [] };
    mockServer({ "GET /api/v1/me": { status: 200, body: USER }, "GET /api/v1/performances?mine=true": { status: 200, body: mine } });
    renderAt("/");
    expect(await screen.findByText("가을밤밴드님, 다시 오셨네요")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "80명이 함께할 밴드 공연" })).toBeInTheDocument();
    expect(screen.getByText("견적서 2장 도착")).toBeInTheDocument();
    expect(screen.getByText("장비를 컨펌하면 공고가 열려요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "비교하기" })).toHaveAttribute("href", "/performances/5");
    expect(screen.getByLabelText("3단계 중 1단계 컨펌")).toBeInTheDocument();
    expect(screen.queryByLabelText("STAGE DUCK 소개")).not.toBeInTheDocument();
  });

  it("처음 가입했거나 진행 중인 공연이 없으면 '시작' 문구와 진행 순서 미리보기, 요청서 쓰기로 안내한다 (11/19 피드백)", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: USER }, "GET /api/v1/performances?mine=true": { status: 200, body: { active: [], draft: [], past: [] } } });
    renderAt("/");
    expect(await screen.findByText("아직 준비 중인 공연이 없어요")).toBeInTheDocument();
    expect(screen.getByText("가을밤밴드님, 반가워요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("공연 준비,시작해 볼까요?");
    expect(screen.queryByRole("link", { name: "받은 견적 비교하기" })).not.toBeInTheDocument();
    const preview = within(screen.getByRole("list", { name: "요청서를 쓰면 진행되는 순서" }));
    expect(preview.getAllByRole("listitem").map((li) => li.querySelector("b")?.textContent)).toEqual(["공연장", "장비", "엔지니어", "통합 결제"]);
    const writes = screen.getAllByRole("link", { name: /새 공연 요청서 쓰기/ });
    expect(writes.length).toBeGreaterThanOrEqual(2);
    writes.forEach((a) => expect(a).toHaveAttribute("href", "/performances/new"));
    expect(screen.getByRole("link", { name: /업체 먼저 둘러보기/ })).toHaveAttribute("href", "/board");
  });
});

describe("업체 메인 (/partner)", () => {
  it("방문자는 입점 안내와 입점 3단계를 본다", async () => {
    mockServer({});
    renderAt("/partner");
    expect(await screen.findByRole("heading", { level: 1, name: /공연이 필요한 곳에/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "입점은 3단계예요." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "입점 신청하기" })[0]).toHaveAttribute("href", "/signup/supplier");
    expect(screen.getByRole("link", { name: "사용자 홈" })).toHaveAttribute("href", "/");
  });

  it("심사 중 업체는 내 신청 내용과 함께 심사 화면을 본다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: PENDING }, "GET /api/v1/supplier/application": { status: 200, body: APP } });
    renderAt("/partner");
    expect(await screen.findByRole("heading", { name: "입점 심사 중이에요" })).toBeInTheDocument();
    expect(await screen.findByText("음향 장비 · 엔지니어")).toBeInTheDocument();
    expect(screen.getByText("개인사업자")).toBeInTheDocument();
    expect(screen.getByText("11월 12일 14:20")).toBeInTheDocument();
  });

  it("승인 업체는 첫 화면을 보고, 공고 필터를 누르면 받은 견적 요청만 남는다", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER } });
    renderAt("/partner");
    expect(await screen.findByRole("heading", { level: 1, name: /업체 D님, 오늘 확인할 일이/ })).toBeInTheDocument();
    const filter = screen.getByRole("tablist", { name: "공고 필터" });
    expect(screen.getAllByRole("heading", { level: 3 }).filter((h) => h.textContent?.includes("공연 ·"))).toHaveLength(3);
    await userEvent.click(within(filter).getByRole("tab", { name: /받은 견적 요청/ }));
    const titles = screen.getAllByRole("heading", { level: 3 }).filter((h) => h.textContent?.includes("공연 ·"));
    expect(titles.map((h) => h.textContent)).toEqual(["연말 합동 공연 · 광주 북구 · 관객 120명"]);
  });
});

describe("메인 계산", () => {
  it("D-day 는 오늘부터 공연일까지 남은 날, 지난 공연은 표시하지 않는다", () => {
    const today = new Date(2026, 10, 13);
    expect(dDay("2026-11-28", today)).toBe("D-15");
    expect(dDay("2026-11-13", today)).toBe("D-DAY");
    expect(dDay("2026-11-12", today)).toBeNull();
  });

  it("2026년 11월 달력은 일요일 1일부터 7칸씩 5줄", () => {
    const cells = monthCells(2026, 10);
    expect(cells).toHaveLength(35);
    expect(cells[0]).toBe(1);
    expect(cells[29]).toBe(30);
    expect(cells.slice(30)).toEqual([null, null, null, null, null]);
  });
});
