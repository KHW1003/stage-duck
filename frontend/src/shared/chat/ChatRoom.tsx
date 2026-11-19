/**
 * 대화방 (mockup-v4 chat-widget.js view="room" + v3 머리줄 [⋯] 고정 메뉴, D-56).
 * AC-F3-06: 시작 전 방 — 사용자는 [채팅 시작], 업체는 입력창이 막히고 안내
 * AC-F3-07: 남의 방(서버 404)은 열 수 없다는 안내만
 * AC-F3-08: 방을 열거나 새 메시지가 오면 POST read, 상대가 읽은 내 말풍선에 "읽음"
 * AC-F3-15: contactWarning 메시지 아래 플랫폼 밖 거래 경고
 * 최종 견적 카드·확정(#43)과 사진 보내기(다음 PR)는 여기서 만들지 않는다.
 */
import { OUTSIDE_PAYMENT_NOTICE } from "../../features/support/terms";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CHAT_ROOMS_KEY, markRead, useChatThread, useSendMessage, useStartChat } from "../../features/chat/api";
import { STAGE_NAME } from "../../features/performance/labels";
import { ApiError } from "../api/client";
import type { ChatRoom as Room } from "../api/types";
import { ErrorNotice } from "../ui/ErrorText";
import { Ico } from "../ui/Ico";
import type { ChatMsg } from "./normalize";
import { Avatar, PinMenuItem, dayLabel, msgTime } from "./parts";

const WARN = OUTSIDE_PAYMENT_NOTICE + " 연락처는 결제 후 최종 담당표에서 공개돼요.";

interface Props {
  roomId: number;
  room: Room | undefined;
  meId: number;
  role: "USER" | "SUPPLIER";
  onBack: () => void;
  onClose: () => void;
  onPin: (roomId: number, pin: boolean) => void;
}

/** 내역서 보기: 사용자는 단계별 비교 화면, 업체는 공고 화면 (견적서 상세 화면이 생기면 바꾼다) */
function quoteLink(room: Room, role: Props["role"]) {
  return role === "USER" ? `/performances/${room.performanceId}/compare` : `/supplier/postings/${room.stageId}`;
}

function Bubble({ m, mine, read, partner, room, role, onLeave }: {
  m: ChatMsg; mine: boolean; read: boolean; partner: string; room: Room; role: Props["role"]; onLeave: () => void;
}) {
  if (m.senderId === null) {
    if (m.type === "QUOTE") {
      return (
        <div className="c-card">
          <div className="c-card__head">
            <span>견적서</span>
          </div>
          <div className="c-card__body">
            <p className="c-card__meta">{role === "USER" ? `${partner}가 견적서를 보냈어요` : "견적서를 보냈어요"}</p>
          </div>
          <div className="c-card__foot">
            <Link to={quoteLink(room, role)} onClick={onLeave}>
              내역서 보기
            </Link>
          </div>
        </div>
      );
    }
    const text = m.type === "CONFIRM_REQUEST" ? "최종 견적이 도착했어요" : m.type === "CONFIRMED" ? "확정했어요" : (m.body ?? "안내");
    return <span className="room__sys">{text}</span>;
  }
  let content;
  if (m.type === "IMAGE" && m.attachmentUrl) {
    content = <img className="msg__photo" src={m.attachmentUrl} alt={`${mine ? "내가" : `${partner}가`} 보낸 사진`} />;
  } else {
    content = <p className="msg__b">{m.type === "IMAGE" ? "사진" : m.type === "FILE" ? "파일" : m.body}</p>;
  }
  return (
    <>
      <div className={mine ? "msg msg--me" : "msg"}>
        {content}
        <span className="msg__t">
          {mine && read && <span className="msg__read">읽음</span>}
          {msgTime(m.createdAt)}
        </span>
      </div>
      {m.contactWarning && (
        <div className="room__warn" role="note">
          <Ico name="warn" sm />
          <span>{WARN}</span>
        </div>
      )}
    </>
  );
}

function Composer({ roomId }: { roomId: number }) {
  const [text, setText] = useState("");
  const send = useSendMessage(roomId);
  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate({ type: "TEXT", body }, { onSuccess: () => setText("") });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <>
      {send.error && (
        <div className="chat-panel__err">
          <ErrorNotice error={send.error} />
        </div>
      )}
      <div className="composer">
        <textarea rows={1} placeholder="메시지를 입력하세요" aria-label="메시지" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
        <button className="btn btn--primary" type="button" aria-label="보내기" disabled={send.isPending || !text.trim()} onClick={submit}>
          <Ico name="send" sm />
        </button>
      </div>
    </>
  );
}

