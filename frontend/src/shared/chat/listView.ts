/**
 * 채팅 목록 거르기·정렬 (AC-F3-26·27). 서버 API 를 늘리지 않고 GET /chat-rooms 결과를 화면에서 거른다.
 * 정렬: 고정한 방 묶음 → 나머지 묶음, 묶음 안은 최근 대화순. [최신순⇄과거순]은 두 묶음을 각각 뒤집는다 (D-56).
 */
import type { ChatRoom } from "../api/types";
import { previewOf } from "./normalize";

export type ListSort = "new" | "old";

export interface ListFilter {
  q: string;
  unreadOnly: boolean;
  sort: ListSort;
}

/** 메시지 id 는 늘어나기만 하므로 마지막 메시지 id 로 최근 대화순을 정한다 */
const recency = (r: ChatRoom) => r.lastMessage?.id ?? 0;

function has(text: string, q: string) {
  return text.toLowerCase().includes(q.toLowerCase());
}

export function listRooms(rooms: ChatRoom[], f: ListFilter): ChatRoom[] {
  const q = f.q.trim();
  const shown = rooms.filter(
    (r) => (!f.unreadOnly || r.unreadCount > 0) && (!q || has(r.partnerName, q) || has(previewOf(r.lastMessage), q)),
  );
  const byRecent = (a: ChatRoom, b: ChatRoom) => recency(b) - recency(a) || b.roomId - a.roomId;
  const group = (pinned: boolean) => {
    const g = shown.filter((r) => (r.pinnedAt !== null) === pinned).sort(byRecent);
    return f.sort === "old" ? g.reverse() : g;
  };
  return [...group(true), ...group(false)];
}

/** 찾은 글자 위치 (대소문자 무시). 화면은 이 조각들로 <mark> 를 만든다 */
export function splitHits(text: string, q: string): { text: string; hit: boolean }[] {
  const k = q.trim();
  if (!k) return [{ text, hit: false }];
  const low = text.toLowerCase();
  const kk = k.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  for (let j = low.indexOf(kk); j > -1; j = low.indexOf(kk, i)) {
    if (j > i) out.push({ text: text.slice(i, j), hit: false });
    out.push({ text: text.slice(j, j + k.length), hit: true });
    i = j + k.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}
