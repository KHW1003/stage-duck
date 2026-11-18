/** 공고 목록·상세 API (backend quote/router.py GET /postings, GET /postings/{stageId}). 서버 데이터는 TanStack Query 로만 (CLAUDE.md 6.2) */
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { PostingDetail, PostingSummary } from "../../shared/api/types";

export const POSTINGS_KEY = ["postings"] as const;

/** AC-F2-11·12: 내 부문 × 지금 열린 단계 공고. sido 가 비면 전체 지역 */
export function usePostings(sido: string) {
  return useQuery({
    queryKey: [...POSTINGS_KEY, { sido }],
    queryFn: () => api<PostingSummary[]>(sido ? `/postings?sido=${encodeURIComponent(sido)}` : "/postings"),
  });
}

/** AC-F3-03: 공고 상세 + 앞 단계 확정 정보. 나에게 안 보이는 공고는 서버가 404 */
export function usePosting(stageId: number) {
  return useQuery({
    queryKey: [...POSTINGS_KEY, stageId],
    queryFn: () => api<PostingDetail>(`/postings/${stageId}`),
  });
}
