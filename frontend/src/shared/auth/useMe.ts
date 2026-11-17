/**
 * 지금 로그인한 사람 (GET /me). 로그인하지 않았으면(401) 오류가 아니라 null 이다.
 * 서버 데이터라 TanStack Query 로만 들고 있고 useState 로 복사하지 않는다 (CLAUDE.md 6.2).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { Me } from "../api/types";

export const ME_KEY = ["me"] as const;

async function fetchMe(): Promise<Me | null> {
  try {
    return await api<Me>("/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, retry: false, staleTime: 60_000 });
}

/** 화면 묶음 (헤더 메뉴·색). 업체는 승인 전이면 입점·심사 화면만 보인다 */
export type LayoutKind = "guest" | "user" | "partner" | "partner-review" | "admin";

export function layoutKindOf(me: Me | null | undefined): LayoutKind {
  if (!me) return "guest";
  if (me.role === "USER") return "user";
  if (me.role === "ADMIN") return "admin";
  if (me.role === "SUPPLIER") return me.supplierReviewStatus === "APPROVED" ? "partner" : "partner-review";
  return "guest";
}

/**
 * 로그아웃 (AC-F1-12 화면 부분): 서버 쿠키를 지운 뒤, 화면에 남은 서버 데이터를 모두 비운다.
 * 그래서 뒤로 가기를 눌러도 이전 사람의 정보가 다시 보이지 않는다.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      // 먼저 "로그인 안 함"으로 바꿔 지금 떠 있는 머리·화면이 바로 다시 그려지게 하고,
      // 나머지 서버 데이터는 지운다. (clear() 만 쓰면 화면에 붙어 있던 이전 데이터가 남는다)
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      navigate("/login", { replace: true });
    },
  });
}
