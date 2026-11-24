/**
 * 확인 창 (mockup-v4 .layer > .modal 마크업 그대로, kit.css). 목업의 data-open / data-close 를 React 상태로 옮긴 것.
 * - 열리면 창에 초점을 옮기고, 닫히면 연 버튼으로 돌려준다
 * - Esc·바깥(어두운 바탕) 누르기·닫기 버튼으로 닫힌다 (busy 일 때는 닫지 않는다)
 * - 열려 있는 동안 뒤 화면 스크롤을 잠근다
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Ico } from "./Ico";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
  busy?: boolean;
  focusableBody?: boolean;
  /** 아래에서 올라오는 판 (모바일 아래 탭) */
  sheet?: boolean;
}

export function KitModal({ title, onClose, children, foot, busy = false, focusableBody = false, sheet = false }: Props) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className={sheet ? "layer layer--sheet" : "layer"} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className={sheet ? "modal sheet" : "modal"} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} tabIndex={-1} ref={box}>
        <div className="modal__head">
          <h2 id={`${id}-t`}>{title}</h2>
          <button className="icon-btn" type="button" aria-label="닫기" onClick={onClose} disabled={busy}>
            <Ico name="x" />
          </button>
        </div>
        <div className="modal__body" tabIndex={focusableBody ? 0 : undefined}>{children}</div>
        {foot && <div className="modal__foot">{foot}</div>}
      </div>
    </div>
  );
}
