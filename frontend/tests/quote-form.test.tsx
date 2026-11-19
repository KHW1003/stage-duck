import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, PostingDetail } from "../src/shared/api/types";

/** 업체 견적서 작성·보내기 (#41 화면 두 번째) — AC-F2-15·16·17·18·19, 응답 checks[], 409 STAGE_NOT_OPEN */

const SUPPLIER: Me = {
  id: 7, role: "SUPPLIER", status: "ACTIVE", email: "d@stageduck.test", name: "이음향", phone: "01000000000",
  nickname: null, supplierReviewStatus: "APPROVED", landing: "/supplier/postings",
};

const NEEDS: PostingDetail["needs"] = {
  venue: { needed: true, proposalWanted: false, types: ["CULTURE_SPACE"], capacity: 80, budget: null, checkinWish: null, checkoutWish: null, mustHave: [], note: "" },
  equipment: { needed: true, proposalWanted: true, items: [], services: ["TRANSPORT", "INSTALL"], budget: 1500000, owned: [], note: "" },
  engineer: { needed: true, tasks: ["FOH"], conditions: [], etc: "", note: "" },
  ownedVenue: null,
};

const EQUIPMENT_POSTING: PostingDetail = {
  stageId: 2, performanceId: 5, stageType: "EQUIPMENT", status: "OPEN", performanceVersion: 1,
  title: "가을밤 밴드 공연", showDate: "2026-11-28", sido: "광주광역시", sigungu: "동구",
  nickname: "가을밤밴드", rejectionCount: 1, usageCount: 2,
  form: "BAND", rehearsalStart: "17:00", showStart: "19:00", showEnd: "21:00", audience: 80,
  needs: NEEDS, previousStages: [],
};

const VENUE_POSTING: PostingDetail = { ...EQUIPMENT_POSTING, stageId: 1, stageType: "VENUE" };

const APPLICATION = { companyName: "업체 C", categories: ["VENUE"] };
const VENUE_ROW = {
  sido: "광주광역시", sigungu: "동구", venueType: "CULTURE_SPACE", maxCapacity: 120, rentalFee: 500000,
  hasResidentEngineer: false, bandAllowed: true, checkinTime: "15:00", externalEquipmentAllowed: true,
  externalEngineerAllowed: true, hasWaitingRoom: null, hasParking: null,
};
const VENUES = {
  items: [
    { ...VENUE_ROW, id: 3, name: "공간 C", companyName: "업체 C" },
    { ...VENUE_ROW, id: 1, name: "공간 A", companyName: "업체 A" },
  ],
  page: 1, size: 50, total: 2,
};

type Reply = { status: number; body?: unknown };
type Call = { key: string; body: unknown };

