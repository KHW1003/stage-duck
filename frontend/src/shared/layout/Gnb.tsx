/**
 * 머리 (DESIGN.md 5장). 출처: docs/design/mockup-v3/layout.js + css/layout.css — 목업과 같은 구성.
 * - 방문자: 업체신가요? · 로그인 · 가입하기
 * - 사용자·승인 업체: 알림 종 + 계정 메뉴(화면 링크 · 알림 · 로그아웃)
 * - 심사 중 업체: 알림 종 없이 계정 메뉴(알림 · 로그아웃)
 * - 관리자: "테스트 환경" 표시 + 계정 메뉴(로그아웃). 메뉴는 서버의 SQLAdmin 으로 간다
 * 알림 목록·안 읽은 수는 3번 묶음(notification)이 붙인다 — 지금은 패널 틀만 둔다.
 * 모바일·태블릿(1024px 미만, CLAUDE.md 6.2): 주 메뉴는 오른쪽 끝 [메뉴] 버튼으로 열고 닫는 판으로 옮긴다.
 *   화면을 옮기거나 Esc 를 누르면 닫힌다. 메뉴가 없는 화면(심사 중 업체)에는 버튼을 두지 않는다.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { Me } from "../api/types";
import type { LayoutKind } from "../auth/useMe";
import { useLogout } from "../auth/useMe";
import { ButtonLink } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ACCOUNT_LINKS, HOME, MENUS, NOTIFICATIONS_PATH, type MenuItem } from "./menus";
import styles from "./Gnb.module.css";

/** 계정 메뉴 머리 둘째 줄 (목업: "사용자 계정" / "업체 계정 · 승인" / "관리자 계정 · 이메일") */
function roleText(kind: LayoutKind, me: Me): string {
  switch (kind) {
    case "user":
      return "사용자 계정";
    case "partner":
      return "업체 계정 · 승인";
    case "partner-review":
      return "업체 계정 · 심사 중";
    case "admin":
      return `관리자 계정 · ${me.email}`;
    default:
      return "";
  }
}

function MenuLink({ item }: { item: MenuItem }) {
  if (item.external) return <a href={item.to}>{item.label}</a>;
  return <NavLink to={item.to}>{item.label}</NavLink>;
}

export function Gnb({ kind, me }: { kind: LayoutKind; me: Me | null }) {
  const partner = kind === "partner" || kind === "partner-review";
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const hasMenu = MENUS[kind].length > 0 || !me;
  // 화면을 옮기면 모바일 메뉴 판을 닫는다
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [navOpen]);
  const logo = (
    <>
      <img src={partner ? "/logo-partner.svg" : "/logo.svg"} alt="STAGE DUCK" />
      {partner && <span className={styles.role}>파트너</span>}
      {kind === "admin" && <span className={`${styles.role} ${styles.roleAdmin}`}>관리자</span>}
    </>
  );
  return (
    <header className={styles.gnb}>
      <div className={`sd-container ${styles.inner}`}>
        {kind === "admin" ? (
          <a className={styles.logo} href={HOME.admin}>
            {logo}
          </a>
        ) : (
          <Link className={styles.logo} to={HOME[kind]}>
            {logo}
          </Link>
        )}
        <nav id="gnb-menu" className={`${styles.menu} ${navOpen ? styles.menuOpen : ""}`} aria-label="주 메뉴">
          {MENUS[kind].map((m) => (
            <MenuLink key={m.label} item={m} />
          ))}
          {!me && (
            <Link className={styles.mobileOnly} to="/partner">
              업체신가요?
            </Link>
          )}
        </nav>
        <div className={styles.right}>
          {me ? (
            <>
              {kind === "admin" && <span className={styles.envTag}>테스트 환경</span>}
              {(kind === "user" || kind === "partner") && <NotificationBell />}
              <AccountMenu me={me} kind={kind} />
            </>
          ) : (
            <>
              <Link className={`${styles.text} ${styles.desktopOnly}`} to="/partner">
                업체신가요?
              </Link>
              <span className={`${styles.sep} ${styles.desktopOnly}`} />
              <Link className={styles.text} to="/login">
                로그인
              </Link>
              <ButtonLink to="/signup" variant="primary" size="sm">
                가입하기
              </ButtonLink>
            </>
          )}
          {hasMenu && (
            <button
              type="button"
              className={styles.menuBtn}
              aria-label={navOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={navOpen}
              aria-controls="gnb-menu"
              onClick={() => setNavOpen((v) => !v)}
            >
              <Icon name={navOpen ? "x" : "menu"} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/** 바깥을 누르거나 Esc 를 누르면 닫히는 팝업 */
export function Popover({ button, children }: { button: (p: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className={styles.pop} ref={box}>
      {button({ open, toggle: () => setOpen((v) => !v) })}
      {open && children}
    </div>
  );
}

type Trigger = (p: { open: boolean; toggle: () => void }) => ReactNode;

/** 알림 종 + 패널. 메인 머리(features/home)는 trigger 로 목업 모양 버튼만 바꿔 같은 패널을 쓴다 */
export function NotificationBell({ trigger }: { trigger?: Trigger }) {
  return (
    <Popover
      button={
        trigger ??
        (({ open, toggle }) => (
          <button type="button" className={styles.iconBtn} aria-label="알림" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
            <Icon name="bell" />
          </button>
        ))
      }
    >
      <div className={styles.notiPanel} role="dialog" aria-label="알림">
        <div className={styles.notiHead}>
          <b>알림</b>
        </div>
        {/* 알림 목록은 3번 묶음(notification)이 이 자리에 붙인다 */}
        <div className={styles.notiFoot}>
          <Link to={NOTIFICATIONS_PATH}>알림 전체 보기</Link>
        </div>
      </div>
    </Popover>
  );
}

/** 계정 메뉴. 메인 머리(features/home)는 trigger 로 목업의 동그란 아바타 버튼을 쓴다 */
export function AccountMenu({ me, kind, trigger }: { me: Me; kind: LayoutKind; trigger?: Trigger }) {
  const logout = useLogout();
  const name = me.nickname ?? me.name;
  return (
    <Popover
      button={trigger ?? (({ open, toggle }) => (
        <button type="button" className={styles.user} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <span className={styles.avatar} aria-hidden="true">
            {name.slice(0, 1)}
          </span>
          <span className={styles.userName}>{name}</span>
          <Icon name="down" size="sm" />
        </button>
      ))}
    >
      <div className={styles.dropdown} role="menu">
        <div className={styles.dropdownHead}>
          <b>{name}</b>
          {roleText(kind, me)}
        </div>
        {ACCOUNT_LINKS[kind].map((l) => (
          <Link key={l.label} to={l.to} role="menuitem" className={styles.item}>
            <Icon name={l.icon} />
            {l.label}
          </Link>
        ))}
        {kind !== "admin" && (
          <>
            <hr className={styles.hr} />
            <Link to={NOTIFICATIONS_PATH} role="menuitem" className={styles.item}>
              <Icon name="bell" />
              알림
            </Link>
          </>
        )}
        <button type="button" role="menuitem" className={styles.item} onClick={() => logout.mutate()} disabled={logout.isPending}>
          <Icon name="out" />
          로그아웃
        </button>
      </div>
    </Popover>
  );
}
