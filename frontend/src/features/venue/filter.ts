/**
 * 공간 찾기 조건 (목업 spaces.html 조건표). 서버(GET /venues)가 거르는 것: 지역·관객 수·밴드 공연 가능·정렬.
 * 서버가 한 가지만 받는 것(공간 유형 여러 개)과 나머지 조건(외부 장비·외부 엔지니어·대기실·주차)은 받은 목록에서 거른다.
 */
import type { VenueListItem, VenueQuery, VenueSortParam, VenueTypeCode } from "./api";
import { REGIONS, TYPE_LABEL } from "./view";

export type Sort = "price" | "capacity" | "recent";
export const SORTS: { key: Sort; label: string; param: VenueSortParam }[] = [
  { key: "price", label: "대관료 낮은 순", param: "fee" },
  { key: "capacity", label: "수용 인원 순", param: "capacity" },
  { key: "recent", label: "최근 등록 순", param: "latest" },
];

export const CONDITIONS = ["밴드 공연 가능", "외부 음향 장비 반입", "외부 엔지니어 허용", "대기실", "주차"] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface Cond {
  region: string; // REGIONS 의 label
  audience: string;
  types: VenueTypeCode[];
  conditions: Condition[];
  date: string;
}

export const DEFAULT_COND: Cond = { region: "광주", audience: "", types: ["CONCERT_HALL", "CULTURE_SPACE", "ROOFTOP"], conditions: [], date: "" };

const TYPE_FROM_HOME: Record<string, VenueTypeCode> = { "전문 공연장": "CONCERT_HALL", 복합문화공간: "CULTURE_SPACE", "야외·루프탑": "ROOFTOP" };

/** 메인 화면 공간 찾기(?sido=&type=&audience=)를 조건으로 바꾼다 */
export function condFromQuery(q: URLSearchParams): Cond {
  const c: Cond = { ...DEFAULT_COND, types: [...DEFAULT_COND.types] };
  const sido = q.get("sido");
  if (sido && REGIONS.some((r) => r.label === sido)) c.region = sido;
  const type = q.get("type");
  if (type && TYPE_FROM_HOME[type]) c.types = [TYPE_FROM_HOME[type]];
  const aud = q.get("audience");
  if (aud === "50~150명") c.audience = "50";
  else if (aud === "150명 이상") c.audience = "150";
  return c;
}

/** 서버에 보낼 조건 */
export function toQuery(c: Cond, sort: Sort): VenueQuery {
  return {
    sido: REGIONS.find((r) => r.label === c.region)?.sido ?? undefined,
    minCapacity: Number(c.audience) || undefined,
    bandAllowed: c.conditions.includes("밴드 공연 가능") || undefined,
    sort: SORTS.find((s) => s.key === sort)!.param,
  };
}

const HAS: Record<Condition, (v: VenueListItem) => boolean> = {
  "밴드 공연 가능": (v) => v.bandAllowed === true,
  "외부 음향 장비 반입": (v) => v.externalEquipmentAllowed === true,
  "외부 엔지니어 허용": (v) => v.externalEngineerAllowed === true,
  대기실: (v) => v.hasWaitingRoom === true,
  주차: (v) => v.hasParking === true,
};

/** 받은 목록에서 유형(여러 개)·타일·나머지 조건으로 거른다. 서버 정렬은 그대로 둔다 */
export function filterVenues(list: VenueListItem[], c: Cond, tile: VenueTypeCode | null): VenueListItem[] {
  return list.filter(
    (v) => c.types.includes(v.venueType) && (tile === null || v.venueType === tile) && c.conditions.every((k) => HAS[k](v)),
  );
}

/** "광주 · 80명 이상 · 밴드 공연 가능" */
export function condSummary(c: Cond, tile: VenueTypeCode | null): string {
  const parts = [c.region === "전체" ? "전국" : c.region];
  if (Number(c.audience) > 0) parts.push(`${Number(c.audience)}명 이상`);
  if (tile) parts.push(TYPE_LABEL[tile]);
  parts.push(...c.conditions);
  return parts.join(" · ");
}
