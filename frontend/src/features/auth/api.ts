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

/** 가입 화면 [중복 확인] — 누르는 즉시 이메일·닉네임을 쓸 수 있는지 (모양이 틀리면 400 + fieldErrors) */
export function checkAvailable(field: "email" | "nickname", value: string) {
  return api<{ available: boolean; message: string }>("/auth/check-available", { method: "POST", body: JSON.stringify({ field, value }) });
}

/** 비밀번호 찾기 (AC-F1-21·23). 가입 여부와 상관없이 항상 202. demoLink 는 시연 서버에서만 (D-55) */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) =>
      api<{ demoLink: string | null }>("/auth/password-reset", { method: "POST", body: JSON.stringify({ email }) }),
  });
}

/** 새 비밀번호 저장 (AC-F1-22). 만료·사용된 링크는 400 RESET_TOKEN_INVALID. 바뀌면 로그인 쿠키도 지워진다 */
export function useConfirmPasswordReset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; password: string }) =>
      api<void>("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });
}
