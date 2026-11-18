/** 한 번 더 묻는 창 (건너뛰기 책임 고지, 전부 구했어요, 공고 내리기). Esc·[취소]로 닫는다 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import styles from "./Performance.module.css";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ title, children, confirmLabel, cancelLabel = "취소", danger, loading, error, onCancel, onConfirm }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loading, onCancel]);

  return (
    <div className={styles.backdrop}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className={styles.dialog}>
        <h2 id={`${id}-title`}>{title}</h2>
        {children}
        <ErrorNotice error={error} />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
