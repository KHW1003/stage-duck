/**
 * 떠 있는 채팅 위젯 (D-42, mockup-v4 chat-widget.js·css/chat.css, 상단 고정은 mockup-v3 — D-56).
 * - 로그인한 사용자·승인 업체에게만 오른쪽 아래 둥근 버튼(안 읽은 수) → 누르면 목록 창 (AppLayout 이 부른다)
 * - 창이 열려 있으면 뒤 화면 스크롤을 잠그고, 창 밖을 누르거나 Esc 를 누르면 닫힌다
 * - 주소에 ?chat=<roomId> 가 붙어 오면(견적서 완료 화면의 [채팅방으로]) 그 방을 연다
 * - 열린 상태는 AppLayout 안에 있어서 화면을 옮겨도 이어진다
 * - 실시간 받기는 useChatSocket (api-contract.md 7장)
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useChatRooms, useMarkRoomRead, usePinRoom } from "../../features/chat/api";
import type { Me } from "../api/types";
import { Ico } from "../ui/Ico";
import { ChatList } from "./ChatList";
import { ChatRoom } from "./ChatRoom";
import type { ListFilter } from "./listView";
import { useChatSocket } from "./useChatSocket";
import "./chat.css";

export function ChatWidget({ me }: { me: Me }) {
  const role = me.role === "SUPPLIER" ? "SUPPLIER" : "USER";
  const rooms = useChatRooms();
  const pin = usePinRoom();
  const readRoom = useMarkRoomRead();
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(false);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [filter, setFilter] = useState<ListFilter>({ q: "", unreadOnly: false, sort: "new" });
  const [searching, setSearching] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const [params, setParams] = useSearchParams();
  const chatParam = params.get("chat");

  useChatSocket(me.id);

  // ?chat=<roomId> → 그 방을 열고 주소에서는 지운다 (뒤로 가기·새로고침에 다시 열리지 않게)
  useEffect(() => {
    if (chatParam === null) return;
    const id = Number(chatParam);
    if (Number.isInteger(id) && id > 0) {
      setRoomId(id);
      setOpen(true);
      setPop(true);
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("chat");
        return next;
      },
      { replace: true },
    );
  }, [chatParam, setParams]);

  // 열려 있는 동안 뒤 화면 스크롤 잠금 + 창 밖 누르기·Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("chat-open");
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || fabRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("chat-open");
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = rooms.data ?? [];
  const unread = list.reduce((n, r) => n + r.unreadCount, 0);
  const onPin = (id: number, on: boolean) => pin.mutate({ roomId: id, pin: on });
  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={fabRef}
        className="chat-fab"
        type="button"
        aria-expanded={open}
        aria-label={`채팅 ${open ? "닫기" : "열기"}${unread ? ` · 안 읽은 대화 ${unread}개` : ""}`}
        onClick={() => {
          setOpen(!open);
          setPop(true);
        }}
      >
        <Ico name="chat" className="chat-fab__open" />
        <Ico name="x" className="chat-fab__close" />
        {unread > 0 && <span className="chat-fab__badge">{unread}</span>}
      </button>
      {open && (
        <section ref={panelRef} className={`chat-panel${pop ? " is-pop" : ""}`} role="dialog" aria-label="채팅">
          {roomId === null ? (
            <ChatList
              rooms={list}
              role={role}
              filter={filter}
              onFilter={setFilter}
              searching={searching}
              onSearching={(on) => {
                setSearching(on);
                if (!on) setFilter({ ...filter, q: "" });
              }}
              onOpen={setRoomId}
              onPin={onPin}
              onRead={(id, lastMessageId) => readRoom.mutate({ roomId: id, lastMessageId })}
              onClose={close}
            />
          ) : (
            <ChatRoom
              key={roomId}
              roomId={roomId}
              room={list.find((r) => r.roomId === roomId)}
              meId={me.id}
              role={role}
              onBack={() => setRoomId(null)}
              onClose={close}
              onPin={onPin}
            />
          )}
        </section>
      )}
    </>
  );
}
