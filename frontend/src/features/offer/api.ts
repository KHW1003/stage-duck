import type { Duck } from "../../shared/ui/duck";
/**
 * 견적 요청(직접 오퍼)·관심 업체 API (api-contract.md 4.4, 이슈 #32, AC-F3-16~19).
 * 화면 문구는 "견적 요청" (11/19 팀 결정), 주소·코드는 명세대로 offer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { StageType } from "../../shared/api/types";

export type OfferStatus = "PENDING" | "QUOTED" | "DECLINED" | "EXPIRED";
export type DeclineReason = "SCHEDULE" | "CAPACITY" | "REGION" | "BUDGET" | "ETC";

export interface OfferOut {
  offerId: number;
  supplierId: number;
  companyName: string;
  status: OfferStatus;
  declineReason: DeclineReason | null;
  expiresAt: string;
  createdAt: string;
}

export interface StageOffers {
  activeCount: number;
  limit: number;
  items: OfferOut[];
}

export interface ReceivedOffer {
  offerId: number;
  stageId: number;
  stageType: StageType;
  stageOpen: boolean;
  performanceId: number;
  title: string;
  showDate: string;
  sido: string;
  sigungu: string;
  audience: number;
  nickname: string;
  message: string | null;
  status: OfferStatus;
  declineReason: DeclineReason | null;
  expiresAt: string;
  createdAt: string;
}

export interface Favorite {
  supplierId: number;
  companyName: string;
  categories: string[];
  stageTypes: StageType[];
  /** 업체 대표 이미지 (11/25) */
  imageUrl?: string | null;
  duck?: Duck | null;
}

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  PENDING: "답변 기다리는 중",
  QUOTED: "견적서 받음",
  DECLINED: "거절됨",
  EXPIRED: "기한 지남",
};

export const DECLINE_LABEL: Record<DeclineReason, string> = {
  SCHEDULE: "일정이 맞지 않아요",
  CAPACITY: "규모가 맞지 않아요",
  REGION: "지역이 맞지 않아요",
  BUDGET: "예산이 맞지 않아요",
  ETC: "기타",
};

/** 업체 부문 → 요청할 수 있는 단계 (backend request/service.py CATEGORY_STAGE) */
export const CATEGORY_STAGE: Record<string, StageType> = { VENUE: "VENUE", EQUIPMENT: "EQUIPMENT", INSTALL: "EQUIPMENT", ENGINEER: "ENGINEER" };

const FAVORITES_KEY = ["favorites"] as const;
const stageOffersKey = (stageId: number) => ["stage-offers", stageId] as const;
const RECEIVED_KEY = ["supplier-offers"] as const;

export function useStageOffers(stageId: number | null) {
  return useQuery({
    queryKey: stageOffersKey(stageId ?? 0),
    queryFn: () => api<StageOffers>(`/stages/${stageId}/offers`),
    enabled: !!stageId,
  });
}

export function useSendOffer(stageId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { supplierId: number; message?: string }) =>
      api<OfferOut>(`/stages/${stageId}/offers`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: stageOffersKey(stageId) }),
  });
}

export function useFavorites(enabled: boolean) {
  return useQuery({ queryKey: FAVORITES_KEY, queryFn: () => api<Favorite[]>("/favorites"), enabled });
}

/** 관심 업체 저장·빼기. 누르자마자 화면을 바꾸고, 실패하면 되돌린다 */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, save }: { supplierId: number; save: boolean }) =>
      save
        ? api<void>("/favorites", { method: "POST", body: JSON.stringify({ supplierId }) })
        : api<void>(`/favorites/${supplierId}`, { method: "DELETE" }),
    meta: { errorToast: true },
    onSettled: () => void qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });
}

export function useReceivedOffers() {
  return useQuery({ queryKey: RECEIVED_KEY, queryFn: () => api<ReceivedOffer[]>("/supplier/offers") });
}

export function useDeclineOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, reason }: { offerId: number; reason: DeclineReason }) =>
      api<void>(`/offers/${offerId}/decline`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: RECEIVED_KEY }),
  });
}
