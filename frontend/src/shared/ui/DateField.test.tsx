import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DateField, formatKo, parseIso, yearsFromNow } from "./DateField";

function Harness(props: { min?: string; max?: string; initial?: string; initialMonth?: string }) {
  const [v, setV] = useState(props.initial ?? "");
  return (
    <>
      <DateField aria-label="공연 날짜" value={v} onChange={setV} min={props.min} max={props.max} initialMonth={props.initialMonth} />
      <output data-testid="v">{v}</output>
    </>
  );
}

describe("DateField", () => {
  it("네 자리 연도·있는 날짜만 받는다", () => {
    expect(parseIso("2026-12-20")?.getDate()).toBe(20);
    expect(parseIso("202612-12-20")).toBeNull();
    expect(parseIso("2026-02-30")).toBeNull();
    expect(formatKo("2026-12-20")).toBe("2026년 12월 20일 (일)");
    expect(yearsFromNow(2, new Date(2026, 10, 20))).toBe("2028-11-20");
  });

  it("칸을 누르면 달력이 열리고, 날짜를 누르면 값이 바뀌고 닫힌다", () => {
    render(<Harness initial="2026-12-01" />);
    fireEvent.click(screen.getByRole("button", { name: /공연 날짜/ }));
    expect(screen.getByRole("dialog", { name: "공연 날짜 고르기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2026년 12월 20일 (일)" }));
    expect(screen.getByTestId("v").textContent).toBe("2026-12-20");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /공연 날짜/ }).textContent).toContain("2026년 12월 20일 (일)");
  });

  it("연도 목록은 min~max 안의 네 자리 연도만, 연도를 바꾸면 그 해 달력이 보인다", () => {
    render(<Harness min="1926-11-20" max="2026-11-20" initialMonth="2001-11-20" />);
    fireEvent.click(screen.getByRole("button", { name: /공연 날짜/ }));
    const year = screen.getByRole("combobox", { name: "연도" }) as HTMLSelectElement;
    const years = Array.from(year.options).map((o) => Number(o.value));
    expect(Math.max(...years)).toBe(2026);
    expect(Math.min(...years)).toBe(1926);
    expect(year.value).toBe("2001");
    fireEvent.change(year, { target: { value: "1995" } });
    fireEvent.click(screen.getByRole("button", { name: /^1995년 11월 3일/ }));
    expect(screen.getByTestId("v").textContent).toBe("1995-11-03");
  });

  it("min 이전·max 이후 날짜는 고를 수 없다", () => {
    render(<Harness min="2026-12-10" max="2027-12-31" initial="2026-12-15" />);
    fireEvent.click(screen.getByRole("button", { name: /공연 날짜/ }));
    const before = screen.getByRole("button", { name: "2026년 12월 9일 (수)" }) as HTMLButtonElement;
    expect(before.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "이전 달" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("키보드: → 하루 뒤, Enter 로 고르기, Esc 닫기", () => {
    render(<Harness initial="2026-12-20" />);
    fireEvent.click(screen.getByRole("button", { name: /공연 날짜/ }));
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-iso")).toBe("2026-12-21");
    fireEvent.keyDown(grid, { key: "PageDown" });
    expect(document.activeElement?.getAttribute("data-iso")).toBe("2027-01-21");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("v").textContent).toBe("2026-12-20");
  });
});
