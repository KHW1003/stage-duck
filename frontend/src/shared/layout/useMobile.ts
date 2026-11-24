/** 모바일 아래 탭·글자 로고 (560px 이하). 561px 이상은 아무것도 바꾸지 않는다 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(max-width: 560px)";
const media = () => (typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void) {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

export function useMobile(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}

const STEP = 8; // 손가락 떨림은 무시한다

/** 아래로 내리면 머리를 숨기고, 올리거나 맨 위면 다시 보인다. 머리 안에 초점이 있으면 숨기지 않는다 */
export function useHideOnScroll(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (!enabled) return;
    const header = ref.current;
    let last = window.scrollY;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const y = Math.min(Math.max(window.scrollY, 0), Math.max(max, 0)); // 끝에서 튕기는 값은 뺀다
      const top = y <= (header?.offsetHeight ?? 0);
      if (!top && Math.abs(y - last) < STEP) return;
      setHidden(!top && y > last && !header?.contains(document.activeElement));
      last = y;
    };
    const show = () => setHidden(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    header?.addEventListener("focusin", show);
    return () => {
      window.removeEventListener("scroll", onScroll);
      header?.removeEventListener("focusin", show);
    };
  }, [enabled]);
  return { ref, hidden };
}
