/**
 * 공간 탐색 API (api-contract.md GET /venues · /venues/{id}, FR-SPACE-03 · AC-F5-01, 1번 묶음 #28).
 * 누구나 본다. 조건 칸의 null 은 "미확인" (업체가 아직 적지 않음). 업체 연락처는 없다 (결제 뒤 담당표에서만).
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";

export type VenueTypeCode = "CONCERT_HALL" | "CULTURE_SPACE" | "ROOFTOP" | "GARDEN" | "WAREHOUSE" | "ETC";

export interface VenueListItem {
  id: number;
  name: string;
  companyName: string;
  sido: string;
  sigungu: string;
  venueType: VenueTypeCode;
  maxCapacity: number;
  rentalFee: number;
  hasResidentEngineer: boolean;
  bandAllowed: boolean | null;
  checkinTime: string;
  externalEquipmentAllowed: boolean | null;
  externalEngineerAllowed: boolean | null;
  hasWaitingRoom: boolean | null;
  hasParking: boolean | null;
}

export interface VenuePage {
  items: VenueListItem[];
  page: number;
  size: number;
  total: number;
}

export interface VenueDetail extends Omit<VenueListItem, "companyName"> {
  companyName: string;
  supplierId: number;
  address: string;
  checkoutTime: string;
  hasStagePlatform: boolean | null;
  hallRegistered: boolean | null;
  status: string;
  equipment: { category: string; name: string; quantity: number }[];
}

export type VenueSortParam = "fee" | "capacity" | "latest" | "views"; // views: 조회수 많은 순 (11/25, 메인 공간 예시)

export interface VenueQuery {
  sido?: string;
  minCapacity?: number;
  bandAllowed?: boolean;
  sort: VenueSortParam;
  size?: number;
}

export function venueQueryString(q: VenueQuery): string {
  const p = new URLSearchParams();
  if (q.sido) p.set("sido", q.sido);
  if (q.minCapacity) p.set("minCapacity", String(q.minCapacity));
  if (q.bandAllowed) p.set("bandAllowed", "true");
  p.set("sort", q.sort);
  p.set("size", String(q.size ?? 50));
  return p.toString();
}

export function useVenues(q: VenueQuery) {
  const qs = venueQueryString(q);
  return useQuery({ queryKey: ["venues", qs], queryFn: () => api<VenuePage>(`/venues?${qs}`) });
}

export function useVenue(id: number) {
  return useQuery({
    queryKey: ["venues", "detail", id],
    queryFn: () => api<VenueDetail>(`/venues/${id}`),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });
}
