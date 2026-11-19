/** 단계별 견적 비교 API (#48). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { CompareQuote } from "../../shared/api/types";

export function useStageQuotes(stageId: number | undefined) {
  return useQuery({
    queryKey: ["stages", stageId, "quotes"],
    queryFn: () => api<CompareQuote[]>(`/stages/${stageId}/quotes`),
    enabled: stageId !== undefined,
  });
}
