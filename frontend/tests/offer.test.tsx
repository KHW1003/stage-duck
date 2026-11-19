import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { OfferOut, ReceivedOffer, StageOffers } from "../src/features/offer/api";
import { FavoriteSuggest } from "../src/features/offer/FavoriteSuggest";
import type { Me, PerformanceSummary, PrPost } from "../src/shared/api/types";

/** 견적 요청(직접 오퍼)·관심 업체 화면 (#32, AC-F3-16~19). 화면 문구는 "견적 요청" (11/19 팀 결정) */

const USER: Me = {
  id: 12, role: "USER", status: "ACTIVE", email: "u@stageduck.test", name: "김사용", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "이음향", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

const POST: PrPost = {
  id: 3, category: "EQUIPMENT", title: "밴드 음향 장비 일체", supplierId: 9, companyName: "업체 D", sido: "광주광역시",
  priceRange: null, bumpedAt: "2026-11-18T10:00:00", body: "밴드 공연 전문 음향 장비", photos: [], createdAt: "2026-11-18T10:00:00",
};

function perf(id: number, title: string, stageType: "VENUE" | "EQUIPMENT", status: string): PerformanceSummary {
  return {
    id, title, form: "BAND", status: "ASSIGNING", showDate: "2026-11-28", rehearsalStart: "17:00:00", showStart: "19:00:00",
    showEnd: "21:00:00", audience: 80, sido: "광주광역시", sigungu: "동구", currentVersion: 1, nextAction: "WAIT_QUOTES",
    nextStageId: id * 10, stages: [{ id: id * 10, stageType, seq: 2, status: status as never, quoteCount: 0 }],
  };
}
const MINE = { active: [perf(5, "가을밤 밴드 공연", "EQUIPMENT", "OPEN"), perf(6, "공연장 고르는 공연", "VENUE", "OPEN")], draft: [], past: [] };
const NO_OFFERS: StageOffers = { activeCount: 0, limit: 10, items: [] };
const SENT: OfferOut = {
  offerId: 31, supplierId: 9, companyName: "업체 D", status: "PENDING", declineReason: null,
  expiresAt: "2026-11-21T10:00:00", createdAt: "2026-11-19T10:00:00",
};

type Reply = { status: number; body?: unknown };
type Call = { key: string; body: unknown };

/** 같은 주소에 여러 번 답할 때는 배열로 순서대로 (마지막 답은 계속 쓴다) */
function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[key];
      const r = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
      const reply = r ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status });
    }),
  );
  return calls;
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

const AS_USER = {
  "GET /api/v1/me": { status: 200, body: USER },
  "GET /api/v1/pr-posts/3": { status: 200, body: POST },
  "GET /api/v1/performances?mine=true": { status: 200, body: MINE },
  "GET /api/v1/favorites": { status: 200, body: [] },
};

