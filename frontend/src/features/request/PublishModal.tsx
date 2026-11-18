/** 공고 게시 확인 창 (목업 request-2.html 아래쪽). 모집 순서는 "필요해요"인 단계만 보여 준다 (AC-F2-08). */
import { useEffect, useId, useRef } from "react";
import type { StageType } from "../../shared/api/types";
import { Button } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { STAGE_LABEL } from "./codes";
import styles from "./Request.module.css";

interface Props {
  title: string;
  formLabel: string;
  when: string;
  where: string;
  stages: StageType[];
  error: unknown;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PublishModal({ title, formLabel, when, where, stages, error, loading, onClose, onConfirm }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => dialogRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loading, onClose]);

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className={styles.dialog}>
        <h2 id={`${id}-title`}>공고 게시</h2>
        <p>이 내용으로 공고를 올릴까요? 게시한 뒤 고치면 새 버전이 생기고, 업체에게 바뀐 항목이 보여요.</p>
        <dl className={styles.summary}>
          <dt>공연</dt>
          <dd>
            {title} · {formLabel}
          </dd>
          <dt>날짜 · 시간</dt>
          <dd className="sd-num">{when}</dd>
          <dt>지역 · 관객</dt>
          <dd>{where}</dd>
          <dt>모집 순서</dt>
          <dd>
            <ol className={styles.order}>
              {stages.map((s, i) => (
                <li key={s}>{i === 0 ? `${STAGE_LABEL[s]} · 지금 모집` : STAGE_LABEL[s]}</li>
              ))}
            </ol>
          </dd>
        </dl>
        <ErrorNotice error={error} />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            더 고칠게요
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>
            게시하기
          </Button>
        </div>
      </div>
    </div>
  );
}
