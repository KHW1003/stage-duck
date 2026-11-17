/**
 * 업체 가입·입점 신청 API (#26, api-contract.md 2장). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { AuthResult, SupplierSignupRequest } from "../../shared/api/types";
import { ME_KEY } from "../../shared/auth/useMe";

/** FR-SUP-01 업체 1단계 가입. 가입되면 바로 로그인 상태가 된다 */
export function useSupplierSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SupplierSignupRequest) =>
      api<AuthResult>("/auth/signup/supplier", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}
