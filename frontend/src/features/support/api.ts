/** 공지사항 API (api-contract.md GET /notices · /notices/{id}, FR-CS-02). 누구나 읽는다. */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";

export type NoticeCategory = "GUIDE" | "MAINTENANCE" | "POLICY";

export const NOTICE_CATEGORY: Record<NoticeCategory, string> = { GUIDE: "안내", MAINTENANCE: "점검", POLICY: "정책" };

export interface NoticeItem {
  id: number;
  category: NoticeCategory;
  title: string;
  isPinned: boolean;
  publishedAt: string;
}

export interface NoticePage {
  items: NoticeItem[];
  page: number;
  totalPages: number;
  total: number;
}

export interface NoticeNeighbor {
  id: number;
  title: string;
  publishedAt: string;
}

export interface NoticeDetail extends NoticeItem {
  body: string;
  prev: NoticeNeighbor | null;
  next: NoticeNeighbor | null;
}

export function useNotices(page: number) {
  return useQuery({
    queryKey: ["notices", page],
    queryFn: () => api<NoticePage>(page > 1 ? `/notices?page=${page}` : "/notices"),
    placeholderData: keepPreviousData,
  });
}

export function useNotice(id: number) {
  return useQuery({
    queryKey: ["notices", "detail", id],
    queryFn: () => api<NoticeDetail>(`/notices/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });
}

/** 목록 날짜 "11.16" */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 상세 날짜 "2026년 11월 16일" */
export function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 본문: 빈 줄로 문단, "- " 로 시작하는 줄은 목록 (관리자 화면 안내와 같다) */
export type BodyBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function bodyBlocks(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let list: string[] | null = null;
    const flush = () => {
      if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    };
    for (const line of lines) {
      if (line.startsWith("- ")) {
        flush();
        if (!list) blocks.push({ kind: "ul", items: (list = []) });
        list.push(line.slice(2));
      } else {
        list = null;
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}