describe("소개 글에서 견적 요청하기 (AC-F3-16)", () => {
  it("말머리 부문(장비)이 열린 내 공연만 고르고, 한마디와 함께 보내면 POST /stages/{id}/offers → 요청 완료 안내, n / 10곳이 늘어난다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/stages/50/offers": [{ status: 200, body: NO_OFFERS }, { status: 200, body: { activeCount: 1, limit: 10, items: [SENT] } }],
      "POST /api/v1/stages/50/offers": { status: 201, body: SENT },
    });
    renderAt("/board/3");
    const box = await screen.findByRole("group", { name: "견적 요청하기" });
    const select = await within(box).findByLabelText("내 공연");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["가을밤 밴드 공연 · 장비 단계"]);
    expect(await within(box).findByText("0 / 10곳")).toBeInTheDocument();

    await user.click(within(box).getByRole("button", { name: "견적 요청하기" }));
    const dialog = screen.getByRole("dialog", { name: "견적 요청하기" });
    expect(dialog).toHaveTextContent("업체 D에 견적을 요청할까요?");
    await user.type(within(dialog).getByRole("textbox"), "리허설 17시 가능할까요?");
    await user.click(within(dialog).getByRole("button", { name: "견적 요청하기" }));

    expect(await screen.findByText("업체 D에 견적을 요청했어요")).toBeInTheDocument();
    expect(calls.find((c) => c.key === "POST /api/v1/stages/50/offers")?.body).toEqual({ supplierId: 9, message: "리허설 17시 가능할까요?" });
    await user.click(screen.getByRole("button", { name: "확인" }));
    expect(await within(box).findByText(/이미 요청했어요 · 답변 기다리는 중/)).toBeInTheDocument();
    expect(within(box).getByText("1 / 10곳")).toBeInTheDocument();
  });

  it("연락처 모양 한마디는 서버 400 문구를 칸 아래에, 10곳이 차면 버튼이 막힌다 (AC-F3-17)", async () => {
    const user = userEvent.setup();
    mockServer({
      ...AS_USER,
      "GET /api/v1/stages/50/offers": { status: 200, body: NO_OFFERS },
      "POST /api/v1/stages/50/offers": {
        status: 400,
        body: { code: "VALIDATION_FAILED", message: "입력한 내용을 확인해 주세요.", fieldErrors: [{ field: "message", reason: "전화번호·계좌번호는 적을 수 없어요. 연락처는 결제 뒤 최종 담당표에서 공개돼요." }] },
      },
    });
    renderAt("/board/3");
    const box = await screen.findByRole("group", { name: "견적 요청하기" });
    await user.click(await within(box).findByRole("button", { name: "견적 요청하기" }));
    const dialog = screen.getByRole("dialog", { name: "견적 요청하기" });
    await user.type(within(dialog).getByRole("textbox"), "010-1234-5678");
    await user.click(within(dialog).getByRole("button", { name: "견적 요청하기" }));
    expect(await within(dialog).findByText(/연락처는 결제 뒤 최종 담당표에서 공개돼요/)).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("10곳에 이미 요청한 단계면 [견적 요청하기]가 막히고 안내가 보인다", async () => {
    const others = Array.from({ length: 10 }, (_, i) => ({ ...SENT, offerId: 100 + i, supplierId: 100 + i }));
    mockServer({ ...AS_USER, "GET /api/v1/stages/50/offers": { status: 200, body: { activeCount: 10, limit: 10, items: others } } });
    renderAt("/board/3");
    const box = await screen.findByRole("group", { name: "견적 요청하기" });
    expect(await within(box).findByText("10 / 10곳")).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: "견적 요청하기" })).toBeDisabled();
    expect(within(box).getByText("한 단계에 동시에 10곳까지 요청할 수 있어요.")).toBeInTheDocument();
  });

  it("방문자는 로그인 안내, 업체 계정에는 관심 업체 하트가 없다", async () => {
    mockServer({ "GET /api/v1/pr-posts/3": { status: 200, body: POST }, "GET /api/v1/me": { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } } });
    const a = renderAt("/board/3");
    const box = await screen.findByRole("group", { name: "견적 요청하기" });
    expect(await within(box).findByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?next=/board/3");
    a.unmount();
    mockServer({ "GET /api/v1/pr-posts/3": { status: 200, body: POST }, "GET /api/v1/me": { status: 200, body: SUPPLIER } });
    renderAt("/board/3");
    await screen.findByRole("group", { name: "견적 요청하기" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /관심 업체 저장/ })).not.toBeInTheDocument());
  });
});

describe("관심 업체 저장 (AC-F3-16)", () => {
  it("하트를 누르면 POST /favorites, 다시 누르면 DELETE /favorites/{id}", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/stages/50/offers": { status: 200, body: NO_OFFERS },
      "GET /api/v1/favorites": [
        { status: 200, body: [] },
        { status: 200, body: [{ supplierId: 9, companyName: "업체 D", categories: ["EQUIPMENT"], stageTypes: ["EQUIPMENT"] }] },
        { status: 200, body: [] },
      ],
      "POST /api/v1/favorites": { status: 204 },
      "DELETE /api/v1/favorites/9": { status: 204 },
    });
    renderAt("/board/3");
    const heart = await screen.findByRole("button", { name: "관심 업체 저장" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await user.click(heart);
    expect(await screen.findByRole("button", { name: "관심 업체 저장됨" })).toHaveAttribute("aria-pressed", "true");
    expect(calls.find((c) => c.key === "POST /api/v1/favorites")?.body).toEqual({ supplierId: 9 });
    await user.click(screen.getByRole("button", { name: "관심 업체 저장됨" }));
    expect(await screen.findByRole("button", { name: "관심 업체 저장" })).toBeInTheDocument();
    expect(calls.some((c) => c.key === "DELETE /api/v1/favorites/9")).toBe(true);
  });
});

