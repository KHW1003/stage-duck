/**
 * 채팅 목록 (mockup-v4 chat-widget.js view="list" + v3 상단 고정, D-56).
 * AC-F3-26: 검색(이름·마지막 메시지, 찾은 글자 표시) · [안 읽음만] · [최신순⇄과거순] — 화면에서만 거른다
 * AC-F3-27: 고정한 방은 위 + 핀 배지. 오른쪽 클릭 메뉴로 [상단에 고정]/[고정 해제]·[읽음으로 표시]
 */
import { useState } from "react";
import type { ChatRoom } from "../api/types";
import { Ico } from "../ui/Ico";
import { STAGE_NAME } from "../../features/performance/labels";
import { type ListFilter, listRooms, splitHits } from "./listView";
import { previewOf } from "./normalize";
import { Avatar, PinIcon, PinMenuItem, listTime } from "./parts";

interface Props {
  rooms: ChatRoom[];
  role: "USER" | "SUPPLIER";
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  searching: boolean;
  onSearching: (on: boolean) => void;
  onOpen: (roomId: number) => void;
  onPin: (roomId: number, pin: boolean) => void;
  onRead: (roomId: number, lastMessageId: number) => void;
  onClose: () => void;
  /** 목록을 불러오지 못했을 때 (빈 목록과 구분해서 알린다) */
  loadError?: boolean;
}

