/** 프로필 API (api-contract.md 5장, #33). 서버 데이터는 TanStack Query 로만 다룬다 (CLAUDE.md 6.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { MyProfileRequest, SupplierProfile, UploadedFile, UserProfile } from "../../shared/api/types";
import { ME_KEY, useMe } from "../../shared/auth/useMe";

export const MY_PROFILE_KEY = ["profile", "me"] as const;

/** AC-F5-15: 누구나. 승인 업체가 아니면 서버가 404 */
export function useSupplierProfile(id: number | "me") {
  const me = useMe().data;
  return useQuery({
    queryKey: id === "me" ? ["profile", "supplier", "me", me?.id] : ["profile", "supplier", id],
    queryFn: () => api<SupplierProfile>(id === "me" ? "/supplier/profile" : `/suppliers/${id}/profile`),
    enabled: id === "me" ? me?.role === "SUPPLIER" : Number.isInteger(id) && id > 0,
    retry: false,
  });
}

/** AC-F5-16·17: 관계있는 업체·관리자만. 만난 적 없으면 서버가 404 (3번 공고 화면이 UserProfileCard 와 함께 쓴다) */
export function useUserProfile(id: number) {
  return useQuery({
    queryKey: ["profile", "user", id],
    queryFn: () => api<UserProfile>(`/users/${id}/profile`),
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });
}

/** 마이페이지 "업체에게 이렇게 보여요" */
export function useMyProfile() {
  return useQuery({ queryKey: MY_PROFILE_KEY, queryFn: () => api<UserProfile>("/me/profile") });
}

/** FR-PROFILE-02: 닉네임 중복(409 NICKNAME_TAKEN)은 서버가 검사한다. 머리 메뉴의 닉네임도 다시 받는다 */
export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MyProfileRequest) => api<UserProfile>("/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (saved) => {
      queryClient.setQueryData(MY_PROFILE_KEY, saved);
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** 사진은 고르는 순간 올리고(TEMP), 저장할 때 id만 보낸다 (uploads.md, purpose PROFILE) */
export function useUploadProfilePhoto() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "PROFILE");
      return api<UploadedFile>("/files", { method: "POST", body: form });
    },
  });
}

/** 업체 대표 이미지 (FR-PROFILE-01): 고르면 바로 올리고(SUPPLIER_IMAGE) 바로 저장. null 이면 사진 빼기 */
export function useChangeSupplierImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File | null) => {
      let imageFileId: number | null = null;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("purpose", "SUPPLIER_IMAGE");
        imageFileId = (await api<UploadedFile>("/files", { method: "POST", body: form })).id;
      }
      return api<SupplierProfile>("/supplier/profile", { method: "PATCH", body: JSON.stringify({ imageFileId }) });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", "supplier"] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY }); // 머리줄 계정 버튼 사진도 바로 (11/25)
    },
  });
}

/** 오리 고르기 (11/26): 고르면 대표 사진을 빼고 그 오리로 바로 저장 */
export function usePickSupplierDuck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (duckAvatar: string) =>
      api<SupplierProfile>("/supplier/profile", { method: "PATCH", body: JSON.stringify({ imageFileId: null, duckAvatar }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile", "supplier"] });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
