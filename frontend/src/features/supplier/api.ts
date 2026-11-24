/**
 * 업체 가입·입점 신청 API (#26, api-contract.md 2장). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../shared/api/client";
import type {
  AuthResult,
  SupplierApplication,
  SupplierApplicationRequest,
  SupplierSignupRequest,
} from "../../shared/api/types";
import { ME_KEY } from "../../shared/auth/useMe";

export const APPLICATION_KEY = ["supplier", "application"] as const;

/** 아직 신청 전이면(404) 오류가 아니라 null */
async function fetchApplication(): Promise<SupplierApplication | null> {
  try {
    return await api<SupplierApplication>("/supplier/application");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function useApplication() {
  return useQuery({ queryKey: APPLICATION_KEY, queryFn: fetchApplication, retry: false });
}

/** 입점 신청(POST) 또는 반려 뒤 재신청(PUT). 성공하면 내 정보(심사 상태)도 다시 읽는다 */
export function useSubmitApplication(resubmit: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SupplierApplicationRequest) =>
      api<SupplierApplication>("/supplier/application", { method: resubmit ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      queryClient.setQueryData(APPLICATION_KEY, data);
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** FR-SUP-01 업체 1단계 가입. 가입되면 바로 로그인 상태가 된다 */
export function useSupplierSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SupplierSignupRequest) =>
      api<AuthResult>("/auth/signup/supplier", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}
