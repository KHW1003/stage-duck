import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import type { VenueDetail, VenueListItem } from "../src/features/venue/api";
import { DEFAULT_COND, condFromQuery, filterVenues, toQuery } from "../src/features/venue/filter";
import { REGIONS } from "../src/features/venue/view";
import { ageOn, localErrors } from "../src/pages/SignupPage";
import type { Me } from "../src/shared/api/types";
import { pickDate } from "./pickDate";

/** 로그인·가입·비밀번호 찾기·공간 찾기·공간 상세 (목업 v4 login·signup·password·spaces·space) */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "a@stageduck.test", name: "김공연", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
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
      const r = routes[`${method} ${url}`] ?? { status: 401, body: { code: "UNAUTHENTICATED", message: "", fieldErrors: [] } };
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

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const err = (code: string, message: string, fieldErrors: { field: string; reason: string }[] = []) => ({ code, message, fieldErrors });

describe("로그인 (/login)", () => {
  it("AC-F1-11 로그인하면 서버가 정한 첫 화면으로 간다", async () => {
    const calls = mockServer({ "POST /api/v1/auth/login": { status: 200, body: { id: 3, role: "USER", nickname: "가을밤밴드", landing: "/community" } } });
    renderAt("/login");
    await userEvent.type(screen.getByLabelText("이메일"), "a@stageduck.test");
    await userEvent.type(screen.getByLabelText("비밀번호"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/community"));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ email: "a@stageduck.test", password: "password1" });
  });

  it("로그인이 필요한 화면에서 왔으면(?next=) 그 화면으로, 바깥 주소는 무시한다", async () => {
    mockServer({ "POST /api/v1/auth/login": { status: 200, body: { id: 3, role: "USER", nickname: "x", landing: "/community" } } });
    renderAt("/login?next=//evil.example");
    await userEvent.type(screen.getByLabelText("이메일"), "a@stageduck.test");
    await userEvent.type(screen.getByLabelText("비밀번호"), "password1");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/community"));
  });

  it("AC-F1-04 비밀번호가 틀리면 서버 문구가 입력칸 아래에, AC-F1-08 5회 실패는 안내 상자로 보인다", async () => {
    mockServer({ "POST /api/v1/auth/login": { status: 401, body: err("UNAUTHENTICATED", "이메일이나 비밀번호가 맞지 않아요.") } });
    renderAt("/login");
    await userEvent.type(screen.getByLabelText("이메일"), "a@stageduck.test");
    await userEvent.type(screen.getByLabelText("비밀번호"), "wrong1234");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이메일이나 비밀번호가 맞지 않아요.");

    vi.unstubAllGlobals();
    mockServer({ "POST /api/v1/auth/login": { status: 401, body: err("LOGIN_LOCKED", "로그인을 여러 번 잘못해서 잠시 막혔어요. 15:10 이후에 다시 시도해 주세요.") } });
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByText(/15:10 이후에/)).toBeInTheDocument();
  });

  it("[이메일 저장]을 켜고 로그인하면 다음에 이메일이 채워져 있다", async () => {
    mockServer({ "POST /api/v1/auth/login": { status: 200, body: { id: 3, role: "USER", nickname: "x", landing: "/" } } });
    const first = renderAt("/login");
    await userEvent.type(screen.getByLabelText("이메일"), "a@stageduck.test");
    await userEvent.type(screen.getByLabelText("비밀번호"), "password1");
    await userEvent.click(screen.getByLabelText("이메일 저장"));
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));
    await screen.findByTestId("where");
    first.unmount();
    renderAt("/login");
    expect(screen.getByLabelText("이메일")).toHaveValue("a@stageduck.test");
  });
});

