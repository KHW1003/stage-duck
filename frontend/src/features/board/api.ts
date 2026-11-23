/** 업체 찾기 API (api-contract.md 5장 /pr-posts, #30). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { MyPrPostList, PrCategory, PrPost, PrPostPage, PrPostRequest, PrPostSaved, UploadedFile } from "../../shared/api/types";

export const PR_POSTS_KEY = ["pr-posts"] as const;
export const MY_PR_POSTS_KEY = ["pr-posts", "mine"] as const;

export interface BoardParams {
  category: PrCategory | "";
  sido: string;
  page: number;
}

/** 기본값이 아닌 것만 넣는다 — 화면 주소(/board?…)와 API 주소(/pr-posts?…)가 같은 조건을 쓴다 */
export function boardQuery(p: BoardParams): string {
  const qs = new URLSearchParams();
  if (p.category) qs.set("category", p.category);
  if (p.sido) qs.set("sido", p.sido);
  if (p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function usePrPosts(params: BoardParams) {
  return useQuery({
    queryKey: [...PR_POSTS_KEY, params],
    queryFn: () => api<PrPostPage>(`/pr-posts${boardQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function usePrPost(id: number) {
  return useQuery({ queryKey: [...PR_POSTS_KEY, id], queryFn: () => api<PrPost>(`/pr-posts/${id}`), enabled: Number.isInteger(id) });
}

/** AC-F4-01·02: 승인 부문·부문당 1개는 서버가 검사한다. 화면은 서버 문구를 보여 주기만 한다 */
export function useCreatePrPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PrPostRequest) => api<PrPostSaved>("/pr-posts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PR_POSTS_KEY }),
  });
}

/** FR-BOARD-02·03: 내 소개 글 (가려진 글·사유 포함, 내린 글 제외). 끌어올리기 가능 여부는 서버가 준다 */
export function useMyPrPosts() {
  return useQuery({ queryKey: MY_PR_POSTS_KEY, queryFn: () => api<MyPrPostList>("/pr-posts/mine") });
}

/** AC-F4-03·10: 고치기 (말머리는 못 바꿈). 블라인드 중이면 서버가 409 */
export function useUpdatePrPost(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<PrPostRequest, "category">) => api<PrPostSaved>(`/pr-posts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PR_POSTS_KEY }),
  });
}

/** FR-BOARD-02: [글 내리기]. 내리면 그 부문에 새 글을 쓸 수 있다 */
export function useDeletePrPost(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/pr-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PR_POSTS_KEY }),
  });
}

/** FR-BOARD-03: 끌어올리기 7일에 1회. 7일이 안 됐으면 서버가 429 BUMP_TOO_SOON */
export function useBumpPrPost(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<PrPost>(`/pr-posts/${id}/bump`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PR_POSTS_KEY }),
  });
}

/** 사진은 고르는 순간 올리고(TEMP), 글을 저장할 때 id만 보낸다 (uploads.md, purpose PR_POST) */
export function useUploadPrPhoto() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "PR_POST");
      return api<UploadedFile>("/files", { method: "POST", body: form });
    },
  });
}

/** AC-F4-03: 소개 글 신고 → 4번 POST /reports (targetType PR_POST). 블라인드·경고는 관리자가 처리한다 */
export function useReportPrPost() {
  return useMutation({
    mutationFn: (v: { targetId: number; reason: string }) =>
      api<unknown>("/reports", { method: "POST", body: JSON.stringify({ targetType: "PR_POST", ...v }) }),
  });
}
