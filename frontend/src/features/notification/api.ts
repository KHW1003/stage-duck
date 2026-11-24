/**
 * 사이트 안 알림 (specs/notifications.md 5장, 이슈 #45).
 * - 목록·안 읽은 수는 서버에서, 새 알림은 채팅 WebSocket 의 `notification` 이벤트로 알고 다시 받는다 (useChatSocket)
 * - 채팅 알림(/chats/{roomId})은 화면을 옮기지 않고 지금 화면에 ?chat= 을 붙여 채팅 창을 연다 (D-42)
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../shared/api/client";

export type NotificationCategory = "QUOTE_CHAT" | "OFFER" | "POSTING" | "PAYMENT" | "ADMIN" | "COMMUNITY";

export interface NotificationItem {
  id: number;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextBefore: number | null;
  unreadCount: number;
}

/** 알림 화면 탭 (notifications.md 2장, 화면 문구 "견적 요청") */
export const CATEGORY_TABS: { key: NotificationCategory | null; label: string }[] = [
  { key: null, label: "전체" },
  { key: "QUOTE_CHAT", label: "견적·채팅" },
  { key: "OFFER", label: "견적 요청" },
  { key: "POSTING", label: "공고" },
  { key: "PAYMENT", label: "결제" },
  { key: "ADMIN", label: "운영" },
  { key: "COMMUNITY", label: "커뮤니티" },
];

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "unread"],
    queryFn: () => api<{ count: number }>("/me/notifications/unread-count"),
    enabled,
  });
}

export function useNotifications(category: NotificationCategory | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list", category ?? "ALL"],
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams();
      if (category) q.set("category", category);
      if (pageParam) q.set("before", String(pageParam));
      const qs = q.toString();
      return api<NotificationPage>(`/me/notifications${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: number[] } | { all: true }) =>
      api<void>("/me/notifications/read", { method: "POST", body: JSON.stringify(body) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

/** 알림이 가는 곳. 채팅 알림은 지금 화면(pathname)에서 채팅 창만 연다 */
export function notificationTo(link: string, pathname: string): string {
  const chat = /^\/chats\/(\d+)$/.exec(link);
  return chat ? `${pathname}?chat=${chat[1]}` : link;
}

/** 알림을 누르면: 읽음 처리 → 링크로. 채팅 알림은 지금 화면에서 채팅 창만 연다 */
export function useOpenNotification() {
  const read = useMarkRead();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (n: NotificationItem) => {
    if (!n.read) read.mutate({ ids: [n.id] });
    navigate(notificationTo(n.link, pathname));
  };
}

/** "방금 · 5분 전 · 3시간 전 · 11월 18일" */
export function timeAgo(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** 알림 받는 방법 (notifications.md 10장): 중요 알림을 메일로도 받을지 */
export interface NotificationSettings {
  emailEnabled: boolean;
  email: string;
}
const SETTINGS_KEY = ["notification-settings"] as const;

export function useNotificationSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<NotificationSettings>("/me/notifications/settings") });
}

export function useSetMailNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emailEnabled: boolean) =>
      api<NotificationSettings>("/me/notifications/settings", { method: "PUT", body: JSON.stringify({ emailEnabled }) }),
    meta: { errorToast: true },
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });
}
