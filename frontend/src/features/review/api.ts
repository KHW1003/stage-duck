/** 공연 후기·평점 (specs/reviews.md). */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";

export type StageType = "VENUE" | "EQUIPMENT" | "ENGINEER";

export interface MyReview {
  id: number;
  rating: number;
  content: string;
  createdAt: string;
}
export interface StageReview {
  stageId: number;
  stageType: StageType;
  supplierId: number;
  companyName: string;
  review: MyReview | null;
}
export interface PerformanceReviews {
  canWrite: boolean;
  items: StageReview[];
}
export interface PublicReview {
  id: number;
  rating: number;
  content: string;
  nickname: string;
  stageType: StageType;
  showMonth: string;
  createdAt: string;
}
export interface SupplierReviews {
  average: number | null;
  count: number;
  distribution: Record<string, number>;
  items: PublicReview[];
  nextBefore: number | null;
}
export interface ReviewSummary {
  supplierId: number;
  average: number;
  count: number;
}

export const STAGE_LABEL: Record<StageType, string> = { VENUE: "공연장", EQUIPMENT: "장비", ENGINEER: "엔지니어" };

const perfKey = (id: number) => ["performance-reviews", id] as const;
const supplierKey = (id: number) => ["supplier-reviews", id] as const;

export function usePerformanceReviews(performanceId: number, enabled = true) {
  return useQuery({
    queryKey: perfKey(performanceId),
    queryFn: () => api<PerformanceReviews>(`/performances/${performanceId}/reviews`),
    enabled,
  });
}

export function useWriteReview(performanceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { stageId: number; rating: number; content: string }) =>
      api<MyReview>(`/performances/${performanceId}/reviews`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: perfKey(performanceId) });
      void qc.invalidateQueries({ queryKey: ["supplier-reviews"] });
      void qc.invalidateQueries({ queryKey: ["review-summaries"] });
    },
  });
}

export function useDeleteReview(performanceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: number) => api<void>(`/reviews/${reviewId}`, { method: "DELETE" }),
    meta: { errorToast: true },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: perfKey(performanceId) });
      void qc.invalidateQueries({ queryKey: ["supplier-reviews"] });
      void qc.invalidateQueries({ queryKey: ["review-summaries"] });
    },
  });
}

export function useSupplierReviews(supplierId: number) {
  return useInfiniteQuery({
    queryKey: supplierKey(supplierId),
    queryFn: ({ pageParam }) =>
      api<SupplierReviews>(`/suppliers/${supplierId}/reviews${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}

/** 목록 카드 별점: 업체 id 여러 개를 한 번에. 후기가 없는 업체는 Map 에 없다 */
export function useReviewSummaries(supplierIds: number[]) {
  const ids = [...new Set(supplierIds)].sort((a, b) => a - b);
  const q = useQuery({
    queryKey: ["review-summaries", ids.join(",")],
    queryFn: () => api<ReviewSummary[]>(`/review-summaries?ids=${ids.join(",")}`),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  return new Map((q.data ?? []).map((s) => [s.supplierId, s]));
}
