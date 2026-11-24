/**
 * 고르기 칸 (DESIGN.md 5장 "고르기 칸", 목업 v4 select.js · css/select.css). 브라우저 기본 펼친 목록 대신 쓴다.
 * - 칸은 button(role=combobox), 펼친 목록은 listbox. 포커스는 늘 칸에 두고 aria-activedescendant 로 지금 항목을 알린다.
 * - 마우스: 칸을 누르면 열고 닫는다. 항목을 누르면 고른다. 목록 바깥을 누르거나, 화면을 굴리거나, 창 크기를 바꾸면 닫는다.
 * - 키보드: 닫혀 있을 때 Enter·Space·↓·↑ → 열기. 열려 있을 때 ↑↓ 이동(꺼진 항목은 건너뜀), Enter·Space 고르기,
 *   Esc 닫기(바깥 창까지 닫히지 않게 Esc 를 넘기지 않는다), Tab 닫고 다음 칸으로.
 * - 목록은 body 에 띄워(position: fixed) 감싼 상자의 overflow 에 잘리지 않는다. 아래 자리가 모자라면 위로 연다.
 * Field 와 함께: <Field label="지역">{(p) => <Select {...p} value={v} options={o} onChange={setV} />}</Field>
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** 고른 값이 없을 때(value 가 options 에 없을 때) 칸에 보이는 안내 */
  placeholder?: string;
  disabled?: boolean;
  /** 주면 같은 이름의 hidden input 으로 form 에 값이 실린다 */
  name?: string;
  /** sm: 목록 위 정렬·필터처럼 작은 칸 (목업 .select--sm) */
  size?: "md" | "sm";
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  /** Field 없이 쓸 때 칸 이름 */
  "aria-label"?: string;
}

/** 목록과 칸 사이 틈, 화면 가장자리 여백 (목업 select.js 와 같은 값) */
const GAP = 6;
const EDGE = 8;

function nextEnabled(options: SelectOption[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) {
    if (!options[i].disabled) return i;
  }
  return from;
}

export function Select({
  id,
  value,
  options,
  onChange,
  placeholder = "골라 주세요",
  disabled,
  name,
  size = "md",
  className,
  ...aria
}: SelectProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<CSSProperties>({});

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setActive(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  function openList() {
    if (disabled) return;
    const start = selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : nextEnabled(options, -1, 1);
    setActive(start);
    setOpen(true);
  }

  function pick(i: number) {
    const option = options[i];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  }

  // 열릴 때 칸 아래(자리가 모자라면 위)에 목록을 둔다
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !listRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const h = listRef.current.offsetHeight;
    const w = listRef.current.offsetWidth;
    const below = window.innerHeight - r.bottom;
    const up = below < h + GAP * 2 && r.top > below;
    setPos({
      minWidth: r.width,
      left: Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE)),
      top: up ? r.top - h - GAP : r.bottom + GAP,
    });
  }, [open]);

  // 지금 항목이 목록 밖에 있으면 보이게 굴린다
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, baseId]);

  // 바깥을 누르거나, 바깥을 굴리거나, 창 크기가 바뀌면 닫는다 (목업 select.js 와 같다)
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (triggerRef.current?.contains(t) || listRef.current?.contains(t));
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!inside(e.target)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => nextEnabled(options, i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => nextEnabled(options, i, -1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); // 채팅 창·모달 같은 바깥 창이 같이 닫히지 않게
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  const triggerCls = [styles.trigger, size === "sm" ? styles.sm : "", open ? styles.open : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        className={triggerCls}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        aria-required={aria["aria-required"]}
        aria-label={aria["aria-label"]}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? styles.value : `${styles.value} ${styles.placeholder}`}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="down" size="sm" className={styles.chevron} />
      </button>
      {name !== undefined && <input type="hidden" name={name} value={value} />}
      {open &&
        createPortal(
          <ul ref={listRef} id={listId} role="listbox" className={styles.list} style={pos} tabIndex={-1}>
            {options.map((o, i) => {
              const cls = [styles.option, i === active ? styles.active : "", i === selectedIndex ? styles.selected : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  className={cls}
                  aria-selected={i === selectedIndex}
                  aria-disabled={o.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()} // 포커스를 칸에 둔다
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onClick={() => pick(i)}
                >
                  {o.label}
                  {i === selectedIndex && <Icon name="check" size="sm" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
