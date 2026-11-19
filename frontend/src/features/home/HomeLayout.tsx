/**
 * 메인(/)·업체 메인(/partner) 뼈대: 메인 머리 · 본문 · 메인 바닥글 (mockup/home.html · partner.html).
 * 안쪽 화면 뼈대(shared/layout/AppLayout)와 머리·바닥글 모양이 달라 따로 둔다.
 * - 업체 메인이거나 업체 계정이면 data-theme="partner" (업체 색 #0368B6)
 * - 주소에 #flow 처럼 구역이 있으면 그 구역으로 부드럽게 내려간다 (다른 화면에서 "이용 방법"을 눌렀을 때)
 * - 채팅 위젯(3번 묶음)은 AppLayout 과 같은 조건으로 띄운다: 사용자·승인 업체만 (D-42, 목업 README "채팅 위젯")
 */
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { layoutKindOf, useMe } from "../../shared/auth/useMe";
import { ChatWidget } from "../../shared/chat/ChatWidget";
import { HomeFooter } from "./HomeFooter";
import { HomeGnb } from "./HomeGnb";
import s from "./home.module.css";

export function HomeLayout() {
  const me = useMe();
  const kind = layoutKindOf(me.data);
  const { pathname, hash } = useLocation();
  const partnerPage = pathname.startsWith("/partner");
  const partner = partnerPage || kind === "partner" || kind === "partner-review";

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: "smooth" });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className={s.root} data-theme={partner ? "partner" : undefined} data-layout={kind}>
      <HomeGnb kind={kind} me={kind === "guest" ? null : (me.data ?? null)} partnerPage={partnerPage} />
      <main>
        <Outlet />
      </main>
      <HomeFooter partner={partnerPage} />
      {me.data && (kind === "user" || kind === "partner") && <ChatWidget me={me.data} />}
    </div>
  );
}
