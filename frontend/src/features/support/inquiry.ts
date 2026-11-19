/**
 * 1:1 문의 API (api-contract.md /inquiries, FR-CS-01 · AC-F5-18~20). 로그인한 사용자·업체(정지 포함), 본인 것만.
 * 서버: backend/app/support (목산 #178). GET /me/inquiries 는 내 문의 전체를 최신순 배열로 준다 —
 * 요약 숫자·상태·유형 거르기·쪽 나누기는 화면에서 한다 (문의는 한 사람당 몇 개 안 된다).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { UploadedFile } from "../../shared/api/types";

export type InquiryCategory = "PAYMENT" | "QUOTE" | "SUPPLIER" | "ACCOUNT" | "ETC";
export type InquiryStatus = "WAITING" | "ANSWERED";

export const INQUIRY_CATEGORIES: { value: InquiryCategory; label: string }[] = [
  { value: "PAYMENT", label: "결제·환불" },
  { value: "QUOTE", label: "견적·확정" },
  { value: "SUPPLIER", label: "업체 이용" },
  { value: "ACCOUNT", label: "계정" },
  { value: "ETC", label: "기타" },
];
export const categoryLabel = (c: InquiryCategory) => INQUIRY_CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const TITLE_MAX = 50;
export const BODY_MAX = 2000;
export const MAX_FILES = 3;
export const PAGE_SIZE = 10;

export interface InquirySummary {
  id: number;
  category: InquiryCategory;
  title: string;
  status: InquiryStatus;
  createdAt: string;
}

export interface InquiryDetail extends InquirySummary {
  performanceId: number | null;
  body: string;
  answer: string | null;
  answeredAt: string | null;
  updatedAt: string;
  photos: { id: number; url: string }[];
}

export interface InquiryRequest {
  category: InquiryCategory;
  performanceId: number | null;
  title: string;
  body: string;
  fileIds: number[];
}

export interface ListFilter {
  status: "" | InquiryStatus;
  category: "" | InquiryCategory;
  page: number;
}

const KEY = ["inquiries"] as const;

export function useMyInquiries() {
  return useQuery({ queryKey: [...KEY, "mine"], queryFn: () => api<InquirySummary[]>("/me/inquiries") });
}

/** 요약 숫자(전체 기준) + 거른 뒤 그 쪽의 문의 */
export function viewOf(all: InquirySummary[], f: ListFilter) {
  const counts = {
    total: all.length,
    waiting: all.filter((q) => q.status === "WAITING").length,
    answered: all.filter((q) => q.status === "ANSWERED").length,
  };
  const filtered = all.filter((q) => (!f.status || q.status === f.status) && (!f.category || q.category === f.category));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(f.page, totalPages);
  return { counts, filtered, page, totalPages, items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

export function useInquiry(id: number) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => api<InquiryDetail>(`/inquiries/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useSaveInquiry(id?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InquiryRequest) =>
      api<InquiryDetail>(id ? `/inquiries/${id}` : "/inquiries", { method: id ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteInquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/inquiries/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** 사진은 고르는 순간 올리고(TEMP, 비공개), 문의를 보낼 때 id만 보낸다 (uploads.md, 용도 INQUIRY) */
export function useUploadInquiryPhoto() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "INQUIRY");
      return api<UploadedFile>("/files", { method: "POST", body: form });
    },
  });
}

/** 목업 안내대로 본문의 전화번호·계좌번호는 보내기 전에 막는다 (숫자 10자리 이상 묶음 — 날짜·금액은 통과) */
const PHONE = /(?<!\d)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/;
const ACCOUNT = /(?<!\d)\d{2,6}(?:-\d{2,6}){2,4}(?!\d)|(?<!\d)\d{11,16}(?!\d)/g;

export function hasContact(text: string): boolean {
  if (PHONE.test(text)) return true;
  return [...text.matchAll(ACCOUNT)].some((m) => m[0].replace(/\D/g, "").length >= 10);
}

/** "11.16" */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

/** "11월 16일 15:10" */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "11월 22일" (공연 날짜) */
export function monthDay(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${m}월 ${d}일`;
}
