/** 요청서 작성·게시 API (api-contract.md 3.2). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { useMutation } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { PerformanceCreated, PerformancePublished, PerformanceRequest } from "../../shared/api/types";

export function useCreatePerformance() {
  return useMutation({
    mutationFn: (body: PerformanceRequest) =>
      api<PerformanceCreated>("/performances", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function usePublishPerformance() {
  return useMutation({
    mutationFn: (id: number) => api<PerformancePublished>(`/performances/${id}/publish`, { method: "POST" }),
  });
}
