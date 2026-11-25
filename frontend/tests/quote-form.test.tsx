import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me, PostingDetail } from "../src/shared/api/types";
import { pickOption } from "./pickOption";

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

/** GET /supplier/venues (VenueOut 배열). 서버가 내 공간만 준다. 관리자가 숨긴 공간(HIDDEN)도 들어 있다 */
const VENUE_ROW = {
  sido: "광주광역시", sigungu: "동구", address: "가상로 1", venueType: "CULTURE_SPACE", maxCapacity: 120,
  checkinTime: "15:00", checkoutTime: "23:00", rentalFee: 500000, hasResidentEngineer: false, bandAllowed: true,
  externalEquipmentAllowed: true, externalEngineerAllowed: true, hasWaitingRoom: null, hasStagePlatform: null,
  hasParking: null, hallRegistered: null, equipment: [],
};
const MY_VENUES = [
  { ...VENUE_ROW, id: 3, name: "공간 C", status: "ACTIVE" },
  { ...VENUE_ROW, id: 4, name: "공간 D", status: "HIDDEN" },
];

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

const REVIEW = { version: "1.0:1.0", reviewed: true };
const ME = {
  "GET /api/v1/me": { status: 200, body: SUPPLIER },
  "GET /api/v1/supplier/terms-review": { status: 200, body: REVIEW },
};
const EQUIP = { ...ME, "GET /api/v1/postings/2": { status: 200, body: EQUIPMENT_POSTING } };
const VENUE = {
  ...ME,
  "GET /api/v1/postings/1": { status: 200, body: VENUE_POSTING },
  "GET /api/v1/supplier/venues": { status: 200, body: MY_VENUES },
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
  await pickOption(screen.getByLabelText("설치 시작"), "15:00");
  await typeIn(user, /설치 걸리는 시간/, "90");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("견적서 쓰기 (/supplier/postings/:stageId/quote)", () => {
  it("약관 전문을 차례로 확인하기 전에는 견적을 보내지 않는다", async () => {
    let reachEnd = () => {};
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        reachEnd = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
    });
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({
      ...EQUIP,
      "GET /api/v1/supplier/terms-review": { status: 200, body: { ...REVIEW, reviewed: false } },
      "PUT /api/v1/supplier/terms-review": { status: 200, body: REVIEW },
      "POST /api/v1/stages/2/quotes": { status: 201, body: SENT },
    });
    renderAt("/supplier/postings/2/quote");
    await fillExample(user);
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "본문 닫기" }));
    expect(screen.getByLabelText(/견적서 이름/)).toHaveValue("기본형");
    expect(calls.filter(({ key }) => /^(PUT|POST)/.test(key))).toEqual([]);

    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    for (const title of ["입점·견적·이행 및 정산", "업체 취소 및 이용 규칙", "개인정보 처리방침"]) {
      const dialog = within(screen.getByRole("dialog", { name: title }));
      const next = dialog.getByRole("button", {
        name: title === "개인정보 처리방침" ? "확인하고 견적 보내기" : "확인하고 다음",
      });
      expect(next).toBeDisabled();
      act(() => reachEnd());
      await user.click(next);
    }
    expect(await screen.findByRole("heading", { name: "견적서를 보냈어요" })).toBeInTheDocument();
    expect(calls.filter(({ key }) => /^(PUT|POST)/.test(key)).map(({ key }) => key)).toEqual([
      "PUT /api/v1/supplier/terms-review", "POST /api/v1/stages/2/quotes",
    ]);
  });

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
    // AC-F2-20 들어오는 길: 보낸 견적서를 고치는 화면으로
    expect(screen.getByRole("link", { name: "견적서 고치기" })).toHaveAttribute("href", "/supplier/quotes/77/edit");
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

  it("AC-F2-15 금액 칸에 최대값(4,294,967,295원)을 넘게 적으면 값을 바꾸지 않고 칸 아래에 안내하고, 보내지 않는다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    await typeIn(user, "운반비", "4294967296");
    const transport = screen.getByLabelText("운반비");
    // 4,294,967,295로 몰래 줄이지 않는다 (칸 밖이라 쉼표 모양)
    expect(transport).toHaveValue("4,294,967,296");
    expect(transport).toHaveAccessibleDescription(/4,294,967,295원 이하로 적어 주세요./);

    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("AC-F2-17 칸마다 최대값 이하여도 합계가 최대값을 넘으면 보내기 전에 합계 아래에 안내한다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");

    await fillExample(user);
    await typeIn(user, "운반비", "4294967295");
    expect(screen.getByLabelText("운반비")).not.toHaveAccessibleDescription(/이하로 적어 주세요/);
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    const total = screen.getByTestId("quote-total-box");
    expect(await within(total).findByText("항목 금액의 합이 너무 커요. 합계는 4,294,967,295원 이하여야 해요.")).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("AC-F2-17 금액이 최대값(4,294,967,295원) 딱이면 그대로 보낸다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({ ...VENUE, "POST /api/v1/stages/1/quotes": { status: 201, body: { ...SENT, chatRoomId: null } } });
    renderAt("/supplier/postings/1/quote");

    await screen.findByLabelText(/^대관료/);
    await typeIn(user, /견적서 이름/, "대관");
    await typeIn(user, /^대관료/, "4294967295");
    expect(screen.getByLabelText(/^대관료/)).not.toHaveAccessibleDescription(/이하로 적어 주세요/);
    await user.click(screen.getByRole("combobox", { name: /공간/ }));
    await user.click(await screen.findByRole("option", { name: /공간 C/ }));
    await pickOption(screen.getByLabelText(/^입실 시각/), "15:00");
    await pickOption(screen.getByLabelText(/^설치 가능 시각/), "15:30");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    await screen.findByRole("heading", { name: "견적서를 보냈어요" });
    const body = calls.find((c) => c.key === "POST /api/v1/stages/1/quotes")?.body as Record<string, unknown>;
    expect(body).toMatchObject({ amounts: { items: 4294967295 }, totalAmount: 4294967295 });
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
    await typeIn(user, /^대관료/, "500000");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    expect(await screen.findAllByText("공연장 견적서에는 꼭 입력해 주세요.")).toHaveLength(3);
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);

    // GET /supplier/venues 가 준 내 공간만 보인다 (다른 업체 공간 A 는 없고, 숨긴 공간 D 도 뺀다)
    expect(calls.some((c) => c.key === "GET /api/v1/supplier/venues")).toBe(true);
    expect(calls.some((c) => c.key.startsWith("GET /api/v1/venues"))).toBe(false);
    await user.click(venue);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("공간 C")]);
    expect(screen.queryByRole("option", { name: /공간 A/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /공간 D/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /공간 C/ }));
    await pickOption(screen.getByLabelText(/^입실 시각/), "15:00");
    await pickOption(screen.getByLabelText(/^설치 가능 시각/), "15:30");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    await screen.findByRole("heading", { name: "견적서를 보냈어요" });
    const body = calls.find((c) => c.key === "POST /api/v1/stages/1/quotes")?.body as Record<string, unknown>;
    expect(body).toMatchObject({ venueId: 3, checkinTime: "15:00", setupAvailableTime: "15:30", totalAmount: 500000 });
  });

  it("AC-F2-17 공연장 단계는 품목 표·운반·설치·인건비·기타 대신 대관료 한 칸이고, 합계 = 대관료 − 할인으로 보낸다", async () => {
    const user = userEvent.setup({ delay: null });
    const calls = mockServer({ ...VENUE, "POST /api/v1/stages/1/quotes": { status: 201, body: { ...SENT, chatRoomId: null } } });
    renderAt("/supplier/postings/1/quote");

    await screen.findByLabelText(/^대관료/);
    expect(screen.queryByLabelText("1번 품목 이름")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "품목 추가" })).not.toBeInTheDocument();
    for (const name of ["운반비", "설치비", "인건비", "기타"]) expect(screen.queryByLabelText(name)).not.toBeInTheDocument();

    await typeIn(user, /견적서 이름/, "대관");
    await typeIn(user, /^대관료/, "500000");
    await typeIn(user, /^업체할인/, "20000");
    expect(screen.getByTestId("quote-total")).toHaveTextContent("480,000원");

    // 최소 금액 검사는 그대로: 대관료 25,000 − 할인 20,000 = 5,000원이면 막는다
    await typeIn(user, /^대관료/, "25000");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));
    expect(await screen.findByText("금액을 다시 확인해 주세요. 견적서 합계는 10,000원 이상이어야 해요.")).toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);

    await typeIn(user, /^대관료/, "500000");
    await user.click(screen.getByRole("combobox", { name: /공간/ }));
    await user.click(await screen.findByRole("option", { name: /공간 C/ }));
    await pickOption(screen.getByLabelText(/^입실 시각/), "15:00");
    await pickOption(screen.getByLabelText(/^설치 가능 시각/), "15:30");
    await user.click(screen.getByRole("button", { name: "견적서 보내기" }));

    await screen.findByRole("heading", { name: "견적서를 보냈어요" });
    const body = calls.find((c) => c.key === "POST /api/v1/stages/1/quotes")?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      items: [{ name: "대관료", category: "대관", qty: 1, unitPrice: 500000, amount: 500000 }],
      amounts: { items: 500000, transport: 0, install: 0, labor: 0, etc: 0 },
      discountAmount: 20000,
      totalAmount: 480000,
    });
  });

  it("설치 가능 시각(공연장)·설치 시작(장비 업체) 칸 아래에 뜻을 한 줄로 알려 준다", async () => {
    mockServer(VENUE);
    const venue = renderAt("/supplier/postings/1/quote");
    expect(await screen.findByText("이 시각부터 장비를 들여와도 돼요")).toBeInTheDocument();
    expect(screen.queryByText("이 시각에 설치를 시작해요")).not.toBeInTheDocument();
    venue.unmount();
    vi.unstubAllGlobals();

    mockServer(EQUIP);
    renderAt("/supplier/postings/2/quote");
    expect(await screen.findByText("이 시각에 설치를 시작해요")).toBeInTheDocument();
    expect(screen.queryByText("이 시각부터 장비를 들여와도 돼요")).not.toBeInTheDocument();
  });

  it("AC-F2-18 등록한 공간이 없으면 공간을 먼저 등록하라고 안내한다", async () => {
    mockServer({ ...VENUE, "GET /api/v1/supplier/venues": { status: 200, body: [] } });
    renderAt("/supplier/postings/1/quote");

    expect(await screen.findByText("먼저 공간을 등록해 주세요.")).toBeInTheDocument();
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
