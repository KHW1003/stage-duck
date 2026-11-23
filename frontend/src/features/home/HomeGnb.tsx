/**
 * 메인 머리 (mockup/home.html · partner.html 의 .gnb). 안쪽 화면 머리(shared/layout/Gnb)와 모양이 다르다:
 * 로고 왼쪽 · 메뉴 가운데 · 오른쪽 둥근 버튼들.
 * - 방문자(메인): 업체신가요? · 로그인 · 검색 / 방문자(업체 메인): 사용자 홈 · 로그인 · 입점 신청
 * - 로그인: 알림 · 검색 · 아바타. 알림·아바타를 누르면 안쪽 화면과 같은 알림 패널·계정 메뉴가 열린다
 * - 760px 이하: 목업은 메뉴를 숨기기만 해서, 검색 아이콘 자리에 메뉴 버튼을 두고 여닫는 판을 더했다
 *   (모바일에서 메뉴로 갈 길이 없어지지 않게. 공간 찾기는 메뉴 판 안에 있다)
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Me } from "../../shared/api/types";
import type { LayoutKind } from "../../shared/auth/useMe";
import { AccountMenu, NotificationBell } from "../../shared/layout/Gnb";
import { MENUS } from "../../shared/layout/menus";
import { HomeIcon } from "./icons";
import { cx } from "./cx";
import s from "./home.module.css";

interface Props {
  kind: LayoutKind;
  me: Me | null;
  /** 업체 메인(/partner) 머리: 업체 로고·업체 메뉴 */
  partnerPage?: boolean;
}

export function HomeGnb({ kind, me, partnerPage = false }: Props) {
  const partner = partnerPage || kind === "partner" || kind === "partner-review";
  const menu = partnerPage && !me ? MENUS.partner : MENUS[kind];
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const name = me ? (me.nickname ?? me.name) : "";
  return (
    <header className={s.gnb}>
      <div className={s.gnbInner}>
        <Link className={s.logo} to={partnerPage ? "/partner" : "/"} aria-label={partnerPage ? "STAGE DUCK 파트너 홈" : "STAGE DUCK 홈"}>
          <img className={s.logoImg} src={partner ? "/logo-partner.svg" : "/logo.svg"} alt="STAGE DUCK" />
          {partner && <span className={s.partnerChip}>파트너</span>}
        </Link>
        {menu.length > 0 && (
          <nav id="home-menu" className={cx(s.gnbMenu, open && s.gnbMenuOpen)} aria-label={partnerPage ? "업체 메뉴" : "주 메뉴"}>
            {/* 모바일(560px 아래)은 로고를 숨기니 메뉴 맨 위에 홈을 둔다 (11/23) */}
            <Link className={s.gnbHome} to={partnerPage ? "/partner" : "/"} onClick={() => setOpen(false)}>
              홈
            </Link>
            {menu.map((m) =>
              m.external ? (
                <a key={m.label} href={m.to}>
                  {m.label}
                </a>
              ) : (
                <Link key={m.label} to={m.to}>
                  {m.label}
                </Link>
              ),
            )}
          </nav>
        )}
        <div className={cx(s.gnbRight, me && s.gnbRightMember)}>
          {me ? (
            <>
              {(kind === "user" || kind === "partner") && (
                <NotificationBell
                  trigger={({ open: o, toggle }) => (
                    <button type="button" className={s.iconBtn} aria-label="알림" aria-haspopup="dialog" aria-expanded={o} onClick={toggle}>
                      <HomeIcon name="bell" />
                    </button>
                  )}
                />
              )}
              {!partnerPage && (
                <button type="button" className={cx(s.iconBtn, s.gnbSearch)} aria-label="검색" onClick={() => navigate("/venues")}>
                  <HomeIcon name="search" />
                </button>
              )}
              <AccountMenu
                me={me}
                kind={kind}
                trigger={({ open: o, toggle }) => (
                  <button type="button" className={s.avatar} aria-label={`${name} 계정 메뉴`} aria-haspopup="menu" aria-expanded={o} onClick={toggle}>
                    {name.slice(0, 1)}
                  </button>
                )}
              />
            </>
          ) : partnerPage ? (
            <>
              <Link className={s.gnbText} to="/">
                사용자 홈
              </Link>
              <Link className={s.pill} to="/login">
                로그인
              </Link>
              <Link className={cx(s.btn, s.btnSm, s.btnPrimary)} to="/signup/supplier">
                입점 신청
              </Link>
            </>
          ) : (
            <>
              <Link className={s.gnbText} to="/partner">
                업체신가요?
              </Link>
              <Link className={s.pill} to="/login">
                로그인
              </Link>
              <button type="button" className={cx(s.iconBtn, s.gnbSearch)} aria-label="검색" onClick={() => navigate("/venues")}>
                <HomeIcon name="search" />
              </button>
            </>
          )}
          {menu.length > 0 && (
            <button
              type="button"
              className={cx(s.iconBtn, s.gnbMenuBtn)}
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={open}
              aria-controls="home-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <HomeIcon name={open ? "close" : "menu"} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
