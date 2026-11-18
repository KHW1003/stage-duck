import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { Me } from "../src/shared/api/types";

/** 요청서 STEP1·STEP2·게시 화면 (/performances/new, #36) — AC-F2-04, AC-F2-08, AC-F2-09, AC-F2-10 */

const USER: Me = {
  id: 3,
  role: "USER",
  status: "ACTIVE",
  email: "a@stageduck.test",
  name: "김공연",
  phone: "01000000000",
  nickname: "가을밴드",
  supplierReviewStatus: null,
  landing: "/me/performances",
};

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

function mockServer(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = routes[`${method} ${url}`] ?? { status: 404, body: { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

const CREATED: Reply = { status: 201, body: { id: 41, status: "DRAFT", currentVersion: 1 } };
const PUBLISHED: Reply = {
  status: 200,
  body: {
    id: 41,
    status: "PUBLISHED",
    stages: [
      { id: 1, stageType: "VENUE", seq: 1, status: "OPEN" },
      { id: 2, stageType: "ENGINEER", seq: 3, status: "WAITING" },
    ],
  },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/performances/new"]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const setValue = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

/** AC-F2-07 대표 요청: 11월 28일(토) 19~21시, 80명, 리허설 17시, 광주 동구 */
async function fillStep1(user: ReturnType<typeof userEvent.setup>, audience = "80") {
  await user.type(await screen.findByLabelText(/^공연명/), "가을밤 밴드 공연");
  await user.click(screen.getByRole("radio", { name: "밴드" }));
  setValue(screen.getByLabelText(/^공연 날짜/), "2026-11-28");
  setValue(screen.getByLabelText(/^리허설 시작/), "17:00");
  setValue(screen.getByLabelText(/^공연 시작/), "19:00");
  setValue(screen.getByLabelText(/^공연 종료/), "21:00");
  await user.clear(screen.getByLabelText(/^예상 관객/));
  await user.type(screen.getByLabelText(/^예상 관객/), audience);
  await user.selectOptions(screen.getByLabelText(/^시·도/), "광주광역시");
  await user.type(screen.getByLabelText(/^시·군·구/), "동구");
}

async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await fillStep1(user);
  await user.click(screen.getByRole("button", { name: "다음 단계" }));
  await screen.findByRole("heading", { name: /필요한 것/ });
}

const section = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0)); // 오늘 = 11월 12일
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("요청서 쓰기 (/performances/new)", () => {
  it.each(["0", "501"])("AC-F2-04 예상 관객 %s명이면 다음 단계로 넘어가지 않고 이유가 보인다", async (audience) => {
    const user = userEvent.setup();
    const calls = mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderPage();

    await fillStep1(user, audience);
    await user.click(screen.getByRole("button", { name: "다음 단계" }));

    expect(await screen.findByText(/1명에서 500명 사이/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^예상 관객/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("heading", { name: /필요한 것/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("AC-F2-09 장비 칸을 처음 열면 미리 들어 있는 장비가 하나도 없다", async () => {
    const user = userEvent.setup();
    mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderPage();
    await goToStep2(user);

    const equipment = section("장비");
    expect(within(equipment).queryAllByLabelText(/^장비 이름/)).toHaveLength(0);
    expect(within(equipment).getByText("미리 들어 있는 장비는 없어요.")).toBeInTheDocument();
  });

  it("AC-F2-08 장비를 \"이미 있어요\"로 바꾸면 장비 칸이 사라지고, 장비 단계 없이 게시된다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: USER },
      "POST /api/v1/performances": CREATED,
      "POST /api/v1/performances/41/publish": PUBLISHED,
    });
    renderPage();
    await goToStep2(user);

    await user.click(within(section("장비")).getByRole("radio", { name: "이미 있어요" }));
    expect(within(section("장비")).queryByText("원하는 장비")).not.toBeInTheDocument();
    await user.click(within(section("엔지니어")).getByRole("checkbox", { name: /메인 음향/ }));
    await user.click(screen.getByRole("button", { name: "확인하고 게시하기" }));
    const dialog = await screen.findByRole("dialog", { name: "공고 게시" });
    expect(within(dialog).queryByText("장비")).not.toBeInTheDocument(); // 모집 순서에 장비가 없다
    await user.click(within(dialog).getByRole("button", { name: "게시하기" }));

    expect(await screen.findByText(/공고를 올렸어요/)).toBeInTheDocument();
    const sent = calls.find((c) => c.url === "/api/v1/performances")!.body as { needs: { equipment: { needed: boolean } } };
    expect(sent.needs.equipment.needed).toBe(false);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toContain("POST /api/v1/performances/41/publish");
  });

  it("AC-F2-10 엔지니어가 필요한데 작업을 고르지 않으면 넘어가지 않고 이유가 보인다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ "GET /api/v1/me": { status: 200, body: USER } });
    renderPage();
    await goToStep2(user);

    await user.click(screen.getByRole("button", { name: "확인하고 게시하기" }));

    expect(within(section("엔지니어")).getByText("엔지니어에게 맡길 작업을 하나 이상 골라 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("서버가 STEP1 칸을 거부하면 STEP1로 돌아가 그 칸 아래에 서버 문구가 보인다", async () => {
    const user = userEvent.setup();
    const reason = "공연 14일 전까지만 요청할 수 있어요. 11월 26일 이후 날짜를 골라 주세요.";
    mockServer({
      "GET /api/v1/me": { status: 200, body: USER },
      "POST /api/v1/performances": {
        status: 400,
        body: { code: "VALIDATION_FAILED", message: "입력한 내용을 확인해 주세요.", fieldErrors: [{ field: "showDate", reason }] },
      },
    });
    renderPage();
    await goToStep2(user);
    await user.click(within(section("엔지니어")).getByRole("checkbox", { name: /메인 음향/ }));
    await user.click(screen.getByRole("button", { name: "확인하고 게시하기" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "게시하기" }));

    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByLabelText(/^공연 날짜/)).toHaveAttribute("aria-invalid", "true");
  });

  it("작성은 됐는데 게시가 실패하면, 다시 누를 때 요청서를 또 만들지 않고 게시만 다시 한다", async () => {
    const user = userEvent.setup();
    const routes: Record<string, Reply> = {
      "GET /api/v1/me": { status: 200, body: USER },
      "POST /api/v1/performances": CREATED,
      "POST /api/v1/performances/41/publish": {
        status: 500,
        body: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요.", fieldErrors: [] },
      },
    };
    const calls = mockServer(routes);
    renderPage();
    await goToStep2(user);
    await user.click(within(section("엔지니어")).getByRole("checkbox", { name: /메인 음향/ }));
    await user.click(screen.getByRole("button", { name: "확인하고 게시하기" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "게시하기" }));
    expect(await screen.findByText("잠시 뒤 다시 시도해 주세요.")).toBeInTheDocument();

    routes["POST /api/v1/performances/41/publish"] = PUBLISHED;
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "게시하기" }));

    expect(await screen.findByText(/공고를 올렸어요/)).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/api/v1/performances")).toHaveLength(1);
  });
});
