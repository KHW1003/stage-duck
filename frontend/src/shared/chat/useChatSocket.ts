/**
 * 실시간 받기 (api-contract.md 7장): GET /ws 하나로 내 채팅방 이벤트를 받는다. 보내기는 REST.
 * - message.created: 그 방 캐시에 말풍선을 더하고 목록(마지막 메시지·안 읽은 수)을 새로 받는다 (AC-F3-08)
 * - message.read: 상대가 읽은 위치를 옮긴다 → 내 말풍선에 "읽음"
 * - quote.updated: 그 방 메시지와 목록을 새로 받는다
 * - notification: 알림을 새로 받고, CHAT_STARTED 면 목록(startedAt)도 새로 받는다
 * 끊기면 다시 연결하고, 다시 연결되면 열어 둔 방마다 ?after=마지막 id 로 빠진 메시지를 채운다.
 */
import { confirmKey } from "../../features/confirm/api";
import { NOTIFICATIONS_KEY } from "../../features/notification/api";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CHAT_ROOMS_KEY, addToThread, fetchThread, messagesKey } from "../../features/chat/api";
import type { WsChatEvent } from "../api/types";
import { syncStatus } from "../auth/SuspensionGate";
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
  // 사이트 안 알림 (#45): 같은 연결로 온다. 목록·안 읽은 수를 다시 받는다
  if ((e as { type: string }).type === "notification") {
    void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    if ((e as unknown as { data: { type?: unknown } }).data.type === "ACCOUNT_SUSPENDED") void syncStatus(qc);
    // 채팅 시작 알림(CHAT_STARTED)은 업체 쪽 방의 startedAt 을 바꾼다 → 목록을 다시 받아 입력창을 연다 (AC-F3-06)
    if ((e as unknown as { data: { type?: unknown } }).data.type === "CHAT_STARTED") {
      void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true });
    }
    return;
  }
  // 최종 견적 카드 상태 (#43, api-contract.md 7장 confirm.updated)
  if ((e as { type: string }).type === "confirm.updated") {
    void qc.invalidateQueries({ queryKey: confirmKey((e as unknown as { data: { confirmRequestId: number } }).data.confirmRequestId) });
    return;
  }
  const key = messagesKey(e.data.roomId);
  if (e.type === "message.created" || e.type === "message.updated") {
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
      ws.onclose = (e?: CloseEvent) => {
        if (stopped) return;
        dropped = true;
        // 4401(로그인·정지로 막힘)은 열렸다가 바로 닫힌다 → 1초마다 되풀이하지 않게 가장 길게 쉬고, 정지됐는지 확인한다
        const refused = e?.code === 4401;
        if (refused) void syncStatus(qc);
        timer = setTimeout(connect, refused ? socketTiming.maxMs : Math.min(socketTiming.retryMs * 2 ** attempt, socketTiming.maxMs));
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