/** 같은 주소에 여러 번 답할 때는 배열로 순서대로 */
function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${url}`;
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = routes[key];
      const r = Array.isArray(route) ? route.shift() : route;
      const reply = r ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
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

const ME = { "GET /api/v1/me": { status: 200, body: SUPPLIER } };
const EQUIP = { ...ME, "GET /api/v1/postings/2": { status: 200, body: EQUIPMENT_POSTING } };
const VENUE = {
  ...ME,
  "GET /api/v1/postings/1": { status: 200, body: VENUE_POSTING },
  "GET /api/v1/supplier/application": { status: 200, body: APPLICATION },
  "GET /api/v1/venues?size=50": { status: 200, body: VENUES },
};
const SENT = { quoteId: 77, version: 1, chatRoomId: 31, checks: [] };

/** 칸 하나에 값 넣기. 글자 하나씩 치면 느려서 change 한 번으로 넣는다 (한 글자씩 치는 것은 숫자 칸 테스트에서만) */
async function typeIn(_user: UserEvent, label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** AC-F2-15 예시: 품목 600,000 + 운반 150,000 + 설치 200,000 + 인건비 300,000 + 기타 0 = 1,250,000원 */
async function fillExample(user: UserEvent) {
  await screen.findByLabelText(/견적서 이름/);
  await typeIn(user, /견적서 이름/, "기본형");
  await typeIn(user, "1번 품목 이름", "추가 마이크·밴드 음향");
  await typeIn(user, "1번 분류", "음향");
  await typeIn(user, "1번 수량", "2");
  await typeIn(user, "1번 단가", "300000");
  await typeIn(user, "운반비", "150000");
  await typeIn(user, "설치비", "200000");
  await typeIn(user, "인건비", "300000");
  await user.click(screen.getByLabelText(/설치 포함/));
  await user.click(screen.getByLabelText(/엔지니어 포함/));
  await typeIn(user, "설치 시작", "15:00");
  await typeIn(user, /설치 걸리는 시간/, "90");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("견적서 쓰기 (/supplier/postings/:stageId/quote)", () => {
  it("AC-F2-15 예시 값으로 보내면 본문이 계약서 모양(camelCase, 정수 금액)이고, 완료 안내와 [채팅방으로]·[공고 목록으로]가 보인다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({ ...EQUIP, "POST /api/v1/stages/2/quotes": { status: 201, body: SENT } });
    renderAt("/supplier/postings/2/quote");

    expect(await screen.findByText(/가을밤 밴드 공연/)).toBeInTheDocument();
    await fillExample(user);
    expect(screen.getByTestId("quote-total")).toHaveTextContent("1,250,000원");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    expect(await screen.findByRole("heading", { name: "견적서를 보냈어요" })).toBeInTheDocument();
    const post = calls.find((c) => c.key === "POST /api/v1/stages/2/quotes");
    expect(post?.body).toEqual({
      label: "기본형",
      venueId: null,
      items: [{ name: "추가 마이크·밴드 음향", category: "음향", qty: 2, unitPrice: 300000, amount: 600000 }],
      staff: [],
      setupStart: "15:00",
      setupMinutes: 90,
      teardownMinutes: null,
      includes: { equipment: true, engineer: true, install: true, transport: false },
      amounts: { items: 600000, transport: 150000, install: 200000, labor: 300000, etc: 0 },
      discountAmount: 0,
      totalAmount: 1250000,
      extraCostNote: null,
      techNote: null,
    });
    expect(screen.getByRole("link", { name: "채팅방으로" })).toHaveAttribute("href", "/supplier/postings/2/quote?chat=31");
    expect(screen.getByRole("link", { name: "공고 목록으로" })).toHaveAttribute("href", "/supplier/postings");
  });

  it("AC-F2-15 금액 칸은 숫자만 받고, 칸을 벗어나면 천 단위 쉼표로 보여 준다", async () => {
    const user = userEvent.setup({ delay: null });
    mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");

    await screen.findByLabelText("운반비");
    await user.type(screen.getByLabelText("운반비"), "1a5.0,0000");
    expect(screen.getByLabelText("운반비")).toHaveValue("1500000");
    await user.tab();
    expect(screen.getByLabelText("운반비")).toHaveValue("1,500,000");
  });

  it("AC-F2-16 [다른 견적서 쓰기]로 같은 공고에 다른 이름의 견적서를 하나 더 보낼 수 있다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({
      ...EQUIP,
      "POST /api/v1/stages/2/quotes": [
        { status: 201, body: SENT },
        { status: 201, body: { ...SENT, quoteId: 78, chatRoomId: 31 } },
      ],
    });
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    await user.click(await screen.findByRole("link", { name: "다른 견적서 쓰기" }));

    // 새 빈 양식
    expect(await screen.findByLabelText(/견적서 이름/)).toHaveValue("");
    await fillExample(user);
    await typeIn(user, /견적서 이름/, "고급형");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    await screen.findByRole("heading", { name: "견적서를 보냈어요" });

    const labels = calls.filter((c) => c.key === "POST /api/v1/stages/2/quotes").map((c) => (c.body as { label: string }).label);
    expect(labels).toEqual(["기본형", "고급형"]);
  });

  it("AC-F2-17 항목 금액과 업체할인을 넣으면 합계(항목 합 − 할인)가 바로 바뀐다", async () => {
    const user = userEvent.setup({ delay: null });
    mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    await typeIn(user, "기타", "50000");
    expect(screen.getByTestId("quote-subtotal")).toHaveTextContent("1,300,000원");
    await typeIn(user, "업체할인", "50000");
    expect(screen.getByTestId("quote-total")).toHaveTextContent("1,250,000원");
  });

  it("AC-F2-17 할인이 항목 합보다 크거나 합계가 10,000원 미만이면 보내기 전에 막는다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");

    await screen.findByLabelText(/견적서 이름/);
    await typeIn(user, /견적서 이름/, "기본형");
    await typeIn(user, "운반비", "5000");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    expect(await screen.findByText("금액을 다시 확인해 주세요. 견적서 합계는 10,000원 이상이어야 해요.")).toBeInTheDocument();

    await typeIn(user, "업체할인", "6000");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    expect(await screen.findByText("업체할인은 항목 합계보다 클 수 없어요.")).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("AC-F2-17 서버의 fieldErrors·TOTAL_MISMATCH·TOTAL_TOO_LARGE 문구를 해당 칸 아래에 보여 준다", async () => {
    const user = userEvent.setup({ delay: null });
    mockServer({
      ...EQUIP,
      "POST /api/v1/stages/2/quotes": [
        { status: 400, body: { code: "VALIDATION_FAILED", message: "입력값을 확인해 주세요.", fieldErrors: [{ field: "discountAmount", reason: "서버: 할인이 너무 커요." }] } },
        { status: 400, body: { code: "TOTAL_MISMATCH", message: "서버: 합계가 항목 합과 달라요.", fieldErrors: [] } },
        { status: 400, body: { code: "TOTAL_TOO_LARGE", message: "서버: 합계가 너무 커요.", fieldErrors: [] } },
      ],
    });
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    const send = screen.getByRole("button", { name: "견적서 보내기" });
    await user.click(send);
    const discount = screen.getByLabelText("업체할인");
    await waitFor(() => expect(discount).toHaveAccessibleDescription(/서버: 할인이 너무 커요./));

    await user.click(send);
    const total = screen.getByTestId("quote-total-box");
    expect(await within(total).findByText("서버: 합계가 항목 합과 달라요.")).toBeInTheDocument();

    await user.click(send);
    expect(await within(total).findByText("서버: 합계가 너무 커요.")).toBeInTheDocument();
  });

  it("AC-F2-18 공연장 단계면 내 공간·입실·설치 가능 시각 칸이 나오고 필수다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({ ...VENUE, "POST /api/v1/stages/1/quotes": { status: 201, body: { ...SENT, chatRoomId: null } } });
    renderAt("/supplier/postings/1/quote");

    const venue = await screen.findByRole("combobox", { name: /공간/ });
    await typeIn(user, /견적서 이름/, "대관");
    await typeIn(user, "1번 품목 이름", "공간 대관");
    await typeIn(user, "1번 분류", "대관");
    await typeIn(user, "1번 수량", "1");
    await typeIn(user, "1번 단가", "500000");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    expect(await screen.findAllByText("공연장 견적서에는 꼭 입력해 주세요.")).toHaveLength(3);
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);

    // 내 공간만 보인다 (다른 업체 공간 A 는 없다)
    await user.click(venue);
    expect(screen.queryByRole("option", { name: /공간 A/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /공간 C/ }));
    await typeIn(user, /^입실 시각/, "15:00");
    await typeIn(user, /^설치 가능 시각/, "15:30");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    await screen.findByRole("heading", { name: "견적서를 보냈어요" });
    const body = calls.find((c) => c.key === "POST /api/v1/stages/1/quotes")?.body as Record<string, unknown>;
    expect(body).toMatchObject({ venueId: 3, checkinTime: "15:00", setupAvailableTime: "15:30", totalAmount: 500000 });
  });

  it("AC-F2-18 공연장 단계가 아니면 공간·입실·설치 가능 시각 칸이 없다", async () => {
    mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");

    await screen.findByLabelText(/견적서 이름/);
    expect(screen.queryByRole("combobox", { name: /공간/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^입실 시각/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^설치 가능 시각/)).not.toBeInTheDocument();
  });

  it("AC-F2-19 공연장 업체가 장비·엔지니어 포함을 둘 다 고르면 '풀스펙'이 보인다", async () => {
    const user = userEvent.setup({ delay: null });
    mockServer(VENUE);
    renderAt("/supplier/postings/1/quote");

    await screen.findByLabelText(/장비 포함/);
    expect(screen.queryByText("풀스펙")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/장비 포함/));
    expect(screen.queryByText("풀스펙")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/엔지니어 포함/));
    expect(screen.getAllByText("풀스펙").length).toBeGreaterThan(0);
  });

  it("응답 checks[]의 경고·충돌을 완료 화면에 글자와 함께 보여 준다", async () => {
    const user = userEvent.setup({ delay: null });
    const checks = [
      { id: "CHK-02", result: "WARNING", message: "설치에 쓸 수 있는 시간이 0분이에요 (설치 가능 17:00, 리허설 17:00)." },
      { id: "CHK-03", result: "CONFLICT", message: "철수가 퇴실 마감 22:00 뒤에 끝나요." },
      { id: "CHK-01", result: "PASS", message: "수용 인원 120명 ≥ 관객 80명" },
    ];
    mockServer({ ...EQUIP, "POST /api/v1/stages/2/quotes": { status: 201, body: { ...SENT, checks } } });
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    const list = await screen.findByRole("list", { name: "자동 검사 결과" });
    expect(within(list).getByText(checks[0].message)).toBeInTheDocument();
    expect(within(list).getByText(checks[1].message)).toBeInTheDocument();
    expect(within(list).getByLabelText("검사 결과: 경고")).toBeInTheDocument();
    expect(within(list).getByLabelText("검사 결과: 충돌")).toBeInTheDocument();
    expect(within(list).queryByText(checks[2].message)).not.toBeInTheDocument();
  });

  it("409 STAGE_NOT_OPEN 이면 보낼 수 없는 공고 안내와 [공고 목록으로]가 보인다", async () => {
    const user = userEvent.setup({ delay: null });
    mockServer({
      ...EQUIP,
      "POST /api/v1/stages/2/quotes": { status: 409, body: { code: "STAGE_NOT_OPEN", message: "이 단계는 지금 견적서를 받고 있지 않아요.", fieldErrors: [] } },
    });
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    expect(await screen.findByText("지금은 견적서를 보낼 수 없는 공고예요")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공고 목록으로" })).toHaveAttribute("href", "/supplier/postings");
    expect(screen.queryByRole("button", { name: "견적서 보내기" })).not.toBeInTheDocument();
  });
});
