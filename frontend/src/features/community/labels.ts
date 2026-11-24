/** 커뮤니티 화면 말 (목업 v4 community*.html) */
import type { FreePostCategory, FreePostSummary } from "../../shared/api/types";

export const CATEGORIES: { value: FreePostCategory; label: string }[] = [
  { value: "FREE", label: "자유" },
  { value: "QUESTION", label: "질문" },
  { value: "INFO", label: "정보" },
  { value: "NEWS", label: "공연 소식" },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<FreePostCategory, string>;

export const TITLE_MAX = 100;
export const BODY_MAX = 5000;
export const PHOTO_MAX = 5;

/** "업체 D · 업체" (AC-F4-14) / 사용자는 닉네임 */
export const authorLabel = (a: FreePostSummary["author"]) => (a.kind === "SUPPLIER" ? `${a.name} · 업체` : a.name);

/** 오늘 글은 "14:20", 아니면 "11.16" */
export function shortDate(iso: string, today: Date): string {
  const d = new Date(iso);
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return sameDay
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** "11월 16일 14:20" */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 방문자가 누르면 로그인 화면으로 (AC-F4-12) */
export const loginPath = (back: string) => `/login?next=${encodeURIComponent(back)}`;
