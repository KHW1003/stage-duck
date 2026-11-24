/**
 * 화면을 옮기면 늘 맨 위에서, 주소에 #구역이 있으면 그 구역 첫머리에서 연다 (11/24 해원).
 * - 바닥글 링크처럼 다른 화면으로 가면 이전 화면의 스크롤 위치가 남아 어중간한 곳에서 열리던 문제
 * - ?chat= 처럼 주소 뒤 조건(search)만 바뀌는 것은 같은 화면이라 움직이지 않는다
 * - 뒤로·앞으로 가기(POP)는 브라우저가 기억한 자리를 그대로 둔다 (#구역이 있으면 그 구역으로)
 * - 사이트가 scroll-behavior: smooth 라도 화면 이동은 즉시(instant) — 미끄러지는 동안 중간 위치가 보이지 않게
 * - #구역은 화면 데이터가 늦게 그려질 수 있어 약 2초 동안 기다렸다가 찾는다. 머리줄에 가리지 않게 CSS scroll-margin-top
 */
import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const WAIT_TRIES = 40; // 50ms × 40 = 약 2초. 시계 대신 횟수로 센다 (시계를 멈춘 테스트에서도 끝나게)
const WAIT_STEP_MS = 50;

export function ScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  const nav = useNavigationType();

  useLayoutEffect(() => {
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let timer = 0;
      let tries = 0;
      const find = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ block: "start", behavior: "instant" });
          return;
        }
        if (++tries < WAIT_TRIES) timer = window.setTimeout(find, WAIT_STEP_MS);
        else if (nav !== "POP") window.scrollTo({ top: 0, left: 0, behavior: "instant" }); // 구역이 없으면 맨 위
      };
      find();
      return () => window.clearTimeout(timer);
    }
    if (nav !== "POP") window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // 이동 방식(nav)은 deps 에 넣지 않는다: ?chat= 처럼 같은 화면에서 PUSH 로 바뀌기만 해도 다시 돌면 맨 위로 튄다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hash]);

  return null;
}
