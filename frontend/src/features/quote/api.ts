/** 공고 목록·상세·견적서 보내기 API (backend quote/router.py). 서버 데이터는 TanStack Query 로만 (CLAUDE.md 6.2) */
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { PostingDetail, PostingSummary, QuoteIn, QuoteSentOut } from "../../shared/api/types";
import { useApplication } from "../supplier/api";
import type { VenuePage } from "../venue/api";

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

/** AC-F2-15·16: 견적서 보내기. 한 공고에 label 을 바꿔 여러 개 보낼 수 있다 */
export function useSendQuote(stageId: number) {
  return useMutation({
    mutationFn: (body: QuoteIn) => api<QuoteSentOut>(`/stages/${stageId}/quotes`, { method: "POST", body: JSON.stringify(body) }),
  });
}

/**
 * AC-F2-18: 공연장 견적서에 고를 내 공간 목록.
 * 임시: GET /supplier/venues 생기면 교체 — 지금은 내 업체 상호(GET /supplier/application)와
 * 공개 공간 목록(GET /venues)의 companyName 이 같은 것만 고른다. 시연 데이터의 가상 상호는 겹치지 않는다.
 */
export function useMyVenues(enabled: boolean) {
  const application = useApplication();
  const companyName = application.data?.companyName;
  return useQuery({
    queryKey: ["venues", "mine", companyName],
    queryFn: () => api<VenuePage>("/venues?size=50"),
    enabled: enabled && Boolean(companyName),
    select: (page) => page.items.filter((v) => v.companyName === companyName),
  });
}
