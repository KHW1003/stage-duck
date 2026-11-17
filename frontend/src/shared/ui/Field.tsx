/**
 * 입력 칸 (DESIGN.md 5장 "입력 묶음", 목업 ui.css .field). 이름은 위, 입력칸 44px, 오류는 칸 바로 아래.
 * - 오류 문구는 서버가 준 fieldErrors 의 reason 을 그대로 넘긴다 (CLAUDE.md 6.2: 화면에서 지어내지 않는다).
 *   fieldErrorOf(error, "email") 로 꺼낸다 (ErrorText.tsx).
 * - 이름·도움말·오류를 입력칸과 aria 로 이어서, 읽어 주는 프로그램이 함께 읽는다.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  /** 필수 칸이면 이름 옆에 * */
  required?: boolean;
  /** 선택 칸이면 이름 옆에 "(선택)" */
  optional?: boolean;
  hint?: string;
  error?: string;
  /** 입력 부품을 받는다. id·aria 속성을 넘겨 주니 그대로 펼쳐 붙인다 */
  children: (control: ControlProps) => ReactNode;
}

export interface ControlProps {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
  "aria-required": boolean | undefined;
}

export function Field({ label, required, optional, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && (
          <span className={styles.req} aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className={styles.opt}>(선택)</span>}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon name="conflict" size="sm" />
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { numeric?: boolean };

/** 한 줄 입력칸. 금액·인원처럼 숫자는 numeric 으로 오른쪽 정렬 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ numeric, className, ...rest }, ref) {
  const cls = [styles.input, numeric ? styles.numeric : "", className ?? ""].filter(Boolean).join(" ");
  return <input ref={ref} className={cls} {...rest} />;
});
