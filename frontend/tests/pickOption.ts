import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** 공통 Select(고르기 칸)에서 항목 하나 고르기 — 칸을 누르면 목록이 열리고, 항목을 누르면 고른다 (디자인 검수 11/23: 기본 select 를 모두 Select 로) */
export async function pickOption(combo: HTMLElement, name: string | RegExp) {
  await userEvent.click(combo);
  await userEvent.click(screen.getAllByRole("option", { name })[0]);
}

/** 공통 Select 의 항목 이름들 (목록을 열어 읽고 다시 닫는다) */
export async function optionNames(combo: HTMLElement): Promise<string[]> {
  await userEvent.click(combo);
  const names = screen.getAllByRole("option").map((o) => o.textContent ?? "");
  await userEvent.click(combo);
  return names;
}
