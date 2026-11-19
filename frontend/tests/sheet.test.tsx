import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
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
      { time: "17:00", title: "리허설 · 사운드체크", who: "사용자" },
      { time: "19:00", title: "공연 시작", who: "사용자" },
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
      "15:00공간 C 입실업체 C", "17:00리허설 · 사운드체크사용자", "19:00공연 시작사용자",
    ]);
    expect(screen.getByRole("cell", { name: "건너뜀" })).toBeInTheDocument();
    const contacts = screen.getByRole("complementary", { name: "연락처" });
    expect(within(contacts).getByText("010-0000-0003")).toBeInTheDocument();
    expect(within(contacts).getByText("김공연")).toBeInTheDocument();
  });

  it("AC-F5-12 결제 전에는 연락처 대신 안내만", async () => {
    mockServer({ ...ME, "/api/v1/performances/5/sheet": { status: 200, body: sheet({ paid: false, paidAt: null, contacts: [] }) } });
    renderAt("/performances/5/sheet");

    expect(await screen.findByText("결제가 끝나면 서로의 연락처가 여기에 보여요.")).toBeInTheDocument();
    expect(screen.queryByText(/010-/)).not.toBeInTheDocument();
  });

  it("AC-F5-11 확정 안 된 업체·남은 서버 문구(404)를 그대로", async () => {
    mockServer(ME);
    renderAt("/performances/9/sheet");
    expect(await screen.findByText("찾을 수 없어요.")).toBeInTheDocument();
  });
});
