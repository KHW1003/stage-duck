/** 커뮤니티 API (api-contract.md 7장 /free-posts). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { FreePost, FreePostPage, FreePostRequest, FreePostSaved, UploadedFile } from "../../shared/api/types";

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
