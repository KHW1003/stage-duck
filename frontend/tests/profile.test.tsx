import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppRoutes } from "../src/App";
import { UserProfileCard } from "../src/features/profile/UserProfileCard";
import type { Me, PrPost, SupplierProfile, UserProfile } from "../src/shared/api/types";

/** 프로필 (#33, 목업 v4 supplier.html · mypage.html) — AC-F5-15, AC-F5-16 */

const USER: Me = {
  id: 3, role: "USER", status: "ACTIVE", email: "host@stageduck.test", name: "시연사용자", phone: "01000000000",
  nickname: "가을밤밴드", supplierReviewStatus: null, landing: "/me/performances",
};
const SUPPLIER_D: Me = { ...USER, id: 5, role: "SUPPLIER", nickname: null, name: "업체D담당", supplierReviewStatus: "APPROVED", landing: "/supplier/postings" };

const SUPPLIER: SupplierProfile = {
  id: 4, companyName: "업체 D", imageUrl: "/media/supplier_image/2026/11/d_t.webp", categories: ["EQUIPMENT", "INSTALL", "ENGINEER"],
  intro: "관객 50~150명 밴드 공연 음향을 맡아요.", setupMinutes: 90, teardownMinutes: 60, engineerYears: 7, bandExperience: true,
  hasLiabilityInsurance: true, soundCertification: null, joinedAt: "2026-09-02T10:00:00",
  posts: [{
    id: 11, category: "EQUIPMENT", title: "밴드 공연 음향, 설치부터 철수까지 맡아요", supplierId: 4, companyName: "업체 D",
    sido: "광주광역시", priceRange: null, thumbUrl: "/media/pr_post/2026/11/a_t.webp", bumpedAt: "2026-11-10T09:00:00",
  }],
  venues: [{ id: 7, name: "공간 D", sido: "광주광역시", sigungu: "동구", venueType: "CULTURE_SPACE", maxCapacity: 120, rentalFee: 500000 }],
};

const PROFILE: UserProfile = { id: 3, nickname: "가을밤밴드", profileImageUrl: null, joinedAt: "2026-11-02T10:00:00", usageCount: 1, rejectionCount: 2 };

type Reply = { status: number; body?: unknown };
type Call = { url: string; method: string; body: unknown };

const err = (status: number, code: string, message: string, fieldErrors: { field: string; reason: string }[] = []): Reply => ({
  status,
  body: { code, message, fieldErrors },
});

function mockServer(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const seen: Record<string, number> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const key = `${method} ${decodeURIComponent(url)}`;
      const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: decodeURIComponent(url), method, body });
      const route = routes[key];
      const n = (seen[key] = (seen[key] ?? 0) + 1);
      const r = Array.isArray(route) ? route[Math.min(n, route.length) - 1] : route ?? err(404, "NOT_FOUND", "찾을 수 없어요.");
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }),
  );
  return calls;
}

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + decodeURIComponent(loc.search)}</p>;
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

const GUEST = { "GET /api/v1/me": err(401, "UNAUTHENTICATED", "로그인이 필요해요.") };
const AS_USER = { "GET /api/v1/me": { status: 200, body: USER }, "GET /api/v1/me/profile": { status: 200, body: PROFILE } };

afterEach(() => vi.unstubAllGlobals());

