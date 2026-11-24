/**
 * 최종 견적(견적 내역 확인 카드)·확정 API (api-contract.md 4.3, 이슈 #43, AC-F3-09~14).
 * 카드 상태는 채팅 WebSocket `confirm.updated` 로 바뀌면 다시 받는다 (useChatSocket).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { StageType } from "../../shared/api/types";

export type ConfirmStatus = "PENDING" | "CONFIRMED" | "RENEGOTIATE" | "EXPIRED" | "INVALIDATED";

export interface ConfirmCardOut {
  id: number;
  roomId: number;
  quoteId: number;
  quoteVersionId: number;
  version: number;
  currentVersion: number;
  label: string;
  totalAmount: number;
  stageId: number;
  stageType: StageType;
  performanceId: number;
  status: ConfirmStatus;
  expiresAt: string;
  viewedAt: string | null;
  decidedAt: string | null;
  nextStageType: StageType | null;
  checkoutAvailable: boolean | null;
}

export interface AcceptOut {
  stageId: number;
  stageStatus: string;
  confirmedQuoteVersionId: number;
  performanceId: number;
  next: { stageType: StageType | null; suggestSkip: boolean };
  checkoutAvailable: boolean;
  card: ConfirmCardOut;
}

export const confirmKey = (id: number) => ["confirm-card", id] as const;

export function useConfirmCard(id: number | null) {
  return useQuery({ queryKey: confirmKey(id ?? 0), queryFn: () => api<ConfirmCardOut>(`/confirm-requests/${id}`), enabled: !!id });
}

export function useSendConfirmCard(quoteId: number) {
  return useMutation({
    mutationFn: () => api<ConfirmCardOut>(`/quotes/${quoteId}/confirm-requests`, { method: "POST" }),
  });
}

function useCardAction<T>(id: number, path: string, init: () => RequestInit & { idempotencyKey?: string } = () => ({})) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<T>(`/confirm-requests/${id}/${path}`, { method: "POST", ...init() }),
    onSettled: () => void qc.invalidateQueries({ queryKey: confirmKey(id) }),
  });
}

/** 내역서를 열면 기록 (AC-F3-10) */
export function useViewCard(id: number) {
  return useCardAction<ConfirmCardOut>(id, "view");
}

/** 확정 (Idempotency-Key 필수 — 같은 카드면 서버가 처음 결과를 돌려준다) */
export function useAcceptCard(id: number) {
  return useCardAction<AcceptOut>(id, "accept", () => ({ idempotencyKey: `confirm-${id}-${crypto.randomUUID()}` }));
}

export function useRenegotiate(id: number) {
  return useCardAction<ConfirmCardOut>(id, "renegotiate");
}

/** "47시간 남음" · "30분 남음" */
export function leftText(expiresAt: string, now = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "기한 지남";
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.floor(ms / 60000))}분 남음`;
}