function Hit({ text, q }: { text: string; q: string }) {
  return (
    <>
      {splitHits(text, q).map((p, i) =>
        p.hit ? (
          <mark key={i} className="chat-panel__hit">
            {p.text}
          </mark>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

const NOTE = {
  USER: "견적서를 보고 [채팅 시작]을 누르면 그 업체와 대화가 여기에 생겨요.",
  SUPPLIER: "공고에 견적서를 보내면 그 사용자와의 대화가 여기에 생겨요.",
};

export function ChatList({ rooms, role, filter, onFilter, searching, onSearching, onOpen, onPin, onRead, onClose, loadError }: Props) {
  const [menu, setMenu] = useState<{ roomId: number; x: number; y: number } | null>(null);
  const q = searching ? filter.q : "";
  const shown = listRooms(rooms, { ...filter, q });
  const unread = rooms.reduce((n, r) => n + r.unreadCount, 0);
  const menuRoom = menu ? rooms.find((r) => r.roomId === menu.roomId) : undefined;
  const note = (
    <p className="chat-panel__note">
      <Ico name="info" />
      <span>{NOTE[role]}</span>
    </p>
  );

  let empty: [string, string] | null = null;
  if (shown.length === 0) {
    if (loadError) empty = ["대화 목록을 불러오지 못했어요", "인터넷 연결을 확인하고 채팅 창을 다시 열어 주세요."];
    else if (q.trim()) empty = [`‘${q.trim()}’에 맞는 대화가 없어요`, "이름이나 메시지에 있는 말로 찾아 보세요."];
    else if (filter.unreadOnly) empty = ["안 읽은 대화가 없어요", "새 메시지가 오면 여기에 보여요."];
    else empty = ["채팅이 아직 없어요", role === "USER" ? "앞 단계를 확정하면 다음 단계 업체의 견적서를 받을 수 있어요." : "공고 목록에서 견적서를 보내 보세요."];
  }

  return (
    <>
      {searching ? (
        <div className="chat-panel__bar chat-panel__bar--search">
          <button className="icon-btn" type="button" aria-label="검색 닫기" onClick={() => onSearching(false)}>
            <Ico name="left" />
          </button>
          <input
            className="chat-panel__q"
            type="search"
            placeholder="이름이나 메시지로 찾기"
            aria-label="채팅 검색"
            autoFocus
            value={filter.q}
            onChange={(e) => onFilter({ ...filter, q: e.target.value })}
          />
          <button className="chat-panel__cancel" type="button" onClick={() => onFilter({ ...filter, q: "" })}>
            취소
          </button>
        </div>
      ) : (
        <div className="chat-panel__bar">
          <p className="chat-panel__title">
            채팅<small>{unread ? `안 읽음 ${unread}` : "모두 읽음"}</small>
          </p>
          <button className="icon-btn" type="button" aria-label="채팅 검색" onClick={() => onSearching(true)}>
            <Ico name="search" />
          </button>
          <button className="icon-btn" type="button" aria-label="채팅 닫기" onClick={onClose}>
            <Ico name="x" />
          </button>
        </div>
      )}
      <div className="chat-panel__ctx">
        <div className="chat-panel__tools">
          <span>
            대화 <b>{shown.length}</b>개
          </span>
          <span className="chat-panel__tools-r">
            <button
              className="chat-panel__tbtn"
              type="button"
              aria-pressed={filter.unreadOnly}
              onClick={() => onFilter({ ...filter, unreadOnly: !filter.unreadOnly })}
            >
              <span className="chat-panel__box" aria-hidden="true" />
              안 읽음만
            </button>
            <span className="chat-panel__sep" aria-hidden="true" />
            <button
              className="chat-panel__tbtn"
              type="button"
              aria-label={`정렬 바꾸기, 지금 ${filter.sort === "old" ? "과거순" : "최신순"}`}
              onClick={() => onFilter({ ...filter, sort: filter.sort === "old" ? "new" : "old" })}
            >
              ⇅ {filter.sort === "old" ? "과거순" : "최신순"}
            </button>
          </span>
        </div>
      </div>
      <div className="chat-panel__body">
        <div className="chat-panel__scroll">
          {empty ? (
            <>
              <div className="chat-panel__empty">
                <Ico name={q.trim() ? "search" : "chat"} />
                <b>{empty[0]}</b>
                <p>{empty[1]}</p>
              </div>
              {!q.trim() && note}
            </>
          ) : (
            <>
              <ul className="chat-panel__list" aria-label="채팅 목록">
                {shown.map((r) => (
                  <li key={r.roomId} data-room={r.roomId}>
                    <button
                      className={`chat-item${r.unreadCount ? " is-unread" : ""}`}
                      type="button"
                      onClick={() => onOpen(r.roomId)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ roomId: r.roomId, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <span className="chat-item__av">
                        <Avatar name={r.partnerName} />
                        {r.pinnedAt && (
                          <span className="chat-item__pin" role="img" aria-label="고정됨">
                            <PinIcon />
                          </span>
                        )}
                      </span>
                      <span className="chat-item__text">
                        <span className="chat-item__name">
                          <span>
                            <Hit text={r.partnerName} q={q} />
                          </span>
                          <span className="tag">{STAGE_NAME[r.stageType]}</span>
                        </span>
                        <span className="chat-item__last">
                          <Hit text={previewOf(r.lastMessage)} q={q} />
                        </span>
                      </span>
                      <span className="chat-item__side">
                        {r.lastMessage && listTime(r.lastMessage.createdAt)}
                        {r.unreadCount > 0 && <span className="count">{r.unreadCount}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!q.trim() && note}
            </>
          )}
        </div>
      </div>
      {menu && menuRoom && (
        <div
          className="cw-menu cw-menu--ctx"
          role="menu"
          aria-label={`${menuRoom.partnerName} 메뉴`}
          style={{ left: menu.x, top: menu.y }}
        >
          <PinMenuItem
            pinned={menuRoom.pinnedAt !== null}
            onClick={() => {
              setMenu(null);
              onPin(menuRoom.roomId, menuRoom.pinnedAt === null);
            }}
          />
          {menuRoom.lastMessage && (
            <button
              className="cw-menu__item"
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                if (menuRoom.lastMessage) onRead(menuRoom.roomId, menuRoom.lastMessage.id);
              }}
            >
              <Ico name="check" />
              읽음으로 표시
            </button>
          )}
        </div>
      )}
      {menu && <div className="cw-menu__veil" onMouseDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />}
    </>
  );
}
