/** 입점 단계 표시 (목업 p-onboarding.html): 01 계정 → 02 사업자 정보 → 심사 → 03 서비스 등록 */
import styles from "./Supplier.module.css";

const STEPS = [
  { no: "01", label: "계정" },
  { no: "02", label: "사업자 정보" },
  { no: "심사", label: "관리자 확인" },
  { no: "03", label: "서비스 등록" },
];

/** now: 지금 단계 번호 (0부터). 그 앞은 끝난 단계로 표시한다 */
export function Steps({ now }: { now: number }) {
  return (
    <ol className={styles.steps} aria-label="입점 단계">
      {STEPS.map((s, i) => (
        <li
          key={s.label}
          className={[styles.step, i < now ? styles.done : "", i === now ? styles.now : ""].filter(Boolean).join(" ")}
          aria-current={i === now ? "step" : undefined}
        >
          {s.no}
          <b>{s.label}</b>
        </li>
      ))}
    </ol>
  );
}
