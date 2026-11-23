/**
 * 날짜 고르기 칸. 브라우저 기본 날짜 칸(<input type="date">) 대신 쓴다.
 * - 기본 칸은 연도를 여섯 자리까지 받고, 달력이 좁아 고르기 불편했다.
 * - 직접 입력: 숫자만 넣으면 YYYY-MM-DD 로 맞춰진다 (최대 8자리 → 연도는 네 자리). 있는 날짜이고 min~max 안이면 값이 된다.
 *   아니면 값은 "" 로 두고 칸 아래에 이유를 보인다. 달력 버튼을 누르면 넓은 달력이 열린다.
 * - 연도·월은 고르기 목록으로 바로 옮긴다 (생년월일처럼 먼 날짜도 몇 번 만에). 연도는 min~max 안의 네 자리만.
 * - 값은 "YYYY-MM-DD" 문자열 (기본 칸과 같다). 고르지 않았으면 "".
 * - 키보드: 칸에서 Alt+↓(또는 ↓) 달력 열기. 달력에서 ←→↑↓ 하루·한 주, PageUp/PageDown 한 달, Home/End 주의 처음·끝,
 *   Enter·Space 고르기, Esc 닫기(칸으로 돌아감).
 * - 달력은 body 에 띄워(position: fixed) 감싼 상자의 overflow 에 잘리지 않는다. 아래 자리가 모자라면 위로 연다.
 *   바깥을 누르거나 화면을 굴리거나 창 크기를 바꾸면 닫는다 (Select 와 같게).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Ico } from "./Ico";
import { Select } from "./Select";
import s from "./DateField.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  /** 값이 없을 때 처음 보여 줄 달 (예: 생년월일은 30년 전) */
  initialMonth?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
/** 숫자만 골라 YYYY-MM-DD 모양으로 (8자리까지) */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join("-");
}
const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" → Date (네 자리 연도·있는 날짜만). 아니면 null */
export function parseIso(v: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(d) === v ? d : null;
}