describe("사용자 가입 (/signup)", () => {
  it("만 14세는 생일이 지나야 된다", () => {
    expect(ageOn("2012-11-18", new Date(2026, 10, 18))).toBe(14);
    expect(ageOn("2012-11-19", new Date(2026, 10, 18))).toBe(13);
  });

  it("빈 칸·약한 비밀번호·다른 확인·만 14세 미만은 화면에서 먼저 막는다", () => {
    const e = localErrors({ name: "", nickname: "", email: "", password: "abc", password2: "x", phone: "12", birthDate: "2015-03-02", purpose: "기타" }, new Date(2026, 10, 18));
    expect(Object.keys(e).sort()).toEqual(["birthDate", "email", "name", "nickname", "password", "password2", "phone"]);
    expect(e.birthDate).toBe("만 14세 이상만 가입할 수 있어요.");
  });

  it("AC-F1-01 가입하면 필수 약관 동의와 함께 보내고, 같은 자리에서 완료 안내가 나온다", async () => {
    const calls = mockServer({ "POST /api/v1/auth/signup": { status: 201, body: { id: 9, role: "USER", nickname: "가을밤밴드", landing: "/" } } });
    renderAt("/signup");
    await userEvent.type(screen.getByLabelText("이름"), "김공연");
    await userEvent.type(screen.getByLabelText("닉네임"), "가을밤밴드");
    await userEvent.type(screen.getByLabelText("이메일"), "host@stageduck.test");
    await userEvent.type(screen.getByLabelText("비밀번호"), "password1");
    await userEvent.type(screen.getByLabelText("비밀번호 확인"), "password1");
    await userEvent.type(screen.getByLabelText("전화번호"), "010-0000-0001");
    pickDate(screen.getByLabelText(/^생년월일/), "1995-03-02");
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(screen.getByText("필수 약관에 동의해 주세요.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await userEvent.click(screen.getByLabelText("전체 동의"));
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(await screen.findByRole("heading", { name: "가입이 완료됐어요" })).toBeInTheDocument();
    const sent = calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(sent).toMatchObject({ phone: "01000000001", birthDate: "1995-03-02", agreements: { service: true, privacyRequired: true, marketing: true } });
    expect(screen.getByRole("link", { name: "요청서 쓰기" })).toHaveAttribute("href", "/performances/new");
  });

  it("서버가 돌려준 칸 오류(닉네임 중복)는 그 칸 아래에 보인다", async () => {
    mockServer({ "POST /api/v1/auth/signup": { status: 409, body: err("NICKNAME_TAKEN", "이미 쓰는 닉네임이에요.", [{ field: "nickname", reason: "이미 쓰는 닉네임이에요." }]) } });
    renderAt("/signup");
    for (const [label, v] of [["이름", "김공연"], ["닉네임", "가을밤밴드"], ["이메일", "h@stageduck.test"], ["비밀번호", "password1"], ["비밀번호 확인", "password1"], ["전화번호", "01000000001"]]) {
      await userEvent.type(screen.getByLabelText(label), v);
    }
    pickDate(screen.getByLabelText(/^생년월일/), "1995-03-02");
    await userEvent.click(screen.getByLabelText("전체 동의"));
    await userEvent.click(screen.getByRole("button", { name: "가입하기" }));
    expect(await screen.findByText("이미 쓰는 닉네임이에요.")).toBeInTheDocument();
    expect(screen.getByLabelText("닉네임")).toHaveAttribute("aria-invalid", "true");
  });

  it("[업체로 입점할래요]를 고르면 업체 가입으로 간다", async () => {
    mockServer({});
    renderAt("/signup");
    await userEvent.click(screen.getByText("업체로 입점할래요"));
    expect(screen.getByTestId("where")).toHaveTextContent("/signup/supplier");
  });
});

describe("비밀번호 찾기 (AC-F1-21·22·23)", () => {
  const RESET = "POST /api/v1/auth/password-reset";
  const CONFIRM = "POST /api/v1/auth/password-reset/confirm";

  it("이메일을 넣으면 가입 여부와 상관없이 같은 '메일 보냄' 화면", async () => {
    const calls = mockServer({ [RESET]: { status: 202, body: { demoLink: null } } });
    renderAt("/password/forgot");
    await userEvent.type(screen.getByLabelText("이메일"), "who@stageduck.test");
    await userEvent.click(screen.getByRole("button", { name: "링크 보내기" }));
    expect(await screen.findByRole("heading", { name: "메일을 보냈어요" })).toBeInTheDocument();
    expect(screen.getByText("who@stageduck.test")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ email: "who@stageduck.test" });
    expect(screen.queryByText("시연용 링크")).not.toBeInTheDocument();
  });

  it("시연 서버는 링크를 화면에 보여 주고, 누르면 새 비밀번호 화면", async () => {
    mockServer({ [RESET]: { status: 202, body: { demoLink: "/password/reset?token=tok1" } } });
    renderAt("/password/forgot");
    await userEvent.type(screen.getByLabelText("이메일"), "host@stageduck.test");
    await userEvent.click(screen.getByRole("button", { name: "링크 보내기" }));
    await userEvent.click(await screen.findByRole("link", { name: "이 링크로 열기" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/password/reset?token=tok1");
    expect(screen.getByRole("heading", { name: "새 비밀번호" })).toBeInTheDocument();
  });

  it("10분에 3번을 넘기면 서버 문구가 보이고 같은 화면에 머문다", async () => {
    mockServer({ [RESET]: { status: 429, body: err("PASSWORD_RESET_RATE_LIMITED", "같은 이메일은 10분에 3번까지 요청할 수 있어요.") } });
    renderAt("/password/forgot");
    await userEvent.type(screen.getByLabelText("이메일"), "who@stageduck.test");
    await userEvent.click(screen.getByRole("button", { name: "링크 보내기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("10분에 3번까지");
    expect(screen.getByRole("heading", { name: "비밀번호 찾기" })).toBeInTheDocument();
  });

  it("토큰 없는 링크는 만료 화면, 새 비밀번호는 규칙과 확인을 본 뒤 저장", async () => {
    const calls = mockServer({ [CONFIRM]: { status: 204 } });
    const a = renderAt("/password/reset");
    expect(screen.getByRole("heading", { name: "링크가 만료됐어요" })).toBeInTheDocument();
    a.unmount();
    renderAt("/password/reset?token=abc");
    await userEvent.type(screen.getByLabelText("새 비밀번호"), "short");
    await userEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    expect(screen.getByLabelText("새 비밀번호")).toHaveAttribute("aria-invalid", "true");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText("새 비밀번호"));
    await userEvent.type(screen.getByLabelText("새 비밀번호"), "newpass12");
    await userEvent.type(screen.getByLabelText("새 비밀번호 확인"), "newpass12");
    await userEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    expect(await screen.findByRole("heading", { name: "비밀번호를 바꿨어요" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ token: "abc", password: "newpass12" });
  });

  it("만료·이미 쓴 링크면 서버 응답대로 만료 화면과 [다시 요청]", async () => {
    mockServer({ [CONFIRM]: { status: 400, body: err("RESET_TOKEN_INVALID", "링크가 만료됐어요.") } });
    renderAt("/password/reset?token=old");
    await userEvent.type(screen.getByLabelText("새 비밀번호"), "newpass12");
    await userEvent.type(screen.getByLabelText("새 비밀번호 확인"), "newpass12");
    await userEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
    expect(await screen.findByRole("heading", { name: "링크가 만료됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다시 요청" })).toHaveAttribute("href", "/password/forgot");
  });
});

// 시드 공간 A·B·C (backend/app/demo/seed.py)
const item = (id: number, name: string, over: Partial<VenueListItem> = {}): VenueListItem => ({
  id, name, companyName: `업체 ${name.slice(-1)}`, sido: "광주광역시", sigungu: "동구", venueType: "CULTURE_SPACE", maxCapacity: 120,
  rentalFee: 500000, hasResidentEngineer: false, bandAllowed: true, checkinTime: "15:00:00", externalEquipmentAllowed: true,
  externalEngineerAllowed: null, hasWaitingRoom: null, hasParking: null, ...over,
});
const A = item(1, "공간 A", { venueType: "CONCERT_HALL", maxCapacity: 200, rentalFee: 4000000, hasResidentEngineer: true, checkinTime: "14:00:00", hasWaitingRoom: true });
const B = item(2, "공간 B", { sigungu: "서구", maxCapacity: 100, rentalFee: 400000, checkinTime: "17:00:00" });
const C = item(3, "공간 C");
const C_DETAIL: VenueDetail = {
  ...C, supplierId: 30, address: "가상로 3", checkoutTime: "23:00:00", hasStagePlatform: true, hallRegistered: null, status: "ACTIVE",
  equipment: [{ category: "마이크", name: "유선 보컬 마이크", quantity: 2 }],
};

/** GET /venues?… 는 쿼리가 바뀌므로 경로로 고른다. 받은 주소를 모아 둔다 */
function mockVenues(extra: Record<string, { status: number; body?: unknown }> = {}) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
      if (extra[key]) return json(extra[key].status, extra[key].body ?? {});
      if (url.startsWith("/api/v1/venues?")) {
        const q = new URLSearchParams(url.split("?")[1]);
        const min = Number(q.get("minCapacity") ?? 0);
        const sorted = q.get("sort") === "fee" ? [B, C, A] : q.get("sort") === "capacity" ? [A, C, B] : [A, B, C];
        const items = sorted.filter((v) => v.maxCapacity >= min);
        return json(200, { items, page: 1, size: 50, total: items.length });
      }
      if (url === "/api/v1/venues/3") return json(200, C_DETAIL);
      if (url.startsWith("/api/v1/venues/")) return json(404, { code: "NOT_FOUND", message: "찾을 수 없어요.", fieldErrors: [] });
      return json(401, { code: "UNAUTHENTICATED", message: "", fieldErrors: [] });
    }),
  );
  return urls;
}

describe("공간 찾기 (/venues)", () => {
  it("서버에는 지역·관객 수·밴드·정렬을 보내고, 유형 여러 개·나머지 조건은 받은 목록에서 거른다", () => {
    expect(DEFAULT_COND.region).toBe("서울"); // 처음 지역은 서울 (11/19)
    expect(toQuery({ ...DEFAULT_COND, region: "광주", audience: "80", conditions: ["밴드 공연 가능", "주차"] }, "price")).toEqual({
      sido: "광주광역시", minCapacity: 80, bandAllowed: true, sort: "fee",
    });
    expect(toQuery({ ...DEFAULT_COND, region: "전체" }, "capacity")).toEqual({ sido: undefined, minCapacity: undefined, bandAllowed: undefined, sort: "capacity" });
    expect(filterVenues([A, B, C], { ...DEFAULT_COND, types: ["CULTURE_SPACE"] }, null).map((v) => v.name)).toEqual(["공간 B", "공간 C"]);
    expect(filterVenues([A, B, C], { ...DEFAULT_COND, conditions: ["대기실"] }, null).map((v) => v.name)).toEqual(["공간 A"]);
  });

  it("메인에서 고른 조건(?sido=&type=&audience=)을 받는다", () => {
    const c = condFromQuery(new URLSearchParams("sido=광주&type=야외·루프탑&audience=150명 이상"));
    expect(c).toMatchObject({ region: "광주", types: ["ROOFTOP"], audience: "150" });
  });

  it("AC-F5-01 처음엔 서울·대관료 낮은 순(B → C → A), 카드에 입실 시각과 업체가 보인다", async () => {
    const urls = mockVenues();
    renderAt("/venues");
    const cards = await screen.findAllByRole("link", { name: /공간 [ABC]/ });
    expect(cards.map((a) => a.getAttribute("href"))).toEqual(["/venues/2", "/venues/3", "/venues/1"]);
    expect(within(cards[0]).getByText("17:00 입실")).toBeInTheDocument();
    expect(within(cards[2]).getByText("풀스펙")).toBeInTheDocument();
    expect(urls.find((u) => u.startsWith("/api/v1/venues?"))).toContain(`sido=${encodeURIComponent("서울특별시")}`);
  });

  it("조건은 [공간 찾기]를 눌러야 바뀌고, 결과가 없으면 [조건 초기화]로 돌아간다", async () => {
    // 지역 버튼이 17개라 화면 전체를 역할로 찾으면 느리다 → 결과 칸(.grid)의 카드 링크만 센다
    const cards = () => document.querySelectorAll('.grid a[href^="/venues/"]').length;
    mockVenues();
    renderAt("/venues");
    await waitFor(() => expect(cards()).toBe(3));
    await userEvent.type(screen.getByLabelText("관객 수"), "300");
    expect(cards()).toBe(3);
    await userEvent.click(screen.getByRole("button", { name: "공간 찾기" }));
    expect(await screen.findByText("조건에 맞는 공간이 없어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "조건 초기화" }));
    await waitFor(() => expect(cards()).toBe(3));
  });

  it("유형 타일을 누르면 바로 그 유형만 보인다", async () => {
    mockVenues();
    renderAt("/venues");
    const tiles = await screen.findByRole("group", { name: "공간 유형" });
    await screen.findAllByRole("link", { name: /공간 [ABC]/ });
    await userEvent.click(within(tiles).getByRole("button", { name: /전문 공연장/ }));
    expect(screen.getAllByRole("link", { name: /공간 [ABC]/ }).map((a) => a.getAttribute("href"))).toEqual(["/venues/1"]);
  });
});

describe("공간 상세 (/venues/:id)", () => {
  it("작은 사진을 누르면 큰 사진이 바뀌고, 미확인 조건은 '미확인', 없는 공간은 찾을 수 없어요", async () => {
    mockVenues();
    const a = renderAt("/venues/3");
    expect(await screen.findByRole("heading", { level: 1, name: "공간 C" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: ".gallery__count b" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "사진 3" }));
    expect(screen.getByRole("button", { name: "사진 3" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("3", { selector: ".gallery__count b" })).toBeInTheDocument();
    expect(screen.getByText("유선 보컬 마이크")).toBeInTheDocument();
    expect(screen.getByText("대기실 미확인 · 무대 단상 있음 · 주차 미확인")).toBeInTheDocument();
    a.unmount();
    renderAt("/venues/999");
    expect(await screen.findByText(/찾을 수 없/)).toBeInTheDocument();
  });

  it("방문자에게 견적 요청 상자는 로그인으로 안내한다 (돌아올 주소 포함)", async () => {
    mockVenues();
    renderAt("/venues/3");
    const box = await screen.findByRole("complementary", { name: "견적 요청하기" });
    expect(within(box).getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?next=/venues/3");
  });

  it("사용자는 공연장 단계가 열린 내 공연만 고르고, 견적 요청 창을 열고 Esc 로 닫는다", async () => {
    const perf = (id: number, title: string, status: string) => ({
      id, title, form: "BAND", status: "PUBLISHED", showDate: "2026-11-28", rehearsalStart: "17:00:00", showStart: "19:00:00", showEnd: "21:00:00",
      audience: 80, sido: "광주", sigungu: "동구", currentVersion: 1, nextAction: "WAIT_QUOTES", nextStageId: 1,
      stages: [{ id: id * 10, stageType: "VENUE", seq: 1, status, quoteCount: 0 }],
    });
    mockVenues({
      "GET /api/v1/me": { status: 200, body: USER },
      "GET /api/v1/performances?mine=true": { status: 200, body: { active: [perf(1, "가을밤 밴드 공연", "OPEN"), perf(2, "끝난 공연장", "CONFIRMED")], draft: [], past: [] } },
    });
    renderAt("/venues/3");
    const select = await screen.findByLabelText("내 공연");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["가을밤 밴드 공연 · 공연장 단계"]);
    await userEvent.click(screen.getByRole("button", { name: "견적 요청하기" }));
    expect(screen.getByRole("dialog", { name: "견적 요청하기" })).toHaveTextContent("업체 C에 견적을 요청할까요?");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("다음 단계로 (/performances/:id/next)", () => {
  const ME = { "GET /api/v1/me": { status: 200, body: USER } };
  const base = {
    id: 5, title: "가을밤 밴드 공연", form: "BAND", status: "ASSIGNING", showDate: "2026-11-28", rehearsalStart: "17:00:00", showStart: "19:00:00",
    showEnd: "21:00:00", audience: 80, sido: "광주광역시", sigungu: "동구", currentVersion: 1, lineup: [], hasContactPhone: true, publishedAt: null,
    needs: { venue: null, equipment: null, engineer: null, ownedVenue: null },
  };
  const afterVenue = {
    ...base, nextAction: "OPEN_NEXT", nextStageId: 1,
    stages: [
      { id: 1, stageType: "VENUE", seq: 1, status: "CONFIRMED", quoteCount: 3 },
      { id: 2, stageType: "EQUIPMENT", seq: 2, status: "WAITING", quoteCount: null },
      { id: 3, stageType: "ENGINEER", seq: 3, status: "WAITING", quoteCount: null },
    ],
  };

  it("AC-F3-02 공연장 확정 뒤: [장비 업체 모집 시작]은 Idempotency-Key 와 함께 보내고 공연 상세로 간다", async () => {
    const calls = mockServer({ ...ME, "GET /api/v1/performances/5": { status: 200, body: afterVenue }, "POST /api/v1/stages/1/advance": { status: 200, body: {} } });
    renderAt("/performances/5/next");
    expect(await screen.findByRole("heading", { name: "공연장을 확정했어요" })).toBeInTheDocument();
    expect(screen.getByText("다음 차례")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "장비 업체 모집 시작" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/performances/5"));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ action: "OPEN_NEXT" });
  });

  it("건너뛰기는 책임 고지에 동의해야 보내진다", async () => {
    const calls = mockServer({ ...ME, "GET /api/v1/performances/5": { status: 200, body: afterVenue }, "POST /api/v1/stages/1/advance": { status: 200, body: {} } });
    renderAt("/performances/5/next");
    await userEvent.click(await screen.findByText("장비는 이미 있어요 · 건너뛰기"));
    await userEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    const dialog = screen.getByRole("dialog", { name: "건너뛰기 확인" });
    expect(within(dialog).getByRole("button", { name: "건너뛰기" })).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText(/동의해요/));
    await userEvent.click(within(dialog).getByRole("button", { name: "건너뛰기" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ action: "SKIP_NEXT", acknowledgement: "STAGE_SKIP_OWNED" });
  });

  it("모든 단계를 정했으면 정리와 [통합 결제하기], 다음 할 일이 아니면 공연 상세로", async () => {
    const paid = { ...afterVenue, nextAction: "PAY", stages: afterVenue.stages.map((s) => ({ ...s, status: s.seq === 3 ? "SKIPPED" : "CONFIRMED" })) };
    mockServer({ ...ME, "GET /api/v1/performances/5": { status: 200, body: paid } });
    const a = renderAt("/performances/5/next");
    expect(await screen.findByRole("heading", { name: "모든 단계를 정했어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "통합 결제하기" })).toHaveAttribute("href", "/performances/5/order");
    a.unmount();
    vi.unstubAllGlobals();
    mockServer({ ...ME, "GET /api/v1/performances/5": { status: 200, body: { ...afterVenue, nextAction: "WAIT_QUOTES" } } });
    renderAt("/performances/5/next");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/performances\/5$/));
  });
});

describe("현장 준비 확인 (/supplier/tech/:performanceId)", () => {
  const SUP = { ...USER, id: 7, role: "SUPPLIER", nickname: null, name: "업체 D", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };
  const row = (id: number, item: string, mine: boolean, answer: string, memo: string | null) => ({
    id, item, detail: null, ownerSupplierId: mine ? 7 : 3, ownerLabel: mine ? "업체 D" : "업체 C (공간)", mine, answer, memo, answeredAt: null,
  });
  const LIST = {
    performance: { id: 5, title: "가을밤 밴드 공연", showDate: "2026-11-28", statusLabel: "결제 대기" },
    creator: { supplierId: 7, name: "업체 D" },
    canAdd: true,
    owners: [{ supplierId: 3, label: "업체 C (공간)" }, { supplierId: 7, label: "업체 D (장비)" }],
    items: [row(1, "무대 콘센트 위치", false, "OK", "무대 왼쪽 4구"), row(3, "음량 제한 시각", false, "UNCONFIRMED", null), row(4, "FOH 믹서 자리", true, "UNCONFIRMED", null), row(5, "드럼 마이킹 수", true, "OK", "총 4채널")],
  };

  it("AC-F3-25 내 항목에만 답할 수 있고, 남의 항목은 그 업체만 답한다고 보인다", async () => {
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: SUP },
      "GET /api/v1/supplier/terms-review": { status: 200, body: { version: "1.0:1.0", reviewed: true } },
      "GET /api/v1/performances/5/tech-checks": { status: 200, body: LIST },
      "PUT /api/v1/tech-checks/4": { status: 200, body: {} },
    });
    renderAt("/supplier/tech/5");
    expect(await screen.findByRole("heading", { level: 1, name: "현장 준비 확인" })).toBeInTheDocument();
    expect(screen.getByText("업체 C만 답할 수 있어요")).toBeInTheDocument();
    expect(screen.queryByLabelText("음량 제한 시각 답변")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("FOH 믹서 자리 답변"), "객석 맨 뒤 중앙");
    await userEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({ url: "/api/v1/tech-checks/4", body: { answer: "OK", memo: "객석 맨 뒤 중앙" } });
    // 답변한 내 항목은 [고치기]로 다시 연다
    const drum = screen.getByText("드럼 마이킹 수").closest("tr")!;
    await userEvent.click(within(drum).getByRole("button", { name: "고치기" }));
    expect(screen.getByLabelText("드럼 마이킹 수 답변")).toHaveValue("총 4채널");
  });

  it("요약 칸은 전체·답변 완료·내가 답할 항목 수, 항목 추가는 담당 업체를 골라 보낸다", async () => {
    const calls = mockServer({
      "GET /api/v1/me": { status: 200, body: SUP },
      "GET /api/v1/supplier/terms-review": { status: 200, body: { version: "1.0:1.0", reviewed: true } },
      "GET /api/v1/performances/5/tech-checks": { status: 200, body: LIST },
      "POST /api/v1/performances/5/tech-checks": { status: 201, body: {} },
    });
    renderAt("/supplier/tech/5");
    await screen.findByRole("heading", { level: 1, name: "현장 준비 확인" });
    const nums = [...document.querySelectorAll(".summary b")].map((b) => b.textContent);
    expect(nums).toEqual(["4개", "2개", "1개"]);
    await userEvent.click(screen.getByRole("button", { name: "항목 추가" }));
    const dialog = screen.getByRole("dialog", { name: "항목 추가" });
    await userEvent.type(within(dialog).getByLabelText("항목"), "전원 용량");
    await userEvent.selectOptions(within(dialog).getByLabelText("답할 업체"), "3");
    await userEvent.click(within(dialog).getByRole("button", { name: "추가" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ item: "전원 용량", detail: "", ownerSupplierId: 3 });
  });

  it("남의 공연(서버 404)은 찾을 수 없어요", async () => {
    mockServer({ "GET /api/v1/me": { status: 200, body: SUP }, "GET /api/v1/performances/9/tech-checks": { status: 404, body: err("NOT_FOUND", "찾을 수 없어요.") } });
    renderAt("/supplier/tech/9");
    expect(await screen.findByRole("heading", { name: "화면을 찾을 수 없어요" })).toBeInTheDocument();
  });
});

it("지역은 전체 → 서울 → 시·도 표준 순서, 17개 모두 (11/19 피드백)", () => {
  expect(REGIONS.map((r) => r.label)).toEqual(["전체", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]);
});
