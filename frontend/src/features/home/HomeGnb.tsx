/**
 * 메인의 방문자 머리 (mockup/home.html · partner.html 의 .gnb). 안쪽 화면 머리(shared/layout/Gnb)와 모양이 다르다:
 * 로고 왼쪽 · 메뉴 가운데 · 오른쪽 둥근 버튼들.
 * - 방문자(메인): 업체신가요? · 로그인 · 검색 / 방문자(업체 메인): 사용자 홈 · 로그인 · 입점 신청
 * - 로그인한 사람은 이 머리 대신 안쪽 화면 머리(Gnb)를 본다
 * - 760px 이하: 목업은 메뉴를 숨기기만 해서, 검색 아이콘 자리에 메뉴 버튼을 두고 여닫는 판을 더했다
 *   (모바일에서 메뉴로 갈 길이 없어지지 않게. 공간 찾기는 메뉴 판 안에 있다)
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useHideOnScroll, useMobile } from "../../shared/layout/useMobile";
import { MENUS } from "../../shared/layout/menus";
import { HomeIcon } from "./icons";
import { cx } from "./cx";
import s from "./home.module.css";

interface Props {
  /** 업체 메인(/partner) 머리: 업체 로고·업체 메뉴 */
  partnerPage?: boolean;
}

export function HomeGnb({ partnerPage = false }: Props) {
  const menu = partnerPage ? MENUS.partner : MENUS.guest;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabs = useMobile(); // 아래 탭(MobileTabBar)이 메뉴를 대신한다
  const { ref, hidden } = useHideOnScroll(tabs);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header ref={ref} className={cx(s.gnb, tabs && s.gnbTabbed, tabs && "m-head")} data-scroll-hidden={hidden || undefined}>
      <div className={s.gnbInner}>
        <Link className={s.logo} to={partnerPage && !tabs ? "/partner" : "/"} aria-label={partnerPage && !tabs ? "STAGE DUCK 파트너 홈" : "STAGE DUCK 홈"}>
          <img className={cx(s.logoImg, tabs && "m-word")} src={partnerPage ? "/logo-partner.svg" : "/logo.svg"} alt="STAGE DUCK" />
          {partnerPage && <span className={s.partnerChip}>파트너</span>}
        </Link>
        <nav id="home-menu" className={cx(s.gnbMenu, open && s.gnbMenuOpen)} aria-label={partnerPage ? "업체 메뉴" : "주 메뉴"}>
          {/* 모바일(560px 아래)은 로고를 숨기니 메뉴 맨 위에 홈을 둔다 (11/23) */}
          <Link className={s.gnbHome} to={partnerPage ? "/partner" : "/"} onClick={() => setOpen(false)}>
            홈
          </Link>
          {menu.map((m) => (
            <Link key={m.label} to={m.to}>
              {m.label}
            </Link>
          ))}
        </nav>
        <div className={s.gnbRight}>
          {partnerPage ? (
            <>
              <Link className={s.gnbText} to="/">
                뮤지션 홈
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
        </div>
      </div>
    </header>
  );
}
