/** 글·댓글 삭제 확인 창. Esc·[취소]로 닫는다 */
import { useEffect, useId, useRef } from "react";
import { Button } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import styles from "./Community.module.css";

interface Props {
  loading: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  desc?: string;
}

export function ConfirmDelete({ loading, error, onCancel, onConfirm, title = "글을 지울까요?", desc = "지운 글은 다시 볼 수 없어요." }: Props) {
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
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} className={styles.dialog}>
        <h2 id={`${id}-t`}>{title}</h2>
        <p>{desc}</p>
        <ErrorNotice error={error} />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            취소
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            지우기
          </Button>
        </div>
      </div>
    </div>
  );
}
