/**
 * 요청서 표 한 줄 (목업 v4 .form-table): 왼쪽 회색 칸 = 이름, 오른쪽 = 입력.
 * - htmlFor 가 있으면 이름이 label 이 되어 입력 칸 이름으로 읽힌다 (getByLabelText)
 * - 여러 칸을 묶는 줄(시간·지역·체크 묶음)은 각 입력에 aria-label·fieldset legend 를 따로 단다
 */
import type { CSSProperties, ReactNode } from "react";
import { Ico } from "../../shared/ui/Ico";
import type { Option } from "./codes";

interface RowProps {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}

export function Row({ label, required, htmlFor, children }: RowProps) {
  const name = (
    <>
      {label}
      {required && (
        <span className="req" aria-hidden="true">
          *
        </span>
      )}
    </>
  );
  return (
    <div>
      {htmlFor ? (
        <label className="form-table__th" htmlFor={htmlFor}>
          {name}
        </label>
      ) : (
        <span className="form-table__th" aria-hidden="true">
          {name}
        </span>
      )}
      <span className="form-table__td">{children}</span>
    </div>
  );
}

/** 칸 아래 오류 (id 를 입력 칸 aria-describedby 로 잇는다) */
export function Err({ id, msg }: { id?: string; msg?: string }) {
  if (!msg) return null;
  return (
    <span className="field__error" id={id} role="alert">
      <Ico name="warn" sm />
      {msg}
    </span>
  );
}

export function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span className="field__hint" id={id}>
      {children}
    </span>
  );
}

/** 여러 개 고르기 (체크 상자 묶음, 목업 .checks) */
export function Checks({
  legend,
  options,
  value,
  onChange,
  cols,
}: {
  legend: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  cols?: number;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset className="rq-fieldset">
      <legend>{legend}</legend>
      <div className="checks" style={cols ? ({ ["--cols" as string]: cols } as CSSProperties) : undefined}>
        {options.map((o) => {
          const m = o.label.match(/^(.*?) \((.*)\)$/);
          return (
            <label key={o.value} className="check">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              {m ? (
                <span>
                  {m[1]}
                  <small>{m[2]}</small>
                </span>
              ) : (
                o.label
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
