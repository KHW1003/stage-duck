/** 로그인·가입 API (api-contract.md 1장). 성공하면 내 정보(GET /me)를 다시 읽어 머리 메뉴가 바로 바뀐다 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { AuthResult } from "../../shared/api/types";
import { ME_KEY } from "../../shared/auth/useMe";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  nickname: string;
  email: string;
  password: string;
  phone: string;
  birthDate: string | null;
  signupPurpose: string;
  agreements: { service: boolean; privacyRequired: boolean; privacyOptional: boolean; marketing: boolean };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SignupRequest) => api<AuthResult>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}
