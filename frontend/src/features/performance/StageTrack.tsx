/** 섭외 진행 (공연장 → 장비 → 엔지니어). 색만으로 구분하지 않고 상태 글자를 함께 쓴다 (CLAUDE.md 4장) */
import type { StageSummary } from "../../shared/api/types";
import { stageLine } from "./labels";
import styles from "./Performance.module.css";

const TONE: Partial<Record<StageSummary["status"], string>> = {
  CONFIRMED: styles.confirmed,
  OPEN: styles.active,
  NEGOTIATING: styles.active,
  SKIPPED: styles.skipped,
  RECHECK: styles.recheck,
};

export function StageTrack({ stages }: { stages: StageSummary[] }) {
  if (stages.length === 0) return null;
  return (
    <ol className={styles.track} aria-label="섭외 진행">
      {stages.map((s) => (
        <li key={s.id} className={[styles.step, TONE[s.status] ?? ""].filter(Boolean).join(" ")}>
          <span className={styles.dot} aria-hidden="true" />
          {stageLine(s)}
        </li>
      ))}
    </ol>
  );
}
