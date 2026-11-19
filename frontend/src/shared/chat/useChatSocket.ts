/**
 * 실시간 받기 (api-contract.md 7장): GET /ws 하나로 내 채팅방 이벤트를 받는다. 보내기는 REST.
 * - message.created: 그 방 캐시에 말풍선을 더하고 목록(마지막 메시지·안 읽은 수)을 새로 받는다 (AC-F3-08)
 * - message.read: 상대가 읽은 위치를 옮긴다 → 내 말풍선에 "읽음"
 * - quote.updated: 그 방 메시지와 목록을 새로 받는다
 * 끊기면 다시 연결하고, 다시 연결되면 열어 둔 방마다 ?after=마지막 id 로 빠진 메시지를 채운다.
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CHAT_ROOMS_KEY, addToThread, fetchThread, messagesKey } from "../../features/chat/api";
import type { WsChatEvent } from "../api/types";
import { type ChatThread, fromWs, laterRead } from "./normalize";

/** 다시 연결 대기 (처음 1초, 두 배씩, 최대 10초). 테스트에서 0 으로 바꾼다 */
export const socketTiming = { retryMs: 1000, maxMs: 10_000 };

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

function parse(raw: unknown): WsChatEvent | null {
  if (typeof raw !== "string") return null;
  try {
    const e = JSON.parse(raw) as { type?: unknown; data?: unknown };
    if (typeof e.type !== "string" || typeof e.data !== "object" || e.data === null) return null;
    return e as WsChatEvent;
  } catch {
    return null;
  }
}

function handle(qc: QueryClient, e: WsChatEvent, meId: number) {
  const key = messagesKey(e.data.roomId);
  if (e.type === "message.created") {
    qc.setQueryData<ChatThread>(key, (old) =>
      addToThread(old, { messages: [fromWs(e.data.message)], partnerLastReadMessageId: null }),
    );
    void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
  } else if (e.type === "message.read") {
    if (e.data.userId === meId) return;
    const last = e.data.lastMessageId;
    qc.setQueryData<ChatThread>(key, (old) =>
      old ? { ...old, partnerLastReadMessageId: laterRead(old.partnerLastReadMessageId, last) } : old,
    );
  } else if (e.type === "quote.updated") {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
  }
}

/** 다시 연결된 뒤: 캐시에 있는 방마다 마지막 id 뒤의 메시지를 받아 더한다 */
async function backfill(qc: QueryClient) {
  const threads = qc.getQueriesData<ChatThread>({ queryKey: CHAT_ROOMS_KEY });
  await Promise.all(
    threads.map(async ([key, thread]) => {
      const roomId = key[1];
      if (typeof roomId !== "number" || !thread) return;
      const last = thread.messages[thread.messages.length - 1]?.id;
      try {
        const add = await fetchThread(roomId, last);
        qc.setQueryData<ChatThread>(messagesKey(roomId), (old) => addToThread(old, add));
      } catch {
        void qc.invalidateQueries({ queryKey: messagesKey(roomId) });
      }
    }),
  );
  void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
}

export function useChatSocket(meId: number) {
  const qc = useQueryClient();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let dropped = false;
    let stopped = false;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        attempt = 0;
        if (dropped) void backfill(qc);
      };
      ws.onmessage = (m: MessageEvent) => {
        const e = parse(m.data);
        if (e) handle(qc, e, meId);
      };
      ws.onclose = () => {
        if (stopped) return;
        dropped = true;
        timer = setTimeout(connect, Math.min(socketTiming.retryMs * 2 ** attempt, socketTiming.maxMs));
        attempt += 1;
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [qc, meId]);
}
