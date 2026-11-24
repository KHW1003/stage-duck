/**
 * 모든 화면의 뼈대 (#23): 머리 · 본문 · 바닥글. App.tsx 에서 라우트를 이 안에 넣는다.
 * - 로그인한 사람(GET /me)에 따라 머리 메뉴가 바뀐다: 방문자 / 사용자 / 승인 업체 / 심사 중 업체 / 관리자
 * - 업체 계정이면 data-theme="partner" 로 업체 색(#0368B6)을 쓴다
 * - 본문은 data-sd-area="content" 로 목업 v3 다듬은 값(글자 15px, 모서리 8px)을 쓴다
 * - 화면 맨 위 시뮬레이션 안내 띠는 두지 않는다 (CLAUDE.md 26, D-41)
 * - 채팅 위젯(3번 묶음)은 여기에 한 번만 둔다: 사용자·승인 업체만 (목업 README "채팅 위젯")
 * - 오류 화면 (mockup-v4 error.html): 화면이 깨지면 500, 인터넷이 끊기면 "연결 끊김".
 *   연결 끊김은 화면을 지우지 않고 가려 두기만 해서, 다시 연결되면 쓰던 내용이 그대로 남아 있다
 */
import { Outlet, useLocation } from "react-router-dom";
import { ChatWidget } from "../chat/ChatWidget";
import { layoutKindOf, useMe } from "../auth/useMe";
import { ErrorBoundary } from "./ErrorBoundary";
import { Footer } from "./Footer";
import { Gnb } from "./Gnb";
import { MobileTabBar } from "./MobileTabBar";
import { useOnline } from "./useOnline";
import { ErrorView } from "./ErrorView";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const me = useMe();
  const kind = layoutKindOf(me.data);
  const partner = kind === "partner" || kind === "partner-review";
  const online = useOnline();
  const { pathname } = useLocation();
  return (
    <div className={styles.app} data-theme={partner ? "partner" : undefined} data-layout={kind}>
      <Gnb kind={kind} me={kind === "guest" ? null : (me.data ?? null)} />
      <main className={styles.main} data-sd-area="content">
        {!online && (
          <div className="container main">
            <ErrorView kind="offline" onRetry={() => navigator.onLine && window.location.reload()} />
          </div>
        )}
        <div hidden={!online}>
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <Footer partner={partner} />
      {!me.isPending && <MobileTabBar kind={kind} me={kind === "guest" ? null : (me.data ?? null)} />}
      {/* 정지 계정은 채팅을 못 쓴다 — 띄우면 막힌 채팅 API·실시간 연결을 되풀이해 부른다 (AC-F5-18) */}
      {me.data && me.data.status !== "SUSPENDED" && (kind === "user" || kind === "partner") && <ChatWidget me={me.data} />}
    </div>
  );
}
