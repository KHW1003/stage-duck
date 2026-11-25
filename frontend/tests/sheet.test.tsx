import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { TERMS } from "../src/features/support/terms";
import type { Me, Sheet } from "../src/shared/api/types";

/** 최종 담당표 화면 (#53) — AC-F5-11·12. 연락처는 서버가 결제 뒤에만 준다 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밴드", supplierReviewStatus: null, landing: "/me/performances",
};

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    performanceId: 5, title: "가을밤 밴드 공연", showDate: "2026-11-28", sido: "광주광역시", sigungu: "동구", audience: 80,
    paid: true, paidAt: "2026-11-13T15:20:00",
    schedule: [
      { time: "15:00", title: "공간 C 입실", who: "업체 C" },
      { time: "17:00", title: "리허설 · 사운드체크", who: "뮤지션" },
      { time: "19:00", title: "공연 시작", who: "뮤지션" },
    ],
    lines: [
      { stageType: "VENUE", status: "CONFIRMED", companyName: "업체 C", scope: "대관 · 기본 마이크 2", amount: 500000 },
      { stageType: "EQUIPMENT", status: "CONFIRMED", companyName: "업체 D", scope: "음향 장비 · 엔지니어", amount: 1350000 },
      { stageType: "ENGINEER", status: "SKIPPED", companyName: null, scope: "", amount: null },
    ],
    contacts: [
      { role: "USER", name: "가을밴드", realName: "김공연", phone: "010-0000-0000", email: "a@stageduck.test" },
      { role: "공간", name: "업체 C", realName: null, phone: "010-0000-0003", email: "c@stageduck.test" },
    ],
    ...over,
  };
}

function mockServer(routes: Record<string, { status: number; body: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const r = routes[url] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const ME = { "/api/v1/me": { status: 200, body: USER } };

afterEach(() => vi.unstubAllGlobals());

describe("최종 담당표 (/performances/:id/sheet)", () => {
  it("AC-F5-11 결제 뒤에는 일정·담당 범위·서로의 연락처가 보인다", async () => {
    mockServer({ ...ME, "/api/v1/performances/5/sheet": { status: 200, body: sheet() } });
    renderAt("/performances/5/sheet");

    const timeline = await screen.findByRole("list", { name: "당일 일정" });
    expect(within(timeline).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "15:00공간 C 입실업체 C", "17:00리허설 · 사운드체크뮤지션", "19:00공연 시작뮤지션",
    ]);
    expect(screen.getByRole("cell", { name: "건너뜀" })).toBeInTheDocument();
    const contacts = screen.getByRole("complementary", { name: "연락처" });
    expect(within(contacts).getByText("010-0000-0003")).toBeInTheDocument();
    expect(within(contacts).getByText("김공연")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업체 취소 및 이용 규칙 보기" })).not.toBeInTheDocument();
  });

  it("업체는 결제 전에도 담당표에서 취소와 정산 조항을 각각 읽을 수 있다", async () => {
    const supplier: Me = { ...USER, role: "SUPPLIER", supplierReviewStatus: "APPROVED" };
    mockServer({
      "/api/v1/me": { status: 200, body: supplier },
      "/api/v1/performances/5/sheet": { status: 200, body: sheet({ paid: false, paidAt: null, contacts: [] }) },
    });
    renderAt("/performances/5/sheet");

    const cancelTerms = await screen.findByRole("button", { name: "업체 취소 및 이용 규칙 보기" });
    expect(screen.getByRole("table", { name: "취소 시점별 위약금" })).toBeInTheDocument();
    await userEvent.click(cancelTerms);
    const cancelDialog = within(screen.getByRole("dialog", { name: "업체 취소 및 이용 규칙" }));
    const cancellationArticles = cancelDialog.getAllByRole("article").map((article) => article.id);
    expect(cancelDialog.getByRole("heading", { name: "부칙" })).toBeInTheDocument();
    expect(cancelDialog.getByText(/다른 업체의 예약은 유지합니다/)).toBeInTheDocument();
    expect(cancelDialog.queryByRole("heading", { name: "제5조 (정산)" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(cancelTerms).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "입점·견적·이행 및 정산 보기" }));
    const settlement = within(screen.getByRole("dialog", { name: "입점·견적·이행 및 정산" }));
    const settlementArticles = settlement.getAllByRole("article").map((article) => article.id);
    expect([...settlementArticles, ...cancellationArticles]).toEqual(
      TERMS.supplier.chapters.flatMap((chapter) => chapter.articles.map((article) => article.id)),
    );
    expect(settlement.getByRole("heading", { name: "제5조 (정산)" })).toBeInTheDocument();
    expect(settlement.getByText(/위약금을 업체 금액 비율대로/)).toBeInTheDocument();
    expect(settlement.queryByRole("heading", { name: "제6조 (업체 사정 취소)" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "개인정보 처리방침 보기" }));
    const privacy = within(screen.getByRole("dialog", { name: "개인정보 처리방침" }));
    expect(privacy.getByRole("heading", { name: "6. 내 권리" })).toBeInTheDocument();
  });

  it("AC-F5-12 결제 전에는 연락처 대신 안내만", async () => {
    mockServer({ ...ME, "/api/v1/performances/5/sheet": { status: 200, body: sheet({ paid: false, paidAt: null, contacts: [] }) } });
    renderAt("/performances/5/sheet");

    expect(await screen.findByText("결제가 완료되면 서로의 연락처가 여기에 표시됩니다.")).toBeInTheDocument();
    expect(screen.queryByText(/010-/)).not.toBeInTheDocument();
  });

  it("AC-F5-11 확정 안 된 업체·남은 서버 문구(404)를 그대로", async () => {
    mockServer(ME);
    renderAt("/performances/9/sheet");
    expect(await screen.findByText("찾을 수 없어요.")).toBeInTheDocument();
  });
});
