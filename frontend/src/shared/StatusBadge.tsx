/**
 * 자동 검사·상태 표시. 색만으로 구분하지 않고 항상 아이콘 + 글자를 함께 보여준다 (NFR-UX-02, DESIGN.md 2.1).
 * 색은 tokens.css 의 상태 색 (#23 에서 화면 파일의 색 숫자를 토큰으로 옮김).
 */
import { Icon, type IconName } from "./ui/Icon";
import styles from "./StatusBadge.module.css";

export type CheckResult = "PASS" | "NEEDS_INFO" | "CONFLICT" | "WARNING";

const LABEL: Record<CheckResult, string> = {
  PASS: "통과",
  NEEDS_INFO: "확인 필요",
  CONFLICT: "충돌",
  WARNING: "경고",
};

const ICON: Record<CheckResult, IconName> = {
  PASS: "pass",
  NEEDS_INFO: "info",
  CONFLICT: "conflict",
  WARNING: "warn",
};

const TONE: Record<CheckResult, string> = {
  PASS: styles.pass,
  NEEDS_INFO: styles.info,
  CONFLICT: styles.conflict,
  WARNING: styles.warn,
};

export function StatusBadge({ result }: { result: CheckResult }) {
  return (
    <span role="status" aria-label={`검사 결과: ${LABEL[result]}`} className={`${styles.status} ${TONE[result]}`}>
      <Icon name={ICON[result]} size="sm" />
      {LABEL[result]}
    </span>
  );
}
