/** 로그인·가입 API (api-contract.md 1장). 성공하면 내 정보(GET /me)를 다시 읽어 머리 메뉴가 바로 바뀐다 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { AuthResult, SocialPending } from "../../shared/api/types";
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

/** 소셜 추가 정보 (FR-AUTH-04). 이메일 가입과 같은 칸에서 비밀번호만 없다 */
export type SocialCompleteRequest = Omit<SignupRequest, "password">;

/** 네이버·카카오 로그인 시작 주소. 화면 이동(링크)이라 api() 가 아니라 주소로 보낸다 (서버가 동의 화면으로 302) */
export const SOCIAL_START = { naver: "/api/v1/auth/naver/start", kakao: "/api/v1/auth/kakao/start" } as const;

/** 카카오 버튼은 VITE_KAKAO_LOGIN_ENABLED=true 일 때만 그린다 (AC-F1-08, 서버도 꺼져 있으면 404) */
export function kakaoLoginEnabled(): boolean {
  return import.meta.env.VITE_KAKAO_LOGIN_ENABLED === "true";
}

/** AC-F1-06: 추가 정보 화면에 미리 채울 값. signup_token 쿠키(10분)가 없거나 지나면 401 */
export function useSocialPending() {
  return useQuery({
    queryKey: ["auth", "social-pending"],
    queryFn: () => api<SocialPending>("/auth/social/pending"),
    retry: false,
    staleTime: Infinity,
  });
}

/** AC-F1-05·07·10: 추가 정보 + 우리 약관 동의 → 가입·로그인 */
export function useSocialComplete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SocialCompleteRequest) =>
      api<AuthResult>("/auth/social/complete", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
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
