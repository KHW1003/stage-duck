/** 내 공연·순차 배정 API (api-contract.md 3.2, 4.3). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type {
  AdvanceResult,
  MyPerformances,
  PerformanceCreated,
  PerformanceDetail,
  PerformancePublished,
  PerformanceRequest,
} from "../../shared/api/types";

export const PERFORMANCES_KEY = ["performances"] as const;

/** 건너뛰기 책임 고지 동의 (FR-ASSIGN-03). 안내 문구가 바뀌면 버전을 올린다 */
export const SKIP_ACK = { acknowledgement: "STAGE_SKIP_OWNED", noticeVersion: "1" } as const;

/** 내 공연 (사용자만). enabled=false 면 부르지 않는다 — 업체 화면(1:1 문의)에서 같이 쓸 때 */
export function useMyPerformances({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...PERFORMANCES_KEY, "mine"],
    queryFn: () => api<MyPerformances>("/performances?mine=true"),
    enabled,
  });
}

export function usePerformance(id: number) {
  return useQuery({ queryKey: [...PERFORMANCES_KEY, id], queryFn: () => api<PerformanceDetail>(`/performances/${id}`) });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PERFORMANCES_KEY });
}

/** [다음 단계로] — 버튼마다 Idempotency-Key 를 넘긴다 (같은 키로 다시 보내도 한 번만 반영) */
export function useAdvance() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { stageId: number; action: "OPEN_NEXT" | "SKIP_NEXT"; idempotencyKey: string }) =>
      api<AdvanceResult>(`/stages/${v.stageId}/advance`, {
        method: "POST",
        idempotencyKey: v.idempotencyKey,
        body: JSON.stringify(v.action === "SKIP_NEXT" ? { action: v.action, ...SKIP_ACK } : { action: v.action }),
      }),
    onSuccess: refresh,
  });
}

/** AC-F3-04 전부 구했어요 */
export function useDeclareAllSecured() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) =>
      api<PerformancePublished>(`/performances/${id}/declare-all-secured`, { method: "POST", body: JSON.stringify(SKIP_ACK) }),
    onSuccess: refresh,
  });
}

export function useWithdraw() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => api<PerformanceCreated>(`/performances/${id}/withdraw`, { method: "POST" }),
    onSuccess: refresh,
  });
}

/** AC-F2-13 요청서 수정 → 새 버전 */
export function useUpdatePerformance() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { id: number; body: PerformanceRequest }) =>
      api<PerformanceCreated>(`/performances/${v.id}`, { method: "PUT", body: JSON.stringify(v.body) }),
    onSuccess: refresh,
  });
}

/** GET /me/posting-limit (AC-F4-05·06, #39): 지금 반려 카운트와 게시 제한 */
export interface PostingLimit {
  afterChat: number;
  noChat: number;
  limited: boolean;
  availableAt: string | null;
}

export function usePostingLimit() {
  return useQuery({ queryKey: ["me", "posting-limit"], queryFn: () => api<PostingLimit>("/me/posting-limit") });
}

