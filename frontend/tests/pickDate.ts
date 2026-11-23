import { fireEvent, screen } from "@testing-library/react";

/** DateField(공용 날짜 칸)에서 날짜 하나 고르기 — 칸 열기 → 연도·월 → 날짜 */
export function pickDate(field: HTMLElement, iso: string) {
  const [y, m] = iso.split("-").map(Number);
  fireEvent.click(field.parentElement!.querySelector<HTMLButtonElement>('button[aria-label="달력 열기"]')!);
  // 연·월은 공통 Select (칸을 누르면 목록이 열리고 항목을 누르면 고른다)
  fireEvent.click(screen.getByRole("combobox", { name: "연도" }));
  fireEvent.click(screen.getByRole("option", { name: `${y}년` }));
  fireEvent.click(screen.getByRole("combobox", { name: "월" }));
  fireEvent.click(screen.getByRole("option", { name: `${m}월` }));
  const day = document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
  if (!day || day.disabled) throw new Error(`${iso} 는 고를 수 없는 날짜예요`);
  fireEvent.click(day);
}
