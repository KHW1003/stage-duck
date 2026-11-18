/**
 * 기술 확인 API (api-contract.md 4.5, FR-TECH-01 · AC-F3-25). 서버(#49)는 아직 없다 — 이 모양으로 만든다.
 * - GET  /performances/{id}/tech-checks   항목 목록 (공연에 확정된 업체만)
 * - POST /performances/{id}/tech-checks   항목 추가 { item, detail, ownerSupplierId } — 엔지니어(또는 엔지니어 포함 업체)만
 * - PUT  /tech-checks/{id}                답변 { answer: "OK", memo } — 담당 업체가 아니면 404
 * data-model.md tech_checks 에 없는 detail(항목 설명 한 줄, 목업의 작은 글씨)은 서버를 만들 때 컬럼을 더한다.
 * 타입은 서버가 생기기 전까지 이 파일에 둔다 (shared/api/types.ts 를 여러 사람이 고치는 중이라).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";

export type TechAnswer = "UNCONFIRMED" | "OK" | "CONDITIONAL" | "IMPOSSIBLE" | "RECHECK";

export interface TechCheckItem {
  id: number;
  item: string;
  detail: string | null;
  ownerSupplierId: number;
  /** "업체 C (공간)" 처럼 담당 표시 */
  ownerLabel: string;
  /** 내가 답할 항목인지 (서버가 정한다) */
  mine: boolean;
  answer: TechAnswer;
  memo: string | null;
  answeredAt: string | null;
}

export interface TechCheckList {
  performance: { id: number; title: string; showDate: string; statusLabel: string };
  /** 항목을 정하는 업체 (엔지니어 또는 엔지니어 포함 업체) */
  creator: { supplierId: number; name: string };
  /** 내가 항목을 더할 수 있는지 */
  canAdd: boolean;
  /** 항목을 맡길 수 있는 업체 (공연장·장비 등, 확정된 업체) */
  owners: { supplierId: number; label: string }[];
  items: TechCheckItem[];
}

const key = (performanceId: number) => ["tech-checks", performanceId] as const;

export function useTechChecks(performanceId: number) {
  return useQuery({
    queryKey: key(performanceId),
    queryFn: () => api<TechCheckList>(`/performances/${performanceId}/tech-checks`),
    enabled: Number.isInteger(performanceId) && performanceId > 0,
  });
}

export function useAnswerTechCheck(performanceId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; memo: string }) =>
      api<TechCheckItem>(`/tech-checks/${v.id}`, { method: "PUT", body: JSON.stringify({ answer: "OK", memo: v.memo }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key(performanceId) }),
  });
}

export function useAddTechCheck(performanceId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { item: string; detail: string; ownerSupplierId: number }) =>
      api<TechCheckItem>(`/performances/${performanceId}/tech-checks`, { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key(performanceId) }),
  });
}