describe("관심 업체 화면 (/favorites)", () => {
  it("저장한 업체를 보여 주고, 그 부문 단계가 열린 공연이 있으면 바로 견적 요청, [빼기]는 DELETE", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/favorites": {
        status: 200,
        body: [
          { supplierId: 9, companyName: "업체 D", categories: ["EQUIPMENT", "INSTALL"], stageTypes: ["EQUIPMENT"] },
          { supplierId: 4, companyName: "업체 E", categories: ["ENGINEER"], stageTypes: ["ENGINEER"] },
        ],
      },
      "GET /api/v1/stages/50/offers": { status: 200, body: NO_OFFERS },
      "DELETE /api/v1/favorites/4": { status: 204 },
    });
    renderAt("/favorites");
    const list = await screen.findByRole("list", { name: "관심 업체 목록" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("업체 D");
    expect(rows[0]).toHaveTextContent("가을밤 밴드 공연 · 장비 단계가 열려 있어요");
    expect(within(rows[1]).queryByRole("button", { name: "견적 요청하기" })).not.toBeInTheDocument();
    await user.click(within(rows[0]).getByRole("button", { name: "견적 요청하기" }));
    expect(screen.getByRole("dialog", { name: "견적 요청하기" })).toHaveTextContent("가을밤 밴드 공연 · 장비 단계");
    await user.keyboard("{Escape}");
    await user.click(within(rows[1]).getByRole("button", { name: "업체 E 관심 업체에서 빼기" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /api/v1/favorites/4")).toBe(true));
  });

  it("저장한 업체가 없으면 공간 찾기·업체 찾기로 안내", async () => {
    mockServer(AS_USER);
    renderAt("/favorites");
    const empty = (await screen.findByText("저장한 업체가 없어요")).closest(".empty") as HTMLElement;
    expect(within(empty).getByRole("link", { name: "업체 찾기" })).toHaveAttribute("href", "/board");
  });
});

describe("저장한 업체에 견적을 요청할까요? (AC-F3-19)", () => {
  it("열린 단계 부문과 맞는 관심 업체만 보여 주고, 이미 요청한 업체는 상태를 보여 준다", async () => {
    mockServer({
      "GET /api/v1/favorites": {
        status: 200,
        body: [
          { supplierId: 9, companyName: "업체 D", categories: ["EQUIPMENT"], stageTypes: ["EQUIPMENT"] },
          { supplierId: 8, companyName: "업체 F", categories: ["INSTALL"], stageTypes: ["EQUIPMENT"] },
          { supplierId: 4, companyName: "공간 C", categories: ["VENUE"], stageTypes: ["VENUE"] },
        ],
      },
      "GET /api/v1/stages/50/offers": { status: 200, body: { activeCount: 1, limit: 10, items: [{ ...SENT, status: "QUOTED" }] } },
    });
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <FavoriteSuggest stage={{ id: 50, stageType: "EQUIPMENT", seq: 2, status: "OPEN", quoteCount: 1 }} title="가을밤 밴드 공연" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const box = await screen.findByRole("group", { name: "저장한 업체에 견적 요청" });
    expect(box).toHaveTextContent("저장한 장비 업체에 견적을 요청할까요?");
    const rows = within(box).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["업체 D견적서 받음", "업체 F견적 요청하기"]);
  });
});

describe("받은 견적 요청 (/supplier/offers)", () => {
  const RECEIVED: ReceivedOffer = {
    offerId: 31, stageId: 50, stageType: "EQUIPMENT", stageOpen: true, performanceId: 5, title: "가을밤 밴드 공연",
    showDate: "2026-11-28", sido: "광주광역시", sigungu: "동구", audience: 80, nickname: "가을밤밴드", message: "리허설 17시 가능할까요?",
    status: "PENDING", declineReason: null, expiresAt: new Date(Date.now() + 47.5 * 3600000).toISOString(), createdAt: "2026-11-19T10:00:00",
  };
  const AS_SUPPLIER = { "GET /api/v1/me": { status: 200, body: SUPPLIER } };

  it("닉네임·한마디·남은 시간, [견적서 쓰기]는 그 공고 견적서로, [거절하기]는 사유와 함께 POST", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...AS_SUPPLIER,
      "GET /api/v1/supplier/offers": [
        { status: 200, body: [RECEIVED, { ...RECEIVED, offerId: 30, title: "지난 요청", status: "DECLINED", declineReason: "SCHEDULE" }] },
        { status: 200, body: [{ ...RECEIVED, status: "DECLINED", declineReason: "BUDGET" }] },
      ],
      "POST /api/v1/offers/31/decline": { status: 204 },
    });
    renderAt("/supplier/offers");
    const list = await screen.findByRole("list", { name: "받은 견적 요청 목록" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("장비 단계 · 11월 28일(토)");
    expect(first).toHaveTextContent("가을밤밴드");
    expect(first).toHaveTextContent("“리허설 17시 가능할까요?”");
    expect(first).toHaveTextContent("47시간 남음");
    expect(within(first).getByRole("link", { name: "견적서 쓰기" })).toHaveAttribute("href", "/supplier/postings/50/quote");
    expect(second).toHaveTextContent("거절함");
    expect(second).toHaveTextContent("사유: 일정이 맞지 않아요");
    expect(within(second).queryByRole("button", { name: "거절하기" })).not.toBeInTheDocument();

    await user.click(within(first).getByRole("button", { name: "거절하기" }));
    const dialog = screen.getByRole("dialog", { name: "견적 요청 거절" });
    await user.click(within(dialog).getByLabelText("예산이 맞지 않아요"));
    await user.click(within(dialog).getByRole("button", { name: "거절하기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.find((c) => c.key === "POST /api/v1/offers/31/decline")?.body).toEqual({ reason: "BUDGET" });
  });

  it("받은 요청이 없으면 소개 글로 안내", async () => {
    mockServer({ ...AS_SUPPLIER, "GET /api/v1/supplier/offers": { status: 200, body: [] } });
    renderAt("/supplier/offers");
    expect(await screen.findByText("받은 견적 요청이 없어요")).toBeInTheDocument();
  });
});
