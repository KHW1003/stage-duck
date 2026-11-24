/** 커뮤니티 API (api-contract.md 7장 /free-posts). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { FreeCommentSaved, FreePost, FreePostPage, FreePostRequest, FreePostSaved, UploadedFile } from "../../shared/api/types";

export const FREE_POSTS_KEY = ["free-posts"] as const;

export interface ListParams {
  category: string;
  sort: "latest" | "comments" | "views";
  field: "all" | "title" | "author";
  q: string;
  page: number;
}

export const DEFAULT_PARAMS: ListParams = { category: "", sort: "latest", field: "all", q: "", page: 1 };

/** 기본값이 아닌 것만 주소에 넣는다 (같은 조건 = 같은 주소) */
export function listPath(p: ListParams): string {
  const qs = new URLSearchParams();
  if (p.category) qs.set("category", p.category);
  if (p.sort !== "latest") qs.set("sort", p.sort);
  if (p.q.trim()) {
    qs.set("field", p.field);
    qs.set("q", p.q.trim());
  }
  if (p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `/free-posts?${s}` : "/free-posts";
}

export function useFreePosts(params: ListParams) {
  return useQuery({
    queryKey: [...FREE_POSTS_KEY, params],
    queryFn: () => api<FreePostPage>(listPath(params)),
    placeholderData: keepPreviousData,
  });
}

export function useFreePost(id: number, enabled = true) {
  return useQuery({ queryKey: [...FREE_POSTS_KEY, id], queryFn: () => api<FreePost>(`/free-posts/${id}`), enabled });
}

export function useSaveFreePost(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FreePostRequest) =>
      api<FreePostSaved>(id ? `/free-posts/${id}` : "/free-posts", { method: id ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FREE_POSTS_KEY }),
  });
}

export function useDeleteFreePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/free-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FREE_POSTS_KEY }),
  });
}

/** 사진은 고르는 순간 올리고(TEMP), 글을 저장할 때 id만 보낸다 (uploads.md) */
export function useUploadPhoto() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "COMMUNITY");
      return api<UploadedFile>("/files", { method: "POST", body: form });
    },
  });
}

// ---- 댓글·도움 돼요·저장·신고 (#101) ----

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: FREE_POSTS_KEY });
}

export function useAddComment(postId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { body: string; parentId: number | null }) =>
      api<FreeCommentSaved>(`/free-posts/${postId}/comments`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: refresh,
  });
}

export function useDeleteComment() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: number) => api<void>(`/free-comments/${id}`, { method: "DELETE" }), onSuccess: refresh });
}

/** 도움 돼요: 누르기(PUT) / 취소(DELETE) — 한 사람 한 번 (AC-F4-17) */
export function useHelpful() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { targetType: "POST" | "COMMENT"; targetId: number; on: boolean }) =>
      api<{ helpfulCount: number }>("/free-helpfuls", {
        method: v.on ? "PUT" : "DELETE",
        body: JSON.stringify({ targetType: v.targetType, targetId: v.targetId }),
      }),
    onSuccess: refresh,
  });
}

export function useBookmark(postId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (on: boolean) => api<void>(`/free-posts/${postId}/bookmark`, { method: on ? "PUT" : "DELETE" }),
    onSuccess: refresh,
  });
}

export function useMyBookmarks() {
  return useQuery({ queryKey: [...FREE_POSTS_KEY, "bookmarks"], queryFn: () => api<FreePostPage>("/me/free-bookmarks") });
}

/** 신고 (4번 POST /reports). 처리는 관리자가 한다 */
export function useReport() {
  return useMutation({
    mutationFn: (v: { targetType: "FREE_POST" | "FREE_COMMENT"; targetId: number; reason: string }) =>
      api<unknown>("/reports", { method: "POST", body: JSON.stringify(v) }),
  });
}
