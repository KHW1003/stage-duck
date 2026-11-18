/**
 * 공간 예시 (docs/guides/시연_예시값.md · mockup-v4 spaces.html · space.html 그대로).
 * 공개 공간 조회 API(1번 묶음 GET /venues, /venues/:id)가 생기면 useVenues·useVenue 가 이 값 대신 서버 값을 읽는다.
 */

export type VenueType = "전문 공연장" | "복합문화공간" | "루프탑" | "정원" | "창고";
export const VENUE_TYPES: VenueType[] = ["전문 공연장", "복합문화공간", "루프탑", "정원", "창고"];
export const CONDITIONS = ["밴드 공연 가능", "외부 음향 장비 반입", "외부 엔지니어 허용", "대기실", "주차"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const REGIONS = ["광주", "전남", "서울", "부산", "전체"] as const;

export interface VenueSample {
  id: number;
  name: string;
  sido: string;
  sigungu: string;
  type: VenueType;
  company: string;
  companyDeals: number;
  capacity: number;
  capacitySeated: number;
  checkin: string;
  checkout: string;
  setupFrom: string;
  price: number;
  priceNote: string;
  fullSpec: boolean;
  specs: string[];
  conditions: Condition[];
  photos: string[];
  registered: boolean;
  loadIn: string;
  externalEngineer: string;
  power: string;
  facilities: string;
  gear: { kind: string; desc: string; qty: number }[];
  intro: string;
  createdAt: string;
}

const P = (id: string) => `/photos/photo-${id}.jpg`;

export const VENUES: VenueSample[] = [
  {
    id: 2,
    name: "공간 B",
    sido: "광주",
    sigungu: "서구",
    type: "루프탑",
    company: "업체 B",
    companyDeals: 4,
    capacity: 100,
    capacitySeated: 50,
    checkin: "17:00",
    checkout: "22:00",
    setupFrom: "17:00",
    price: 400000,
    priceNote: "대관료 · 부가세 포함",
    fullSpec: false,
    specs: ["최대 100명", "17:00 입실", "밴드 공연 가능"],
    conditions: ["밴드 공연 가능", "외부 음향 장비 반입", "외부 엔지니어 허용"],
    photos: [P("1506157786151-b8491531f063"), P("1470225620780-dba8ba36b745"), P("1501612780327-45045538702b")],
    registered: false,
    loadIn: "가능 · 계단 2층",
    externalEngineer: "허용",
    power: "무대 콘센트 2구",
    facilities: "야외 무대",
    gear: [],
    intro: "루프탑 공간이에요. 대관만 하고 장비·엔지니어는 따로 구해야 해요.",
    createdAt: "2026-11-02",
  },
  {
    id: 3,
    name: "공간 C",
    sido: "광주",
    sigungu: "동구",
    type: "복합문화공간",
    company: "업체 C",
    companyDeals: 12,
    capacity: 120,
    capacitySeated: 60,
    checkin: "15:00",
    checkout: "22:00",
    setupFrom: "15:00",
    price: 500000,
    priceNote: "대관료 · 부가세 포함",
    fullSpec: false,
    specs: ["최대 120명", "15:00 입실", "기본 마이크 2"],
    conditions: ["밴드 공연 가능", "외부 음향 장비 반입", "외부 엔지니어 허용", "대기실"],
    photos: [
      P("1524368535928-5b5e00ddc76b"),
      P("1501386761578-eac5c94b800a"),
      P("1514525253161-7a46d19cd819"),
      P("1459749411175-04bf5292ceea"),
      P("1540039155733-5bb30b53aa14"),
    ],
    registered: true,
    loadIn: "가능 · 뒷문 화물 엘리베이터",
    externalEngineer: "허용",
    power: "무대 콘센트 4구 · 단상 220V",
    facilities: "대기실 1 · 무대 단상",
    gear: [
      { kind: "마이크", desc: "유선 보컬 마이크", qty: 2 },
      { kind: "스피커", desc: "메인 스피커 (소형)", qty: 2 },
      { kind: "인력", desc: "현장 관리자 (음향 운영 아님)", qty: 1 },
    ],
    intro: "1층 복합문화공간이에요. 무대 앞 스탠딩 80명, 좌석 배치 시 60명까지 들어가요. 장비 반입은 뒷문 엘리베이터를 써요.",
    createdAt: "2026-11-05",
  },
  {
    id: 1,
    name: "공간 A",
    sido: "광주",
    sigungu: "북구",
    type: "전문 공연장",
    company: "업체 A",
    companyDeals: 21,
    capacity: 150,
    capacitySeated: 120,
    checkin: "13:00",
    checkout: "23:00",
    setupFrom: "13:00",
    price: 4000000,
    priceNote: "공간·장비·엔지니어",
    fullSpec: true,
    specs: ["최대 150명", "13:00 입실", "장비·엔지니어 포함"],
    conditions: ["밴드 공연 가능", "대기실", "주차"],
    photos: [P("1470229722913-7c0e2dbbafd3"), P("1516450360452-9312f5e86fc7"), P("1563841930606-67e2bce48b78")],
    registered: true,
    loadIn: "자체 장비 사용",
    externalEngineer: "자체 엔지니어",
    power: "무대 전원 3상",
    facilities: "대기실 2 · 주차 10대",
    gear: [
      { kind: "음향", desc: "라인 어레이 스피커 · 32채널 믹서", qty: 1 },
      { kind: "조명", desc: "무빙 라이트", qty: 8 },
      { kind: "인력", desc: "음향 엔지니어", qty: 1 },
    ],
    intro: "장비·엔지니어가 포함된 전문 공연장이에요. 공연장 단계에서 컨펌하면 장비·엔지니어 단계가 필요 없어요.",
    createdAt: "2026-10-28",
  },
];

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function findVenue(id: number): VenueSample | undefined {
  return VENUES.find((v) => v.id === id);
}
