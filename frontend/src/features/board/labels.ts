/** 업체 찾기 화면 문구 (문구.md 7장: 화면에는 "업체 찾기"·"소개 글"). */
import type { PrCategory } from "../../shared/api/types";

export const PR_CATEGORIES: { value: PrCategory; label: string }[] = [
  { value: "VENUE", label: "[공연장]" },
  { value: "EQUIPMENT", label: "[장비]" },
  { value: "ENGINEER", label: "[엔지니어]" },
];

export const PR_CATEGORY_LABEL: Record<PrCategory, string> = {
  VENUE: "[공연장]",
  EQUIPMENT: "[장비]",
  ENGINEER: "[엔지니어]",
};

/** 업체 계정 부문 중 소개 글 말머리가 되는 것 (설치 INSTALL 은 말머리가 없다, data-model.md pr_posts) */
export function isPrCategory(c: string): c is PrCategory {
  return c === "VENUE" || c === "EQUIPMENT" || c === "ENGINEER";
}

/** "2026-11-10T09:00:00" → "11월 10일" (서버 시각 그대로, KST) */
export function monthDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

export const PHOTO_MAX = 10;