function StartBar({ roomId }: { roomId: number }) {
  const start = useStartChat(roomId);
  return (
    <div className="composer composer--start">
      <span>[채팅 시작]을 누르면 업체와 대화할 수 있어요.</span>
      <button className="btn btn--primary" type="button" disabled={start.isPending} onClick={() => start.mutate()}>
        채팅 시작
      </button>
      {start.error && <ErrorNotice error={start.error} />}
    </div>
  );
}

export function ChatRoom({ roomId, room, meId, role, onBack, onClose, onPin }: Props) {
  const qc = useQueryClient();
  const thread = useChatThread(roomId);
  const [menuOpen, setMenuOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const readSent = useRef(0);
  const messages = thread.data?.messages ?? [];
  const lastId = messages[messages.length - 1]?.id ?? 0;

  // AC-F3-08: 열어 둔 방의 마지막 메시지까지 읽음 (같은 위치는 한 번만)
  useEffect(() => {
    if (!lastId || lastId <= readSent.current) return;
    readSent.current = lastId;
    markRead(roomId, lastId)
      .then(() => qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY, exact: true }))
      .catch(() => {
        readSent.current = 0;
      });
  }, [lastId, roomId, qc]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const back = (
    <button className="icon-btn" type="button" aria-label="목록으로" onClick={onBack}>
      <Ico name="left" />
    </button>
  );
  const close = (
    <button className="icon-btn" type="button" aria-label="채팅 닫기" onClick={onClose}>
      <Ico name="x" />
    </button>
  );

  if (!room || thread.isError) {
    const notFound = thread.error instanceof ApiError && thread.error.status === 404;
    return (
      <>
        <div className="chat-panel__bar chat-panel__bar--room">
          {back}
          <div className="chat-panel__who" />
          {close}
        </div>
        <div className="chat-panel__body">
          <div className="chat-panel__empty">
            <Ico name="chat" />
            {notFound ? (
              <>
                <b>채팅방을 찾을 수 없어요.</b>
                <p>목록으로 돌아가 다른 대화를 골라 주세요.</p>
              </>
            ) : thread.isError ? (
              <ErrorNotice error={thread.error} />
            ) : (
              <p>불러오는 중이에요.</p>
            )}
          </div>
        </div>
      </>
    );
  }

  const partnerRead = thread.data?.partnerLastReadMessageId ?? 0;
  const started = room.startedAt !== null;
  let lastDay = "";

  return (
    <>
      <div className="chat-panel__bar chat-panel__bar--room">
        {back}
        <div className="chat-panel__who">
          <Avatar name={room.partnerName} />
          <div>
            <b>
              {room.partnerName} <span className="tag">{STAGE_NAME[room.stageType]}</span>
            </b>
            <small>{started ? "대화 중" : "채팅 시작 전"}</small>
          </div>
        </div>
        <span className="cw-more">
          <button className="icon-btn" type="button" aria-label="더보기" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Ico name="more" />
          </button>
          {menuOpen && (
            <span className="cw-menu" role="menu" aria-label="대화방 메뉴">
              <PinMenuItem
                pinned={room.pinnedAt !== null}
                onClick={() => {
                  setMenuOpen(false);
                  onPin(room.roomId, room.pinnedAt === null);
                }}
              />
            </span>
          )}
        </span>
        {close}
      </div>
      <div className="chat-panel__body">
        <div className="room__msgs" ref={listRef}>
          {messages.map((m) => {
            const day = dayLabel(m.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <Fragment key={m.id}>
                {showDay && <span className="room__day">{day}</span>}
                <Bubble
                  m={m}
                  mine={m.senderId === meId}
                  read={m.id <= partnerRead}
                  partner={room.partnerName}
                  room={room}
                  role={role}
                  onLeave={onClose}
                />
              </Fragment>
            );
          })}
        </div>
        {started ? (
          <Composer roomId={roomId} />
        ) : role === "USER" ? (
          <StartBar roomId={roomId} />
        ) : (
          <div className="composer composer--locked">
            <Ico name="lock" sm />
            사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.
          </div>
        )}
      </div>
    </>
  );
}
