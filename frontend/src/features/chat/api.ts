/** 채팅 API (backend chat/router.py). 보내기는 REST, 받기는 WebSocket(shared/chat/useChatSocket). 서버 데이터는 TanStack Query 로만 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../shared/api/client";
import type { ChatMessageIn, ChatMessageOut, ChatMessagesOut, ChatRoom, UploadedFile } from "../../shared/api/types";
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
    meta: { errorToast: true },
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

function postMessage(roomId: number, body: ChatMessageIn) {
  return api<ChatMessageOut>(`/chat-rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify(body) });
}

/** 보낸 메시지는 바로 말풍선으로 (WebSocket 으로 또 와도 id 로 한 번만) */
function useAddSent(roomId: number) {
  const qc = useQueryClient();
  return (m: ChatMessageOut) => {
    qc.setQueryData<ChatThread>(messagesKey(roomId), (old) =>
      addToThread(old, { messages: [fromRest(m)], partnerLastReadMessageId: null }),
    );
    void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
  };
}

/** AC-F3-06·08·15: 글 메시지 보내기 */
export function useSendMessage(roomId: number) {
  const onSuccess = useAddSent(roomId);
  return useMutation({ mutationFn: (body: ChatMessageIn) => postMessage(roomId, body), onSuccess });
}

/**
 * 사진·파일 형식 (uploads.md CHAT 10MB, backend chat/calc.py ATTACHMENT_MIME: IMAGE = jpg·png·webp, FILE = pdf).
 * 화면 검사는 보조다 — 서버가 다시 보고 400·413 을 돌려준다.
 */
export const ATTACH_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACH_RULES = {
  IMAGE: { mimes: ["image/jpeg", "image/png", "image/webp"], accept: "image/jpeg,image/png,image/webp", formatMessage: "jpg·png·webp 사진만 올릴 수 있어요." },
  FILE: { mimes: ["application/pdf"], accept: "application/pdf,.pdf", formatMessage: "PDF 파일만 올릴 수 있어요." },
} as const;
export type AttachType = keyof typeof ATTACH_RULES;

/** 보내기 전에 막을 이유 (없으면 null) */
export function attachmentProblem(type: AttachType, file: File): string | null {
  if (!(ATTACH_RULES[type].mimes as readonly string[]).includes(file.type)) return ATTACH_RULES[type].formatMessage;
  if (file.size > ATTACH_MAX_BYTES) return "10MB 이하 파일만 올릴 수 있어요.";
  return null;
}

/** AC-F3-08: 사진·파일 보내기 = POST /files (purpose CHAT, 비공개) → POST messages {type, fileId}. FILE 은 파일 이름을 body 로 */
export function useSendAttachment(roomId: number) {
  const onSuccess = useAddSent(roomId);
  return useMutation({
    mutationFn: async ({ type, file, replyToId }: { type: AttachType; file: File; replyToId?: number | null }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "CHAT");
      const uploaded = await api<UploadedFile>("/files", { method: "POST", body: form });
      const base = type === "FILE" ? { type, fileId: uploaded.id, body: file.name } : { type, fileId: uploaded.id };
      return postMessage(roomId, replyToId ? { ...base, replyToId } : base);
    },
    onSuccess,
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

/** 위로 올려 예전 대화 보기 (11/24): before 앞의 최근 50개. 50개보다 적으면 더 없음 */
export const OLDER_PAGE = 50;
export async function fetchOlder(roomId: number, before: number): Promise<ChatThread> {
  return threadFromRest(await api<ChatMessagesOut>(`/chat-rooms/${roomId}/messages?before=${before}&limit=${OLDER_PAGE}`));
}

/** 바뀐 메시지 하나를 그 방 캐시에서 바꾼다 (수정·삭제 응답, message.updated) */
function useReplaceMessage(roomId: number) {
  const qc = useQueryClient();
  return (m: ChatMessageOut) => {
    qc.setQueryData<ChatThread>(messagesKey(roomId), (old) => addToThread(old, { messages: [fromRest(m)], partnerLastReadMessageId: null }));
    void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
  };
}

/** 메시지 수정 (11/24): 내가 보낸 글 메시지만 */
export function useEditMessage(roomId: number) {
  const onSuccess = useReplaceMessage(roomId);
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      api<ChatMessageOut>(`/chat-rooms/${roomId}/messages/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
    onSuccess,
  });
}

/** 메시지 삭제 (11/24): "삭제된 메시지"로 남는다 */
export function useDeleteMessage(roomId: number) {
  const onSuccess = useReplaceMessage(roomId);
  return useMutation({
    mutationFn: (id: number) => api<ChatMessageOut>(`/chat-rooms/${roomId}/messages/${id}`, { method: "DELETE" }),
    onSuccess,
  });
}
