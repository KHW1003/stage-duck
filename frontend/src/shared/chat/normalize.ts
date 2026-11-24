/**
 * 채팅 메시지를 화면에서 한 모양으로 쓴다.
 * REST 는 보낸 사람이 senderUserId, WebSocket(api-contract.md 7장)은 senderId 라서 여기서 senderId 하나로 맞춘다.
 */
import type { ChatMessageOut, ChatMessageType, ChatMessagesOut, ChatReplyRef, WsChatMessage } from "../api/types";

export interface ChatMsg {
  id: number;
  type: ChatMessageType;
  body: string | null;
  senderId: number | null; // null = 시스템 메시지
  refId: number | null;
  contactWarning: boolean;
  createdAt: string;
  attachmentUrl: string | null;
  replyTo: { id: number; type: ChatMessageType; senderId: number | null; body: string | null; deleted: boolean } | null; // 답장이면 원래 메시지
  editedAt: string | null; // 고친 시각 (11/24)
  deleted: boolean; // 지운 메시지 (11/24)
}

const replyOf = (r: ChatReplyRef | null | undefined): ChatMsg["replyTo"] =>
  r ? { id: r.id, type: r.type, senderId: r.senderUserId, body: r.body, deleted: r.deleted ?? false } : null;

/** 한 방의 메시지 캐시 (쿼리 키 ["chat-rooms", roomId, "messages"]) */
export interface ChatThread {
  messages: ChatMsg[];
  partnerLastReadMessageId: number | null;
}

export function fromRest(m: ChatMessageOut): ChatMsg {
  return {
    id: m.id, type: m.type, body: m.body, senderId: m.senderUserId, refId: m.refId,
    contactWarning: m.contactWarning, createdAt: m.createdAt, attachmentUrl: m.attachmentUrl ?? null, replyTo: replyOf(m.replyTo),
    editedAt: m.editedAt ?? null, deleted: m.deleted ?? false,
  };
}

export function fromWs(m: WsChatMessage): ChatMsg {
  return {
    id: m.id, type: m.type, body: m.body, senderId: m.senderId, refId: m.refId,
    contactWarning: m.contactWarning, createdAt: m.createdAt, attachmentUrl: m.attachmentUrl ?? null, replyTo: replyOf(m.replyTo),
    editedAt: m.editedAt ?? null, deleted: m.deleted ?? false,
  };
}

export function threadFromRest(out: ChatMessagesOut): ChatThread {
  return { messages: out.messages.map(fromRest), partnerLastReadMessageId: out.partnerLastReadMessageId };
}

/** 같은 메시지가 REST 응답과 WebSocket 으로 두 번 와도 한 번만 (id 기준, 오래된 순) */
export function mergeMessages(old: ChatMsg[], add: ChatMsg[]): ChatMsg[] {
  const byId = new Map(old.map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** 상대가 읽은 위치는 뒤로 가지 않는다 */
export function laterRead(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** 목록·검색에 쓰는 마지막 메시지 글 */
export function previewOf(m: { type: ChatMessageType; body: string | null; deleted?: boolean } | null): string {
  if (!m) return "아직 메시지가 없어요";
  if (m.deleted) return "삭제된 메시지예요";
  switch (m.type) {
    case "TEXT":
      return m.body ?? "";
    case "IMAGE":
      return "사진";
    case "FILE":
      return "파일";
    case "QUOTE":
      return "견적서를 보냈어요";
    case "CONFIRM_REQUEST":
      return "최종 견적이 도착했어요";
    case "CONFIRMED":
      return "확정했어요";
    case "NOTICE":
      return m.body ?? "안내";
  }
}
