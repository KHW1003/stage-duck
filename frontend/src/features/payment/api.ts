/** 통합 청구서·테스트 결제 API (#50·#51). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../shared/api/client";
import type { Order, PaymentResult } from "../../shared/api/types";

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
