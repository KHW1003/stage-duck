/**
 * 버튼 (DESIGN.md 5장, 목업 ui.css .btn). 높이 44 / 작은 36 / 큰 54. 알약 모양·그림자 없음.
 * - primary: 화면에서 가장 중요한 행동 하나 / default: 그 밖 / line·ghost·danger: 보조
 * - 결제·컨펌처럼 두 번 눌리면 안 되는 버튼은 loading 을 넘겨 응답이 올 때까지 끈다 (CLAUDE.md 6.2)
 * 이동은 ButtonLink 를 쓴다 (주소가 바뀌는 것은 <a>, 동작은 <button>).
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./Button.module.css";

type Variant = "primary" | "default" | "line" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Look {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

function classes({ variant = "default", size = "md", block }: Look, extra?: string) {
  return [styles.btn, styles[variant], size !== "md" ? styles[size] : "", block ? styles.block : "", extra ?? ""]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Look {
  /** true 면 버튼을 끄고 "처리 중이에요" 를 읽어 준다 */
  loading?: boolean;
}

export function Button({ variant, size, block, loading = false, disabled, className, children, type, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
      {loading && <span className="sd-sr-only">처리 중이에요</span>}
    </button>
  );
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">, Look {
  to: string;
  children: ReactNode;
}

export function ButtonLink({ to, variant, size, block, className, children, ...rest }: LinkProps) {
  return (
    <Link {...rest} to={to} className={classes({ variant, size, block }, className)}>
      {children}
    </Link>
  );
}
