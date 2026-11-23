/** 공간 화면 말·사진 (서버 값 → 화면). 사진 칸은 공간 모델에 아직 없어 공간 유형별 기본 사진을 쓴다 (목업 README "기본 사진") */
import type { VenueListItem, VenueTypeCode } from "./api";

export const TYPE_LABEL: Record<VenueTypeCode, string> = {
  CONCERT_HALL: "전문 공연장",
  CULTURE_SPACE: "복합문화공간",
  ROOFTOP: "루프탑",
  GARDEN: "정원",
  WAREHOUSE: "창고",
  ETC: "기타",
};

/** 공간 찾기 타일·체크 칸에 보이는 유형 (기타는 타일 없음, 목업과 같게) */
export const TILE_TYPES: VenueTypeCode[] = ["CONCERT_HALL", "CULTURE_SPACE", "ROOFTOP", "GARDEN", "WAREHOUSE"];

/** 지역 고르기 (화면 이름 → 서버 시·도 이름). 전체 = 지역 조건 없음.
 * 어디서나 전체 → 서울 → 시·도 표준 순서(request/codes.ts SIDO 와 같은 차례), 17개 시·도 모두 — 11/19 피드백 */
export const REGIONS: { label: string; sido: string | null }[] = [
  { label: "전체", sido: null },
  { label: "서울", sido: "서울특별시" },
  { label: "부산", sido: "부산광역시" },
  { label: "대구", sido: "대구광역시" },
  { label: "인천", sido: "인천광역시" },
  { label: "광주", sido: "광주광역시" },
  { label: "대전", sido: "대전광역시" },
  { label: "울산", sido: "울산광역시" },
  { label: "세종", sido: "세종특별자치시" },
  { label: "경기", sido: "경기도" },
  { label: "강원", sido: "강원특별자치도" },
  { label: "충북", sido: "충청북도" },
  { label: "충남", sido: "충청남도" },
  { label: "전북", sido: "전북특별자치도" },
  { label: "전남", sido: "전라남도" },
  { label: "경북", sido: "경상북도" },
  { label: "경남", sido: "경상남도" },
  { label: "제주", sido: "제주특별자치도" },
];

/** "광주광역시" → "광주" (카드 메타 줄) */
export function shortSido(sido: string): string {
  return REGIONS.find((r) => r.sido === sido)?.label ?? sido.replace(/(특별|광역)?시$|특별자치도$|도$/, "");
}

const P = (id: string) => `/photos/photo-${id}.jpg`;
const PHOTOS: Record<VenueTypeCode, string[]> = {
  CONCERT_HALL: [P("1470229722913-7c0e2dbbafd3"), P("1516450360452-9312f5e86fc7"), P("1563841930606-67e2bce48b78")],
  CULTURE_SPACE: [P("1524368535928-5b5e00ddc76b"), P("1501386761578-eac5c94b800a"), P("1514525253161-7a46d19cd819"), P("1459749411175-04bf5292ceea"), P("1540039155733-5bb30b53aa14")],
  ROOFTOP: [P("1506157786151-b8491531f063"), P("1470225620780-dba8ba36b745"), P("1501612780327-45045538702b")],
  GARDEN: [P("1506157786151-b8491531f063"), P("1470225620780-dba8ba36b745")],
  WAREHOUSE: [P("1519892300165-cb5542fb47c7"), P("1511671782779-c97d3d27a1d4")],
  ETC: [P("1429962714451-bb934ecdc4ec"), P("1415201364774-f6f0bb35f28f")],
};

/** 공간 사진 (기본 사진을 공간마다 다른 순서로) */
export function venuePhotos(v: { id: number; venueType: VenueTypeCode }): string[] {
  const list = PHOTOS[v.venueType] ?? PHOTOS.ETC;
  const k = v.id % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

export const hm = (t: string) => t.slice(0, 5);
export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 카드 작은 정보 3개: "최대 120명 | 15:00 입실 | 밴드 공연 가능" */
export function cardSpecs(v: VenueListItem): string[] {
  const third = v.hasResidentEngineer ? "장비·엔지니어 포함" : v.bandAllowed ? "밴드 공연 가능" : v.externalEquipmentAllowed ? "외부 장비 반입" : "대관만";
  return [`최대 ${v.maxCapacity}명`, `${hm(v.checkinTime)} 입실`, third];
}

/** null = 미확인 */
export function yesNo(v: boolean | null, yes = "가능", no = "불가"): string {
  return v === null ? "미확인" : v ? yes : no;
}
