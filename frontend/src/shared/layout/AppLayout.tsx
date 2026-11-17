/**
 * 모든 화면의 뼈대 (#23): 머리 · 본문 · 바닥글. App.tsx 에서 라우트를 이 안에 넣는다.
 * - 로그인한 사람(GET /me)에 따라 머리 메뉴가 바뀐다: 방문자 / 사용자 / 승인 업체 / 심사 중 업체 / 관리자
 * - 업체 계정이면 data-theme="partner" 로 업체 색(#0368B6)을 쓴다
 * - 본문은 data-sd-area="content" 로 목업 v3 다듬은 값(글자 15px, 모서리 8px)을 쓴다
 * - 화면 맨 위 시뮬레이션 안내 띠는 두지 않는다 (CLAUDE.md 26, D-41)
 * - 채팅 위젯(3번 묶음)은 만들어지면 여기에 한 번만 둔다 (목업 README "채팅 위젯")
 */
import { Outlet } from "react-router-dom";
import { layoutKindOf, useMe } from "../auth/useMe";
import { Footer } from "./Footer";
import { Gnb } from "./Gnb";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  const me = useMe();
  const kind = layoutKindOf(me.data);
  const partner = kind === "partner" || kind === "partner-review";
  return (
    <div className={styles.app} data-theme={partner ? "partner" : undefined} data-layout={kind}>
      <Gnb kind={kind} me={kind === "guest" ? null : (me.data ?? null)} />
      <main className={styles.main} data-sd-area="content">
        <Outlet />
      </main>
      <Footer partner={partner} />
    </div>
  );
}
