import { fireEvent, screen } from "@testing-library/react";

/** DateField(공용 날짜 칸)에서 날짜 하나 고르기 — 칸 열기 → 연도·월 → 날짜 */
export function pickDate(field: HTMLElement, iso: string) {
  const [y, m] = iso.split("-").map(Number);
  fireEvent.click(field.parentElement!.querySelector<HTMLButtonElement>('button[aria-label="달력 열기"]')!);
  fireEvent.change(screen.getByRole("combobox", { name: "연도" }), { target: { value: String(y) } });
  fireEvent.change(screen.getByRole("combobox", { name: "월" }), { target: { value: String(m - 1) } });
  const day = document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
  if (!day || day.disabled) throw new Error(`${iso} 는 고를 수 없는 날짜예요`);
  fireEvent.click(day);
}
