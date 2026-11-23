/**
 * 머리(GNB) 메뉴·계정 메뉴. 공통 화면은 목업의 머리 메뉴를 따르고 업체 업무 화면은 내 예약을 제공한다.
 * 공연팀은 내 공연과 탐색 메뉴를, 승인 업체는 공고·예약·소개 글 메뉴를 본다.
 * 주소는 specs/plan.md 6장 라우트 표를 따른다. 표에 아직 없는 화면은 [주소 미정] 으로 표시했다 —
 * 그 화면 담당이 plan.md 에 주소를 정하면 여기만 고친다. (그 전까지 누르면 "찾을 수 없어요" 화면)
 */
import type { IconName } from "../ui/Icon";
import type { LayoutKind } from "../auth/useMe";

export interface MenuItem {
  label: string;
  to: string;
  /** React 밖 주소 (서버의 SQLAdmin) — <a href> 로 이동 */
  external?: boolean;
  /** 채팅: 화면을 옮기지 않고 지금 화면에 ?chat=list 를 붙여 오른쪽 아래 채팅 창을 연다 (목업 v4).
   *  채팅 창이 없는 메인(HomeLayout)에서는 to(기본 화면 + ?chat=list)로 간다 */
  chat?: boolean;
}

export interface AccountLink extends MenuItem {
  icon: IconName;
}

export const MENUS: Record<LayoutKind, MenuItem[]> = {
  guest: [
    { label: "공간 찾기", to: "/venues" },
    { label: "업체 찾기", to: "/board" },
    { label: "커뮤니티", to: "/community" }, // #93, plan.md 6장
  ],
  user: [
    { label: "내 공연", to: "/me/performances" },
    { label: "채팅", to: "/me/performances?chat=list", chat: true },
    { label: "공간 찾기", to: "/venues" },
    { label: "업체 찾기", to: "/board" },
    { label: "커뮤니티", to: "/community" },
  ],
  partner: [
    { label: "공고 목록", to: "/supplier/postings" },
    { label: "내 예약", to: "/supplier/reservations" },
    { label: "채팅", to: "/supplier/postings?chat=list", chat: true },
    { label: "공간 찾기", to: "/venues" },
    { label: "업체 찾기", to: "/board" },
    { label: "커뮤니티", to: "/community" },
  ],
  "partner-review": [],
  // 관리자 화면은 React 가 아니라 서버의 SQLAdmin (plan.md 6.5). 목업 a-*.html 과 같은 메뉴를 SQLAdmin 주소로 잇는다
  admin: [
    { label: "업체 심사", to: "/admin/supplier/list", external: true },
    { label: "신고·제재", to: "/admin/sanction/list", external: true },
    { label: "게시글·공간", to: "/admin", external: true }, // [주소 미정] SQLAdmin 화면이 아직 없음
    { label: "거래 이력", to: "/admin", external: true }, // [주소 미정] SQLAdmin 화면이 아직 없음
    { label: "시연 도구", to: "/admin/demo", external: true },
  ],
};

/** 계정 메뉴의 화면 링크 (로그아웃·알림 위). 목업 layout.js 와 같은 항목 */
export const ACCOUNT_LINKS: Record<LayoutKind, AccountLink[]> = {
  guest: [],
  user: [
    { label: "마이페이지", to: "/mypage", icon: "user" }, // [주소 미정] 목업 mypage.html — 1번 profile
    { label: "견적함", to: "/quotes", icon: "doc" }, // [주소 미정] 목업 inbox-list.html — 3번 묶음
    { label: "관심 업체", to: "/favorites", icon: "heart" }, // 목업 favorites.html — 1번 offer (#32)
    { label: "최종 담당표", to: "/sheet", icon: "receipt" }, // [주소 미정] plan.md 는 공연별 /performances/:id/sheet
    { label: "1:1 문의", to: "/inquiries", icon: "chat" }, // FR-CS-01, plan.md 6장
  ],
  partner: [
    { label: "업체 프로필", to: "/supplier/profile", icon: "venue" },
    { label: "내 소개 글", to: "/supplier/posts", icon: "edit" }, // [주소 미정] 목업 p-post.html
    { label: "내 예약", to: "/supplier/reservations", icon: "receipt" },
    { label: "받은 견적 요청", to: "/supplier/offers", icon: "doc" }, // #32
    { label: "1:1 문의", to: "/inquiries", icon: "chat" },
  ],
  "partner-review": [],
  admin: [],
};

/** 알림 전체 보기 — [주소 미정] 목업 notifications.html — 3번 notification */
export const NOTIFICATIONS_PATH = "/notifications";

/** 로고를 눌렀을 때 가는 곳 (목업 layout.js home) */
export const HOME: Record<LayoutKind, string> = {
  guest: "/",
  user: "/me/performances",
  partner: "/supplier/postings",
  "partner-review": "/supplier/onboarding",
  admin: "/admin",
};

/** 머리 로고를 누르면 가는 곳: 메인 (업체는 업체 메인). 내 공연·공고 목록이 아니다 (11/19 피드백) */
export const LOGO_HOME: Record<LayoutKind, string> = {
  guest: "/",
  user: "/",
  partner: "/partner",
  "partner-review": "/partner",
  admin: "/admin",
};
