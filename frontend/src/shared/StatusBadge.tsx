/**
 * 자동 검사·상태 표시. 색만으로 구분하지 않고 항상 글자를 함께 보여준다 (NFR-UX-02).
 */
export type CheckResult = "PASS" | "NEEDS_INFO" | "CONFLICT" | "WARNING";

const LABEL: Record<CheckResult, string> = {
  PASS: "통과",
  NEEDS_INFO: "확인 필요",
  CONFLICT: "충돌",
  WARNING: "경고",
};

const COLOR: Record<CheckResult, string> = {
  PASS: "#1f7a3d",
  NEEDS_INFO: "#6b5b00",
  CONFLICT: "#b42318",
  WARNING: "#b54708",
};

export function StatusBadge({ result }: { result: CheckResult }) {
  return (
    <span
      role="status"
      aria-label={`검사 결과: ${LABEL[result]}`}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${COLOR[result]}`,
        color: COLOR[result],
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {LABEL[result]}
    </span>
  );
}
