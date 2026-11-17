/**
 * 금액 표시 (CLAUDE.md 6.2·11). 서버가 준 원 단위 정수를 "1,850,000원" 처럼 보여 주기만 한다.
 * 화면에서 더하거나 곱하지 않는다. 정수가 아닌 값이 오면 계약 위반이라 숫자를 지어내지 않고 오류를 낸다.
 */
import styles from "./MoneyText.module.css";

interface Props {
  /** 원 단위 정수 (부가세 포함) */
  value: number;
  /** 단위 글자. 표 안처럼 단위를 따로 적는 곳은 "" */
  unit?: string;
  /** 굵게·크게 (합계·결제 금액) */
  strong?: boolean;
  className?: string;
}

const FORMAT = new Intl.NumberFormat("ko-KR");

export function formatWon(value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`금액은 원 단위 정수여야 해요: ${value}`);
  }
  return FORMAT.format(value);
}

export function MoneyText({ value, unit = "원", strong = false, className }: Props) {
  const cls = [styles.money, strong ? styles.strong : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      {formatWon(value)}
      {unit}
    </span>
  );
}
