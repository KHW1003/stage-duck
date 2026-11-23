/** 신고 창 (FR-COMM-03·04). 사유를 적어 4번 POST /reports 로 보낸다. 처리(블라인드·경고)는 관리자가 한다 */
import { useEffect, useId, useRef, useState } from "react";
import { useScrollLock } from "../../shared/ui/useScrollLock";
import { Button } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { useReport } from "./api";
import styles from "./Community.module.css";

interface Props {
  targetType: "FREE_POST" | "FREE_COMMENT";
  targetId: number;
  onClose: () => void;
}

export function ReportModal({ targetType, targetId, onClose }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const report = useReport();
  const [reason, setReason] = useState("");

  useEffect(() => ref.current?.focus(), []);
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !report.isPending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [report.isPending, onClose]);

  return (
    <div className={styles.backdrop}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} className={styles.dialog}>
        <h2 id={`${id}-t`}>{targetType === "FREE_POST" ? "글 신고" : "댓글 신고"}</h2>
        {report.isSuccess ? (
          <>
            <p role="status">신고를 받았어요. 관리자가 확인한 뒤 처리해요.</p>
            <div className={styles.actions}>
              <Button variant="primary" onClick={onClose}>
                닫기
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>연락처 노출, 외부 거래 유도, 업체 홍보, 욕설처럼 규칙에 어긋나는 이유를 적어 주세요.</p>
            <label className="sd-sr-only" htmlFor={`${id}-r`}>
              신고 사유
            </label>
            <textarea id={`${id}-r`} className={styles.commentInput} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <ErrorNotice error={report.error} />
            <div className={styles.actions}>
              <Button variant="ghost" onClick={onClose} disabled={report.isPending}>
                취소
              </Button>
              <Button
                variant="danger"
                loading={report.isPending}
                disabled={!reason.trim()}
                onClick={() => report.mutate({ targetType, targetId, reason: reason.trim() })}
              >
                신고하기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
