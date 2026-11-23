/**
 * 소개 글 신고 창 (AC-F4-03, #31). 사유를 적어 POST /reports (PR_POST) 로 보낸다. 블라인드·경고는 관리자가 처리한다.
 * 목업 v4 post.html 의 [신고] 버튼. 창 모양은 공통 KitModal.
 */
import { useId, useState } from "react";
import { Button } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { KitModal } from "../../shared/ui/KitModal";
import { useReportPrPost } from "./api";
import styles from "./Board.module.css";

export function ReportDialog({ postId, onClose }: { postId: number; onClose: () => void }) {
  const id = useId();
  const report = useReportPrPost();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const empty = reason.trim() === "";

  function send() {
    setTried(true);
    if (empty) return;
    report.mutate({ targetId: postId, reason: reason.trim() });
  }

  if (report.isSuccess) {
    return (
      <KitModal
        title="소개 글 신고"
        onClose={onClose}
        foot={
          <Button variant="primary" onClick={onClose}>
            닫기
          </Button>
        }
      >
        <p role="status">신고를 받았어요. 관리자가 확인한 뒤 처리해요.</p>
      </KitModal>
    );
  }

  return (
    <KitModal
      title="소개 글 신고"
      onClose={onClose}
      busy={report.isPending}
      foot={
        <>
          <Button onClick={onClose} disabled={report.isPending}>
            취소
          </Button>
          <Button variant="primary" onClick={send} loading={report.isPending}>
            신고하기
          </Button>
        </>
      }
    >
      <label htmlFor={id} className={styles.th}>
        신고 사유
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        rows={4}
        maxLength={500}
        value={reason}
        aria-invalid={tried && empty ? true : undefined}
        aria-describedby={tried && empty ? `${id}-error` : undefined}
        onChange={(e) => setReason(e.target.value)}
      />
      {tried && empty && (
        <p id={`${id}-error`} className={styles.fieldError}>
          신고 사유를 적어 주세요.
        </p>
      )}
      <ErrorNotice error={report.error} />
    </KitModal>
  );
}
