import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TERMS } from "../support/terms";
import { api } from "../../shared/api/client";
import { useMe } from "../../shared/auth/useMe";

interface ReviewStatus {
  version: string;
  reviewed: boolean;
}

// 서버에 저장하는 버전은 실제로 표시한 두 문서의 버전이다.
export const SUPPLIER_REVIEW_VERSION = [TERMS.supplier.version, TERMS.privacy.version].join(":");
const reviewPath = "/supplier/terms-review";
const reviewKey = (userId: number | undefined) => ["supplier", userId, "terms-review"] as const;

export function useSupplierTermsReview() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: reviewKey(me?.id),
    queryFn: () => api<ReviewStatus>(reviewPath),
    enabled: me?.role === "SUPPLIER" && me.supplierReviewStatus === "APPROVED",
  });
}

export function useConfirmSupplierTermsReview() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<ReviewStatus>(reviewPath, {
      method: "PUT",
      body: JSON.stringify({ version: SUPPLIER_REVIEW_VERSION }),
    }),
    onSuccess: (review) => queryClient.setQueryData(reviewKey(me?.id), review),
  });
}
