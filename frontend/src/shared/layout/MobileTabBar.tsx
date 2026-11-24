/**
 * 모바일 아래 탭 (560px 이하). 안쪽 화면(AppLayout)과 메인(HomeLayout)이 같이 쓴다.
 * - 사용자·승인 업체: 홈 · 찾기 · 채팅 · 알림 · 마이 / 손님: 홈 · 찾기 · 커뮤니티 · 로그인 / 심사 중 업체: 홈 · 알림 · 마이
 * - 찾기·마이는 아래에서 올라오는 판(KitModal sheet). 링크는 머리 메뉴 정의(MENUS·ACCOUNT_LINKS)를 다시 쓴다
 * - 안 읽은 수는 머리의 알림 종·채팅 위젯과 같은 쿼리라 요청이 늘지 않는다
 * - 입력 중이거나 채팅 창·모달이 열려 있으면 숨긴다 (mobile-tab-bar.css)
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useChatRooms } from "../../features/chat/api";
import { useUnreadCount } from "../../features/notification/api";
import type { Me } from "../api/types";
import { useLogout, type LayoutKind } from "../auth/useMe";
import { Icon, type IconName } from "../ui/Icon";
import { KitModal } from "../ui/KitModal";
import { ACCOUNT_LINKS, LOGO_HOME, MENUS, NOTIFICATIONS_PATH, type AccountLink } from "./menus";
import { useMobile } from "./useMobile";
import "./mobile-tab-bar.css";

const FIND: AccountLink[] = [
  { label: "공간 찾기", to: "/venues", icon: "venue" },
  { label: "업체 찾기", to: "/board", icon: "search" },
];
const PARTNER_HOME: AccountLink = { label: "업체 메인", to: "/partner", icon: "home" };
const COMMUNITY = "/community";
const isFind = (to: string) => FIND.some((f) => f.to === to);

/** 머리 메뉴에서 찾기·채팅을 뺀 것 → 계정 메뉴 → 커뮤니티 → 업체 메인 순서 */
function myLinks(kind: LayoutKind): AccountLink[] {
  const menu: AccountLink[] = MENUS[kind]
    .filter((m) => !m.chat && !isFind(m.to))
    .map((m) => ({ ...m, icon: m.to === COMMUNITY ? "chat" : "doc" }));
  const links = [
    ...menu.filter((m) => m.to !== COMMUNITY),
    ...ACCOUNT_LINKS[kind],
    ...menu.filter((m) => m.to === COMMUNITY),
    ...(kind === "partner" ? [PARTNER_HOME] : []),
  ];
  return links.filter((l, i) => links.findIndex((x) => x.to === l.to) === i); // 내 예약은 두 메뉴에 다 있다
}

const under = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function Badge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="m-tab__badge" aria-label={`${label} ${count}개`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChatTab() {
  const rooms = useChatRooms();
  const [params, setParams] = useSearchParams();
  const unread = (rooms.data ?? []).reduce((n, r) => n + r.unreadCount, 0);
  const open = () => {
    const next = new URLSearchParams(params); // 지금 화면의 검색 조건은 그대로 둔다
    next.set("chat", "list");
    setParams(next, { replace: true, preventScrollReset: true });
  };
  return (
    <button type="button" className="m-tab" aria-haspopup="dialog" onClick={open}>
      <span className="m-tab__icon">
        <Icon name="chat" />
        <Badge count={unread} label="안 읽은 대화" />
      </span>
      채팅
    </button>
  );
}

function NotificationTab({ current, count }: { current: boolean; count: boolean }) {
  const unread = useUnreadCount(count);
  return (
    <Link className="m-tab" to={NOTIFICATIONS_PATH} aria-current={current ? "page" : undefined}>
      <span className="m-tab__icon">
        <Icon name="bell" />
        <Badge count={unread.data?.count ?? 0} label="안 읽은 알림" />
      </span>
      알림
    </Link>
  );
}

function LinkTab({ to, icon, label, current }: { to: string; icon: IconName; label: string; current: boolean }) {
  return (
    <Link className="m-tab" to={to} aria-current={current ? "page" : undefined}>
      <span className="m-tab__icon">
        <Icon name={icon} />
      </span>
      {label}
    </Link>
  );
}

export function MobileTabBar({ kind, me }: { kind: LayoutKind; me: Me | null }) {
  const mobile = useMobile();
  const { pathname, key } = useLocation();
  const logout = useLogout();
  const [sheet, setSheet] = useState<"find" | "my" | null>(null);
  useEffect(() => setSheet(null), [key, mobile]); // 화면을 옮기면 판을 닫는다
  if (!mobile || kind === "admin") return null;

  const review = kind === "partner-review";
  const home = review ? LOGO_HOME[kind] : "/";
  const my = myLinks(kind);
  const inFind = FIND.some((f) => under(pathname, f.to));
  const inMy = !!me && (my.some((l) => under(pathname, l.to)) || under(pathname, "/performances"));
  const links = sheet === "find" ? [...FIND, ...(me ? [] : [{ ...PARTNER_HOME, label: "업체신가요?" }])] : my;
  const sheetTab = (name: "find" | "my", icon: IconName, label: string, current: boolean) => (
    <button
      type="button"
      className="m-tab"
      aria-haspopup="dialog"
      aria-expanded={sheet === name}
      aria-current={current ? "page" : undefined}
      onClick={() => setSheet(name)}
    >
      <span className="m-tab__icon">
        <Icon name={icon} />
      </span>
      {label}
    </button>
  );

  return (
    <>
      <div className="m-tabs-space" aria-hidden="true" />
      <nav className="m-tabs" aria-label="아래 메뉴">
        <LinkTab to={home} icon="home" label="홈" current={pathname === home} />
        {!review && sheetTab("find", "search", "찾기", inFind)}
        {me ? (
          <>
            {!review && <ChatTab />}
            <NotificationTab current={under(pathname, NOTIFICATIONS_PATH)} count={!review} />
            {sheetTab("my", "user", "마이", inMy)}
          </>
        ) : (
          <>
            <LinkTab to={COMMUNITY} icon="chat" label="커뮤니티" current={under(pathname, COMMUNITY)} />
            <LinkTab to="/login" icon="user" label="로그인" current={under(pathname, "/login")} />
          </>
        )}
      </nav>
      {sheet && (
        <KitModal title={sheet === "find" ? "찾기" : "마이"} onClose={() => setSheet(null)} sheet>
          <ul className="m-sheet">
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} aria-current={under(pathname, l.to) ? "page" : undefined}>
                  <Icon name={l.icon} />
                  {l.label}
                </Link>
              </li>
            ))}
            {sheet === "my" && (
              <li>
                <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
                  <Icon name="out" />
                  로그아웃
                </button>
              </li>
            )}
          </ul>
        </KitModal>
      )}
    </>
  );
}
