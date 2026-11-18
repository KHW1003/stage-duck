/** 공간 찾기 조건 → 결과 (화면 안 계산. 공개 공간 API 가 생기면 같은 조건을 쿼리로 보낸다) */
import { VENUE_TYPES, type Condition, type VenueSample, type VenueType } from "./samples";

export type Sort = "price" | "capacity" | "recent";
export const SORTS: { key: Sort; label: string }[] = [
  { key: "price", label: "대관료 낮은 순" },
  { key: "capacity", label: "수용 인원 순" },
  { key: "recent", label: "최근 등록 순" },
];

export interface Cond {
  region: string;
  audience: string;
  types: VenueType[];
  conditions: Condition[];
  date: string;
}

export const DEFAULT_COND: Cond = { region: "광주", audience: "", types: ["전문 공연장", "복합문화공간", "루프탑"], conditions: [], date: "" };

/** 메인 화면 공간 찾기(?sido=&type=&audience=)를 조건으로 바꾼다 */
export function condFromQuery(q: URLSearchParams): Cond {
  const c: Cond = { ...DEFAULT_COND, types: [...DEFAULT_COND.types] };
  const sido = q.get("sido");
  if (sido) c.region = sido;
  const type = q.get("type");
  if (type) {
    const t = type === "야외·루프탑" ? "루프탑" : type;
    if ((VENUE_TYPES as string[]).includes(t)) c.types = [t as VenueType];
  }
  const aud = q.get("audience");
  if (aud === "50~150명") c.audience = "50";
  else if (aud === "150명 이상") c.audience = "150";
  return c;
}

export function filterVenues(list: VenueSample[], c: Cond, tile: VenueType | null, sort: Sort): VenueSample[] {
  const min = Number(c.audience) || 0;
  const out = list.filter(
    (v) =>
      (c.region === "전체" || v.sido === c.region) &&
      v.capacity >= min &&
      c.types.includes(v.type) &&
      (tile === null || v.type === tile) &&
      c.conditions.every((k) => v.conditions.includes(k)),
  );
  const by: Record<Sort, (a: VenueSample, b: VenueSample) => number> = {
    price: (a, b) => a.price - b.price,
    capacity: (a, b) => b.capacity - a.capacity,
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  return out.sort(by[sort]);
}

/** "광주 · 80명 이상 · 밴드 공연 가능" */
export function condSummary(c: Cond, tile: VenueType | null): string {
  const parts = [c.region === "전체" ? "전국" : c.region];
  if (Number(c.audience) > 0) parts.push(`${Number(c.audience)}명 이상`);
  if (tile) parts.push(tile);
  parts.push(...c.conditions);
  return parts.join(" · ");
}
