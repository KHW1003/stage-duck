/** 통합 청구서·테스트 결제 API (#50·#51). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../shared/api/client";
import type { CancelQuote, Order, PaymentResult, Sheet, StageType } from "../../shared/api/types";

/** 지금 취소하면 내는 금액 미리보기 (#52) */
export function useCancelQuote(performanceId: number) {
  return useQuery({
    queryKey: ["performances", performanceId, "cancel-quote"],
    queryFn: () => api<CancelQuote>(`/performances/${performanceId}/cancel-quote`),
  });
}

type CancelConfirmation = Pick<CancelQuote, "phase" | "ratePercent" | "paid" | "penaltyTotal" | "feeRefunded" | "refundTotal">;

export function useCancel(performanceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (confirmation: CancelConfirmation) => api<CancelQuote>(`/performances/${performanceId}/cancel`, {
      method: "POST",
      body: JSON.stringify(confirmation),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["performances", performanceId] }),
  });
}

export interface SupplierReservation {
  performanceId: number;
  title: string;
  showDate: string;
  showStart: string;
  showEnd: string;
  sido: string;
  sigungu: string;
  status: "ASSIGNING" | "AWAITING_PAYMENT" | "PAID" | "COMPLETED" | "NEEDS_REVIEW" | "CANCELLED";
  stageTypes: StageType[];
  amount: number;
}

export function useSupplierReservations(supplierUserId: number | undefined) {
  return useQuery({
    queryKey: ["supplier", supplierUserId, "reservations"],
    enabled: supplierUserId !== undefined,
    queryFn: () => api<SupplierReservation[]>("/supplier/reservations"),
  });
}

/** 업체 사정 취소 (AC-F5-10, D-57). 결제 전이면 그 단계만 다시 모집·결제 마감 48시간 연장, 결제 후면 전액 환불. 업체 경고 1회 */
export function useSupplierCancel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { performanceId: number; reason: string }) =>
      api<CancelQuote>(`/performances/${v.performanceId}/cancel-by-supplier`, {
        method: "POST",
        body: JSON.stringify({ reason: v.reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier"] }),
  });
}

/** 지금 경고 수와 정지 기준 (3회째 자동 정지). 업체 사정 취소 창이 "이번 취소로 정지돼요"를 미리 알린다 */
export function useSupplierWarnings(enabled: boolean) {
  return useQuery({
    queryKey: ["supplier", "warnings"],
    enabled,
    queryFn: () => api<{ warningCount: number; suspendAt: number }>("/supplier/warnings"),
  });
}

/** 최종 담당표 (#53). 사용자·확정 업체만, 남이면 404 */
export function useSheet(performanceId: number) {
  return useQuery({
    queryKey: ["performances", performanceId, "sheet"],
    queryFn: () => api<Sheet>(`/performances/${performanceId}/sheet`),
  });
}

export const orderKey = (performanceId: number) => ["performances", performanceId, "order"] as const;

/** 청구서를 본다. 아직 없으면 한 번 발행한다 (모든 단계가 확정·건너뜀이어야 서버가 만든다, 아니면 409) */
export function useOrder(performanceId: number) {
  return useQuery({
    queryKey: orderKey(performanceId),
    queryFn: async () => {
      try {
        return await api<Order>(`/performances/${performanceId}/order`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return api<Order>(`/performances/${performanceId}/order`, { method: "POST" });
        }
        throw e;
      }
    },
  });
}

export function usePay(performanceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { orderId: number; amount: number; idempotencyKey: string }) =>
      api<PaymentResult>(`/orders/${v.orderId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: v.amount, mockResult: "SUCCESS" }),
        idempotencyKey: v.idempotencyKey,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["performances", performanceId] }),
  });
}