export function formatKo(v: string): string {
  const d = parseIso(v);
  return d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})` : "";
}

/** 오늘에서 n년 뒤(앞이면 음수) 날짜 "YYYY-MM-DD" — min·max 에 쓴다 */
export function yearsFromNow(n: number, today = new Date()): string {
  return toIso(new Date(today.getFullYear() + n, today.getMonth(), today.getDate()));
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function addMonths(d: Date, n: number) {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
}

export function DateField({ value, onChange, id, min, max, placeholder = "YYYY-MM-DD", initialMonth, className, ...aria }: Props) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 시각을 떼야 max=오늘 과 비교가 맞다
  const minD = parseIso(min);
  const maxD = parseIso(max);
  const clamp = (d: Date) => (minD && d < minD ? minD : maxD && d > maxD ? maxD : d);
  const selected = parseIso(value);

  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Date>(() => clamp(selected ?? parseIso(initialMonth) ?? today));
  const [pos, setPos] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const [problem, setProblem] = useState("");
  const committed = useRef(value);
  const msgId = useId();

  // 바깥(달력·부모)에서 값이 바뀌면 입력칸 글자도 맞춘다
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
      setProblem("");
    }
  }, [value]);

  const fmt = (d: Date) => toIso(d);
  function commit(next: string) {
    committed.current = next;
    if (next !== value) onChange(next);
  }
  function onType(raw: string) {
    const v = maskDate(raw);
    setText(v);
    if (v.length < 10) {
      setProblem("");
      commit("");
      return;
    }
    const d = parseIso(v);
    if (!d) {
      setProblem("없는 날짜예요. 다시 확인해 주세요.");
      commit("");
    } else if (out(d)) {
      setProblem(`${minD ? fmt(minD) : ""} ~ ${maxD ? fmt(maxD) : ""} 사이 날짜를 넣어 주세요.`);
      commit("");
    } else {
      setProblem("");
      commit(v);
    }
  }
  const pop = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const gridNav = useRef(false);

  const out = (d: Date) => (minD !== null && d < minD) || (maxD !== null && d > maxD);
  const minYear = minD?.getFullYear() ?? today.getFullYear() - 100;
  const maxYear = maxD?.getFullYear() ?? today.getFullYear() + 5;

  function show() {
    gridNav.current = true;
    setFocus(clamp(selected ?? parseIso(initialMonth) ?? today));
    setOpen(true);
  }
  function close(back = true) {
    setOpen(false);
    if (back) input.current?.focus();
  }
  function pick(d: Date) {
    if (out(d)) return;
    const iso = toIso(d);
    committed.current = iso;
    setText(iso);
    setProblem("");
    onChange(iso);
    close();
  }

  // 칸 아래(모자라면 위)에 띄우기
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const h = pop.current?.offsetHeight ?? 400;
    const w = Math.min(340, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
    const below = window.innerHeight - r.bottom >= h + 8 || r.top < h + 8;
    setPos({ left, width: w, top: below ? r.bottom + 6 : r.top - h - 6 });
  }, [open]);

  // 바깥 누르기·화면 굴리기·창 크기 바꾸기 → 닫기. 열면 고른(또는 오늘) 칸에 포커스
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (t instanceof Element && t.closest('[role="listbox"]')) return; // 연·월 Select 목록 (body 에 뜬다)
      if (!pop.current?.contains(t) && !box.current?.contains(t)) close(false);
    };
    const onResize = () => close(false);
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (t instanceof Element && t.closest('[role="listbox"]')) return;
      if (!pop.current?.contains(t)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // 열 때·달력 안에서 키로 옮길 때만 날짜 칸에 포커스 (연도·월 목록을 바꿀 때는 그 자리에 둔다)
  useEffect(() => {
    if (!open) return;
    if (gridNav.current) pop.current?.querySelector<HTMLButtonElement>(`[data-iso="${toIso(focus)}"]`)?.focus();
    gridNav.current = false;
  }, [open, focus]);

  function onGridKey(e: KeyboardEvent) {
    const move: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -focus.getDay()),
      End: () => addDays(focus, 6 - focus.getDay()),
    };
    if (move[e.key]) {
      e.preventDefault();
      gridNav.current = true;
      setFocus(clamp(move[e.key]()));
    }
  }

  const y = focus.getFullYear();
  const m = focus.getMonth();
  const first = new Date(y, m, 1);
  const start = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35].getMonth() === m ? 6 : 5;
  const prevOk = !minD || new Date(y, m, 0) >= minD;
  const nextOk = !maxD || new Date(y, m + 1, 1) <= maxD;
  const todayIso = toIso(today);

  const setYM = (ny: number, nm: number) => {
    const last = new Date(ny, nm + 1, 0).getDate();
    setFocus(clamp(new Date(ny, nm, Math.min(focus.getDate(), last))));
  };

  return (
    <>
      <span ref={box} className={[s.field, open && s.open, className].filter(Boolean).join(" ")}>
        <input
          ref={input}
          id={id}
          className={s.input}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          maxLength={10}
          value={text}
          onChange={(e) => onType(e.target.value)}
          aria-label={aria["aria-label"]}
          aria-invalid={aria["aria-invalid"] || !!problem || undefined}
          aria-describedby={[problem ? msgId : "", aria["aria-describedby"] ?? ""].filter(Boolean).join(" ") || undefined}
          onKeyDown={(e) => {
            if (!open && e.key === "ArrowDown") {
              e.preventDefault();
              show();
            }
          }}
        />
        {selected && <span className={s.dow} aria-hidden="true">({WEEK[selected.getDay()]})</span>}
        <button
          ref={trigger}
          type="button"
          className={s.cal}
          aria-label="달력 열기"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? close() : show())}
        >
          <Ico name="calendar" sm />
        </button>
      </span>
      {problem && (
        <span id={msgId} className={s.problem} role="alert">
          {problem}
        </span>
      )}
      {open &&
        createPortal(
          <div
            ref={pop}
            className={s.pop}
            style={pos}
            role="dialog"
            aria-label={`${aria["aria-label"] ?? "날짜"} 고르기`}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className={s.head}>
              <button type="button" className={s.nav} aria-label="이전 달" disabled={!prevOk} onClick={() => setYM(y, m - 1)}>
                <Ico name="left" sm />
              </button>
              <Select
                size="sm"
                className={`${s.ym} ${s.ymYear}`}
                aria-label="연도"
                value={String(y)}
                options={Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map((yy) => ({ value: String(yy), label: `${yy}년` }))}
                onChange={(v) => setYM(Number(v), m)}
              />
              <Select
                size="sm"
                className={s.ym}
                aria-label="월"
                value={String(m)}
                options={Array.from({ length: 12 }, (_, i) => i).map((mm) => ({
                  value: String(mm),
                  label: `${mm + 1}월`,
                  disabled: Boolean((minD && new Date(y, mm + 1, 0) < minD) || (maxD && new Date(y, mm, 1) > maxD)),
                }))}
                onChange={(v) => setYM(y, Number(v))}
              />
              <button type="button" className={s.nav} aria-label="다음 달" disabled={!nextOk} onClick={() => setYM(y, m + 1)}>
                <Ico name="right" sm />
              </button>
            </div>
            <table className={s.grid} role="grid" id={gridId} aria-label={`${y}년 ${m + 1}월`} onKeyDown={onGridKey}>
              <thead>
                <tr>
                  {WEEK.map((w, i) => (
                    <th key={w} scope="col" className={i === 0 ? s.sun : i === 6 ? s.sat : undefined}>
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: weeks }, (_, w) => (
                  <tr key={w}>
                    {days.slice(w * 7, w * 7 + 7).map((d) => {
                      const iso = toIso(d);
                      const isFocus = iso === toIso(focus);
                      const cls = [
                        s.day,
                        d.getMonth() !== m && s.other,
                        iso === value && s.selected,
                        iso === todayIso && s.today,
                        d.getDay() === 0 && s.sun,
                        d.getDay() === 6 && s.sat,
                      ];
                      return (
                        <td key={iso}>
                          <button
                            type="button"
                            className={cls.filter(Boolean).join(" ")}
                            data-iso={iso}
                            tabIndex={isFocus ? 0 : -1}
                            disabled={out(d)}
                            aria-pressed={iso === value}
                            aria-label={formatKo(iso)}
                            aria-current={iso === todayIso ? "date" : undefined}
                            onClick={() => pick(d)}
                          >
                            {d.getDate()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={s.foot}>
              {!out(today) && (
                <button type="button" className={s.link} onClick={() => setFocus(today)}>
                  오늘로
                </button>
              )}
              <button type="button" className={s.link} onClick={() => close()}>
                닫기
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