describe("업체 프로필 (/suppliers/:id)", () => {
  it("AC-F5-15 방문자가 상호·승인 부문·소개·소개 글을 보고, 전화번호·사업자 서류는 공개하지 않는다고 안내한다", async () => {
    const user = userEvent.setup();
    mockServer({ ...GUEST, "GET /api/v1/suppliers/4/profile": { status: 200, body: SUPPLIER } });
    renderAt("/suppliers/4");

    expect(await screen.findByRole("heading", { level: 1, name: "업체 D" })).toBeInTheDocument();
    expect(screen.getAllByText("음향 장비·설치, 엔지니어").length).toBeGreaterThan(0);
    expect(screen.getByText("2026년 9월 입점")).toBeInTheDocument();
    expect(screen.getByText("관객 50~150명 밴드 공연 음향을 맡아요.")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("90분")).toBeInTheDocument();
    expect(within(table).getByText("7년")).toBeInTheDocument();
    expect(within(table).getByText("미확인")).toBeInTheDocument(); // 음향 자격을 적지 않음
    expect(screen.getByText("전화번호와 사업자 서류는 공개하지 않아요.")).toBeInTheDocument();
    expect(screen.queryByText(/거래 \d+건/)).not.toBeInTheDocument(); // 거래 n건은 2번 함수 대기 (#33)
    expect(screen.queryByRole("button", { name: /관심 업체/ })).not.toBeInTheDocument(); // #32

    const venue = screen.getByRole("link", { name: /공간 D/ });
    expect(venue).toHaveAttribute("href", "/venues/7");
    await user.click(screen.getByRole("link", { name: /밴드 공연 음향, 설치부터 철수까지 맡아요/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/board/11");
  });

  it("AC-F5-15 승인되지 않았거나 정지된 업체(서버 404)는 찾을 수 없음 화면", async () => {
    mockServer({ ...GUEST, "GET /api/v1/suppliers/9/profile": err(404, "NOT_FOUND", "찾을 수 없어요.") });
    renderAt("/suppliers/9");
    expect(await screen.findByText(/찾을 수 없/)).toBeInTheDocument();
    expect(screen.queryByText("전화번호와 사업자 서류는 공개하지 않아요.")).not.toBeInTheDocument();
  });

  it("소개 글 상세의 업체 이름을 누르면 업체 프로필로 간다", async () => {
    const user = userEvent.setup();
    const post: PrPost = { ...SUPPLIER.posts[0], body: "소개", photos: [], createdAt: "2026-11-01T10:00:00" };
    mockServer({ ...GUEST, "GET /api/v1/pr-posts/11": { status: 200, body: post }, "GET /api/v1/suppliers/4/profile": { status: 200, body: SUPPLIER } });
    renderAt("/board/11");
    const links = await screen.findAllByRole("link", { name: "업체 D" });
    await user.click(links[0]);
    expect(screen.getByTestId("where")).toHaveTextContent("/suppliers/4");
  });
});

describe("사용자 프로필 부품 (UserProfileCard)", () => {
  it("AC-F5-16 닉네임·사진·가입일·이용 횟수·반려 횟수만 보인다", () => {
    render(<UserProfileCard profile={{ ...PROFILE, profileImageUrl: "/media/profile/2026/11/p_t.webp" }} />);
    expect(screen.getByText("가을밤밴드")).toBeInTheDocument();
    expect(screen.getByText("2026년 11월 가입")).toBeInTheDocument();
    expect(screen.getByText("이용 횟수").nextSibling).toHaveTextContent("1회");
    expect(screen.getByText("반려 횟수").nextSibling).toHaveTextContent("2회");
    expect(screen.getByRole("img", { name: "가을밤밴드 프로필 사진" })).toBeInTheDocument();
  });
});

describe("마이페이지 (/mypage)", () => {
  it("닉네임 [중복 확인]: 지금 내 닉네임이면 서버에 묻지 않고, 바꾼 닉네임은 바로 확인한다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({ ...AS_USER, "POST /api/v1/auth/check-available": { status: 200, body: { available: false, message: "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요." } } });
    renderAt("/mypage");
    const input = await screen.findByLabelText("닉네임");
    await waitFor(() => expect(input).toHaveValue("가을밤밴드"));
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));
    expect(await screen.findByText("지금 쓰는 닉네임이에요.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/check-available"))).toHaveLength(0);

    await user.clear(input);
    await user.type(input, "겨울밤밴드");
    await user.click(screen.getByRole("button", { name: "닉네임 중복 확인" }));
    expect(await screen.findByText("이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.")).toBeInTheDocument();
  });

  it("AC-F5-16 업체에게 보이는 모습과, 나만 보이는 계정 정보를 나눠 보여 준다", async () => {
    mockServer(AS_USER);
    renderAt("/mypage");

    expect(await screen.findByRole("heading", { level: 1, name: "내 프로필" })).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: "업체에게 이렇게 보여요" });
    expect(await within(preview).findByText("가을밤밴드")).toBeInTheDocument();
    expect(within(preview).queryByText("시연사용자")).not.toBeInTheDocument();
    expect(within(preview).queryByText("host@stageduck.test")).not.toBeInTheDocument();

    const account = screen.getByRole("region", { name: "계정 정보" });
    expect(within(account).getByText("시연사용자")).toBeInTheDocument();
    expect(within(account).getByText("host@stageduck.test")).toBeInTheDocument();
    expect(within(account).getByText("나만 보여요.")).toBeInTheDocument();

    // 목업과 다르게 정한 것 (#33): 비밀번호 바꾸기·탈퇴·마케팅 수신은 없다. [중복 확인]은 누르는 즉시 확인한다
    expect(screen.getByRole("button", { name: "닉네임 중복 확인" })).toBeInTheDocument();
    for (const name of ["비밀번호 바꾸기", "탈퇴"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByText("마케팅 수신")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "내 프로필" })).toHaveAttribute("aria-current", "page");
  });

  it("AC-F5-16 닉네임을 바꿔 저장하면 보낸 값이 미리보기에 바로 보인다", async () => {
    const user = userEvent.setup();
    const saved = { ...PROFILE, nickname: "겨울밤밴드" };
    const calls = mockServer({
      ...AS_USER,
      "GET /api/v1/me/profile": [{ status: 200, body: PROFILE }, { status: 200, body: saved }],
      "PATCH /api/v1/me/profile": { status: 200, body: saved },
    });
    renderAt("/mypage");

    const input = await screen.findByLabelText("닉네임");
    await waitFor(() => expect(input).toHaveValue("가을밤밴드"));
    await user.clear(input);
    await user.type(input, "겨울밤밴드");
    await user.click(screen.getByRole("button", { name: "저장" }));

    const preview = screen.getByRole("region", { name: "업체에게 이렇게 보여요" });
    expect(await within(preview).findByText("겨울밤밴드")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ nickname: "겨울밤밴드" });
  });

  it("AC-F5-16 이미 쓰는 닉네임이면 서버 문구를 닉네임 칸 아래에 보여 준다", async () => {
    const user = userEvent.setup();
    const message = "이미 쓰고 있는 닉네임이에요. 다른 닉네임을 써 주세요.";
    mockServer({ ...AS_USER, "PATCH /api/v1/me/profile": err(409, "NICKNAME_TAKEN", message, [{ field: "nickname", reason: message }]) });
    renderAt("/mypage");

    const input = await screen.findByLabelText("닉네임");
    await waitFor(() => expect(input).toHaveValue("가을밤밴드"));
    await user.clear(input);
    await user.type(input, "덕구밴드");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("AC-F5-16 사진을 고르면 PROFILE 로 먼저 올리고, 저장할 때 파일 번호만 보낸다", async () => {
    const user = userEvent.setup();
    const calls = mockServer({
      ...AS_USER,
      "POST /api/v1/files": { status: 201, body: { id: 51, url: "/media/profile/2026/11/n.webp", thumbUrl: "/media/profile/2026/11/n_t.webp" } },
      "PATCH /api/v1/me/profile": { status: 200, body: { ...PROFILE, profileImageUrl: "/media/profile/2026/11/n_t.webp" } },
    });
    renderAt("/mypage");

    await user.upload(await screen.findByLabelText("사진 바꾸기"), new File(["x"], "me.png", { type: "image/png" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ purpose: "PROFILE" });

    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ profileFileId: 51 }));
  });

  it("마이페이지는 사용자만: 방문자는 로그인으로, 업체는 찾을 수 없음", async () => {
    mockServer(GUEST);
    const first = renderAt("/mypage");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/login?next=/mypage"));
    first.unmount();

    mockServer({ "GET /api/v1/me": { status: 200, body: SUPPLIER_D } });
    renderAt("/mypage");
    expect(await screen.findByText(/찾을 수 없/)).toBeInTheDocument();
  });
});
