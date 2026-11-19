/** 프로필 화면 문구 (#33). */
import type { SupplierCategory } from "../../shared/api/types";

const CATEGORY_LABEL: Record<SupplierCategory, string> = {
  VENUE: "공연장",
  EQUIPMENT: "음향 장비",
  INSTALL: "설치",
  ENGINEER: "엔지니어",
};

/** 승인 부문 → "음향 장비·설치, 엔지니어" (목업 supplier.html: 장비와 설치는 붙여 쓴다) */
export function categoriesLabel(categories: SupplierCategory[]): string {
  const words = categories.map((c) => CATEGORY_LABEL[c]);
  const merged = categories.includes("EQUIPMENT") && categories.includes("INSTALL")
    ? words.filter((w) => w !== "설치").map((w) => (w === "음향 장비" ? "음향 장비·설치" : w))
    : words;
  return merged.join(", ");
}

/** "2026-09-02T10:00:00" → "2026년 9월" (서버 시각 그대로, KST) */
export function yearMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-");
  return `${y}년 ${Number(m)}월`;
}

/** 닉네임 첫 글자 (사진이 없을 때 네모 안에) */
export function initialOf(name: string | null): string {
  return (name ?? "").replace(/^업체\s*/, "").slice(0, 1) || "?";
}
