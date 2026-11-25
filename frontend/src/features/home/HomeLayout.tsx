/**
 * 메인(/)·업체 메인(/partner) 뼈대: 메인 머리 · 본문 · 메인 바닥글 (mockup/home.html · partner.html).
 * 안쪽 화면 뼈대(shared/layout/AppLayout)와 머리·바닥글 모양이 달라 따로 둔다.
 * - 업체 메인이거나 업체 계정이면 data-theme="partner" (업체 색 #0368B6)
 * - 화면을 옮길 때의 스크롤(맨 위·#구역)은 App 의 ScrollOnNavigate 한 곳에서 한다 (11/24)
 * - 채팅 위젯(3번 묶음)은 AppLayout 과 같은 조건으로 띄운다: 사용자·승인 업체만, 정지 계정은 빼고 (D-42, 목업 README "채팅 위젯")
 */
import { useLocation } from "react-router-dom";
import { SuspensionGate } from "../../shared/auth/SuspensionGate";
import { layoutKindOf, useMe } from "../../shared/auth/useMe";
import { ChatWidget } from "../../shared/chat/ChatWidget";
import { Gnb } from "../../shared/layout/Gnb";
import { MobileTabBar } from "../../shared/layout/MobileTabBar";
import { HomeFooter } from "./HomeFooter";
import { HomeGnb } from "./HomeGnb";
import s from "./home.module.css";

export function HomeLayout() {
  const me = useMe();
  const kind = layoutKindOf(me.data);
  const { pathname } = useLocation();
  const partnerPage = pathname.startsWith("/partner");
  const partner = partnerPage || kind === "partner" || kind === "partner-review";

  return (
    <div className={s.root} data-theme={partner ? "partner" : undefined} data-layout={kind}>
      {/* 로그인하면 안쪽 화면과 같은 머리 — 화면을 옮겨도 로고·파트너 표시·이름이 움직이지 않게 (11/25) */}
      {kind === "guest" ? <HomeGnb partnerPage={partnerPage} /> : <Gnb kind={kind} me={me.data ?? null} />}
      <main>
        <SuspensionGate />
      </main>
      <HomeFooter partner={partnerPage} />
      {!me.isPending && <MobileTabBar kind={kind} me={kind === "guest" ? null : (me.data ?? null)} />}
      {me.data && me.data.status !== "SUSPENDED" && (kind === "user" || kind === "partner") && <ChatWidget me={me.data} />}
    </div>
  );
}
