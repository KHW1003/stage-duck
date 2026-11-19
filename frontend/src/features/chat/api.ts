/** 채팅 API (backend chat/router.py). 보내기는 REST, 받기는 WebSocket(shared/chat/useChatSocket). 서버 데이터는 TanStack Query 로만 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { ChatMessageIn, ChatMessageOut, ChatMessagesOut, ChatRoom } from "../../shared/api/types";
import { type ChatThread, fromRest, mergeMessages, threadFromRest } from "../../shared/chat/normalize";

export const CHAT_ROOMS_KEY = ["chat-rooms"] as const;
export const messagesKey = (roomId: number) => ["chat-rooms", roomId, "messages"] as const;

/** AC-F3-26·27: 내 채팅방 목록 (안 읽은 수, 내 고정 시각) */
export function useChatRooms() {
  return useQuery({ queryKey: CHAT_ROOMS_KEY, queryFn: () => api<ChatRoom[]>("/chat-rooms") });
}

/** AC-F3-07·08: 최근 50개 (after 가 있으면 그 뒤로). 남의 방이면 서버가 404 */
export async function fetchThread(roomId: number, after?: number): Promise<ChatThread> {
  const qs = after === undefined ? "" : `?after=${after}`;
  return threadFromRest(await api<ChatMessagesOut>(`/chat-rooms/${roomId}/messages${qs}`));
}

export function useChatThread(roomId: number) {
  return useQuery({ queryKey: messagesKey(roomId), queryFn: () => fetchThread(roomId) });
}

/** 받은 메시지를 그 방 캐시에 더한다 (캐시가 없으면 방을 열 때 새로 받으니 그대로 둔다) */
export function addToThread(old: ChatThread | undefined, add: ChatThread): ChatThread | undefined {
  if (!old) return old;
  return {
    messages: mergeMessages(old.messages, add.messages),
    partnerLastReadMessageId: add.partnerLastReadMessageId ?? old.partnerLastReadMessageId,
  };
}

/** AC-F3-27: 상단 고정 / 고정 풀기 (나에게만) */
export function usePinRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, pin }: { roomId: number; pin: boolean }) =>
      api<unknown>(`/chat-rooms/${roomId}/pin`, { method: pin ? "PUT" : "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true }),
  });
}

/** AC-F3-06: 사용자의 [채팅 시작] */
export function useStartChat(roomId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<unknown>(`/chat-rooms/${roomId}/start`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true }),
  });
}

/** AC-F3-06·08·15: 메시지 보내기. 보낸 메시지는 바로 말풍선으로 (WebSocket 으로 또 와도 id 로 한 번만) */
export function useSendMessage(roomId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChatMessageIn) =>
      api<ChatMessageOut>(`/chat-rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (m) => {
      qc.setQueryData<ChatThread>(messagesKey(roomId), (old) =>
        addToThread(old, { messages: [fromRest(m)], partnerLastReadMessageId: null }),
      );
      void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
    },
  });
}

/** AC-F3-08: 여기까지 읽었어요 */
export function markRead(roomId: number, lastMessageId: number) {
  return api<unknown>(`/chat-rooms/${roomId}/read`, { method: "POST", body: JSON.stringify({ lastMessageId }) });
}

/** 목록 오른쪽 클릭 [읽음으로 표시] (mockup-v3): 그 방의 마지막 메시지까지 읽음 → 안 읽은 수 0 */
export function useMarkRoomRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, lastMessageId }: { roomId: number; lastMessageId: number }) => markRead(roomId, lastMessageId),
    onSuccess: (_, { roomId }) => {
      qc.setQueryData<ChatRoom[]>(CHAT_ROOMS_KEY, (old) =>
        old?.map((r) => (r.roomId === roomId ? { ...r, unreadCount: 0 } : r)),
      );
      void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
    },
  });
}
