/** 여러 개 고르기 (체크 상자 칩) — 요청서 화면 전용 */
import type { Option } from "./codes";
import styles from "./Request.module.css";

interface Props {
  legend: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
  hint?: string;
  error?: string;
}

export function Choices({ legend, options, value, onChange, required, hint, error }: Props) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div>
      <fieldset className={styles.choices} aria-invalid={error ? true : undefined}>
        <legend className={styles.legend}>
          {legend}
          {required && (
            <span className={styles.req} aria-hidden="true">
              *
            </span>
          )}
        </legend>
        {options.map((o) => (
          <label key={o.value} className={styles.chip}>
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </fieldset>
      {hint && <p className={styles.hint}>{hint}</p>}
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
