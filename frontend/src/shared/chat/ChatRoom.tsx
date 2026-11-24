/**
 * 대화방 (mockup-v4 chat-widget.js view="room" + v3 머리줄 [⋯] 고정 메뉴, D-56).
 * AC-F3-06: 시작 전 방 — 사용자는 [채팅 시작], 업체는 입력창이 막히고 안내
 * AC-F3-07: 남의 방(서버 404)은 열 수 없다는 안내만
 * AC-F3-08: 방을 열거나 새 메시지가 오면 POST read, 상대가 읽은 내 말풍선에 "읽음"
 * AC-F3-15: contactWarning 메시지 아래 플랫폼 밖 거래 경고
 * AC-F3-08: [사진 보내기](jpg·png·webp → IMAGE)·[파일 보내기](pdf → FILE), 10MB. 사진은 누르면 새 창에서 크게 보기
 * 최종 견적 카드·확정(#43)은 여기서 만들지 않는다.
 * 링크(11/24): 글 속 http·https·www. 주소는 눌러서 새 창으로 연다
 * 예전 대화(11/24): 위로 올리면 50개씩 더 불러오고, 보던 자리를 지킨다
 * 수정·삭제(11/24): 내 글 메시지는 [수정], 내 메시지는 [삭제] → "삭제된 메시지예요"로 남는다
 * 답장(11/24): 말풍선 옆 꺾인 화살표 → 입력창 위에 인용 → 보내면 말풍선 위에 원문. 인용을 누르면 원래 메시지로 이동
 */
import { OUTSIDE_PAYMENT_NOTICE } from "../../features/support/terms";
import { ConfirmRequestCard, ConfirmedCard } from "../../features/confirm/ConfirmCards";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, Fragment, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ATTACH_RULES,
  type AttachType,
  CHAT_ROOMS_KEY,
  OLDER_PAGE,
  addToThread,
  attachmentProblem,
  fetchOlder,
  markRead,
  messagesKey,
  useDeleteMessage,
  useEditMessage,
  useChatThread,
  useSendAttachment,
  useSendMessage,
  useStartChat,
} from "../../features/chat/api";
import { STAGE_NAME } from "../../features/performance/labels";
import { ApiError } from "../api/client";
import type { ChatRoom as Room } from "../api/types";
import { ErrorNotice } from "../ui/ErrorText";
import { Ico } from "../ui/Ico";
import type { ChatMsg, ChatThread } from "./normalize";
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

/** 내역서 보기: 견적서 문서 화면 (QUOTE 메시지 refId = 견적서 버전 번호). 번호가 없으면 예전처럼 비교·공고 화면 */
function quoteLink(room: Room, role: Props["role"], versionId: number | null) {
  if (versionId) return `/quotes/by-version/${versionId}`;
  return role === "USER" ? `/performances/${room.performanceId}/compare` : `/supplier/postings/${room.stageId}`;
}

/**
 * 글 속 링크(http·https·www.)를 눌러 열 수 있게 (11/24). 새 창으로 열고 이 사이트 정보는 넘기지 않는다 (noopener noreferrer).
 * 끝에 붙은 마침표·쉼표·괄호는 링크에서 뺀다. 다른 형식(javascript: 등)은 글자 그대로 둔다.
 */
const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const trail = /[.,!?)\]}'"…]+$/.exec(part)?.[0] ?? "";
        const url = trail ? part.slice(0, -trail.length) : part;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return (
          <Fragment key={i}>
            <a className="msg__link" href={href} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
            {trail}
          </Fragment>
        );
      })}
    </>
  );
}

/** 답장 인용에 보이는 원문 한 줄 */
function replyText(r: { type: ChatMsg["type"]; body: string | null; deleted?: boolean }): string {
  if (r.deleted) return "삭제된 메시지예요";
  if (r.type === "IMAGE") return "사진";
  if (r.type === "FILE") return r.body ? `파일 · ${r.body}` : "파일";
  return r.body ?? "";
}

interface MsgActions {
  onReply: (m: ChatMsg) => void;
  onJump: (id: number) => void;
  onEdit: (id: number, body: string) => Promise<unknown>;
  onDelete: (id: number) => void;
  busy: boolean;
}

/** 내 글 메시지 고치기: 말풍선 자리에서 바로 (Enter 저장, Esc 취소) */
function EditBox({ m, onEdit, onDone }: { m: ChatMsg; onEdit: MsgActions["onEdit"]; onDone: () => void }) {
  const [text, setText] = useState(m.body ?? "");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const body = text.trim();
    if (!body || saving) return;
    if (body === m.body) return onDone();
    setSaving(true);
    try {
      await onEdit(m.id, body);
      onDone();
    } catch (e) {
      setError(e);
      setSaving(false);
    }
  };
  return (
    <div className="msg__edit">
      <textarea
        autoFocus
        rows={2}
        aria-label="메시지 고치기"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <div className="msg__edit-acts">
        <button type="button" className="btn btn--sm" onClick={onDone} disabled={saving}>
          취소
        </button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => void save()} disabled={saving || !text.trim()}>
          저장
        </button>
      </div>
      {error ? <ErrorNotice error={error} /> : null}
    </div>
  );
}

function Bubble({ m, mine, read, partner, meId, room, role, onLeave, acts }: {
  m: ChatMsg; mine: boolean; read: boolean; partner: string; meId: number; room: Room; role: Props["role"]; onLeave: () => void;
  acts: MsgActions;
}) {
  const [editing, setEditing] = useState(false);
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
            <Link to={quoteLink(room, role, m.refId)} onClick={onLeave}>
              내역서 보기
            </Link>
          </div>
        </div>
      );
    }
    // #43 최종 견적 카드 · 확정 완료 카드 (refId = 카드 번호)
    if (m.type === "CONFIRM_REQUEST" && m.refId) return <ConfirmRequestCard id={m.refId} role={role} partner={partner} onLeave={onLeave} />;
    if (m.type === "CONFIRMED" && m.refId) return <ConfirmedCard id={m.refId} role={role} onLeave={onLeave} />;
    const text = m.type === "CONFIRM_REQUEST" ? "최종 견적이 도착했어요" : m.type === "CONFIRMED" ? "확정했어요" : (m.body ?? "안내");
    return <span className="room__sys">{text}</span>;
  }
  let content;
  if (m.deleted) {
    content = <p className="msg__b msg__b--deleted">삭제된 메시지예요</p>;
  } else if (editing) {
    content = <EditBox m={m} onEdit={acts.onEdit} onDone={() => setEditing(false)} />;
  } else if (m.type === "IMAGE" && m.attachmentUrl) {
    // 누르면 새 창에서 크게 보기 (비공개 파일이라 그 방 참여자만 열림)
    content = (
      <a className="msg__photo-link" href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
        <img className="msg__photo" src={m.attachmentUrl} alt={`${mine ? "내가" : `${partner}가`} 보낸 사진`} />
      </a>
    );
  } else if (m.type === "FILE") {
    const name = m.body ?? "파일";
    content = (
      <div className="msg__b msg__file">
        <Ico name="file" sm />
        <span className="msg__file-name">{name}</span>
        {m.attachmentUrl && (
          <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer" aria-label={`${name} 내려받기`}>
            내려받기
          </a>
        )}
      </div>
    );
  } else {
    content = <p className="msg__b">{m.type === "IMAGE" ? "사진" : <Linkified text={m.body ?? ""} />}</p>;
  }
  const quoted = m.deleted ? null : m.replyTo;
  const who = (id: number | null) => (id === meId ? "나" : partner);
  return (
    <>
      <div className={mine ? "msg msg--me" : "msg"} data-msg-id={m.id}>
        <div className="msg__col">
          {quoted && (
            <button type="button" className="msg__quote" onClick={() => acts.onJump(quoted.id)} aria-label={`${who(quoted.senderId)}의 메시지로 이동: ${replyText(quoted)}`}>
              <span className="msg__quote-who">
                <Ico name="reply" sm />
                {who(quoted.senderId)}에게 답장
              </span>
              <span className="msg__quote-text">{replyText(quoted)}</span>
            </button>
          )}
          {content}
        </div>
        {!m.deleted && !editing && (
          <span className="msg__acts">
            <button type="button" className="msg__act" aria-label="답장" title="답장" onClick={() => acts.onReply(m)}>
              <Ico name="reply" sm />
            </button>
            {mine && m.type === "TEXT" && (
              <button type="button" className="msg__act" aria-label="수정" title="수정" disabled={acts.busy} onClick={() => setEditing(true)}>
                <Ico name="edit" sm />
              </button>
            )}
            {mine && (
              <button type="button" className="msg__act" aria-label="삭제" title="삭제" disabled={acts.busy} onClick={() => acts.onDelete(m.id)}>
                <Ico name="trash" sm />
              </button>
            )}
          </span>
        )}
        <span className="msg__t">
          {mine && read && <span className="msg__read">읽음</span>}
          {m.editedAt && !m.deleted && <span className="msg__edited">수정됨</span>}
          {msgTime(m.createdAt)}
        </span>
      </div>
      {m.contactWarning && !m.deleted && (
        <div className="room__warn" role="note">
          <Ico name="warn" sm />
          <span>{WARN}</span>
        </div>
      )}
    </>
  );
}

function Composer({ roomId, replyTo, replyName, onClearReply }: {
  roomId: number; replyTo: ChatMsg | null; replyName: string; onClearReply: () => void;
}) {
  const [text, setText] = useState("");
  const [pickError, setPickError] = useState<string | null>(null);
  const send = useSendMessage(roomId);
  const attach = useSendAttachment(roomId);
  const photoInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // 답장을 고르면 바로 입력창으로
  useEffect(() => {
    if (replyTo) textRef.current?.focus();
  }, [replyTo]);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = send.isPending || attach.isPending;
  const clearErrors = () => {
    setPickError(null);
    send.reset();
    attach.reset();
  };
  const submit = () => {
    const body = text.trim();
    if (!body || busy) return;
    clearErrors();
    send.mutate(replyTo ? { type: "TEXT", body, replyToId: replyTo.id } : { type: "TEXT", body }, {
      onSuccess: () => {
        setText("");
        onClearReply();
      },
    });
  };
  /** AC-F3-08: 고른 파일을 형식·크기로 먼저 보고, 맞으면 올린 뒤 메시지로 보낸다 */
  const onPick = (type: AttachType) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    clearErrors();
    const problem = attachmentProblem(type, file);
    if (problem) {
      setPickError(problem);
      return;
    }
    attach.mutate({ type, file, replyToId: replyTo?.id ?? null }, { onSuccess: onClearReply });
  };
  const error = send.error ?? attach.error;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <>
      {pickError && (
        <div className="chat-panel__err">
          <p className="composer__hint" role="alert">
            <Ico name="warn" sm />
            {pickError}
          </p>
        </div>
      )}
      {error && (
        <div className="chat-panel__err">
          <ErrorNotice error={error} />
        </div>
      )}
      {replyTo && (
        <div className="composer__reply" role="status">
          <Ico name="reply" sm />
          <div className="composer__reply-main">
            <b>{replyName}에게 답장</b>
            <span>{replyText(replyTo)}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="답장 취소" onClick={onClearReply}>
            <Ico name="x" sm />
          </button>
        </div>
      )}
      {attach.isPending && (
        <p className="composer__status" role="status">
          올리는 중이에요…
        </p>
      )}
      <div className="composer">
        <button className="icon-btn" type="button" aria-label="사진 보내기" disabled={busy} onClick={() => photoInput.current?.click()}>
          <Ico name="image" />
        </button>
        <button className="icon-btn" type="button" aria-label="파일 보내기" disabled={busy} onClick={() => fileInput.current?.click()}>
          <Ico name="clip" />
        </button>
        <input ref={photoInput} type="file" hidden accept={ATTACH_RULES.IMAGE.accept} aria-label="사진 고르기" onChange={onPick("IMAGE")} />
        <input ref={fileInput} type="file" hidden accept={ATTACH_RULES.FILE.accept} aria-label="파일 고르기" onChange={onPick("FILE")} />
        <textarea ref={textRef} rows={1} placeholder={replyTo ? "답장을 입력하세요" : "메시지를 입력하세요"} aria-label="메시지" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Escape" && replyTo) onClearReply();
          onKey(e);
        }} />
        <button className="btn btn--primary" type="button" aria-label="보내기" disabled={busy || !text.trim()} onClick={submit}>
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
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const editMsg = useEditMessage(roomId);
  const deleteMsg = useDeleteMessage(roomId);
  const acts: MsgActions = {
    onReply: setReplyTo,
    onJump: (id) => jumpTo(id),
    onEdit: (id, body) => editMsg.mutateAsync({ id, body }),
    onDelete: (id) => {
      if (window.confirm("이 메시지를 삭제할까요? 상대방 화면에서도 \"삭제된 메시지예요\"로 바뀌어요.")) deleteMsg.mutate(id);
    },
    busy: editMsg.isPending || deleteMsg.isPending,
  };
  // 예전 대화: 위 끝에 닿으면 50개씩 더. 처음 받은 것이 50개보다 적으면 더 없음
  const [older, setOlder] = useState<{ loading: boolean; done: boolean | null; error: unknown }>({ loading: false, done: null, error: null });
  const keepFrom = useRef<{ height: number; top: number } | null>(null);
  /** 인용을 누르면 원래 메시지로 스크롤하고 잠깐 강조 */
  const jumpTo = (id: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-msg-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("msg--flash");
    window.setTimeout(() => el.classList.remove("msg--flash"), 1200);
  };
  const readSent = useRef(0);
  const messages = thread.data?.messages ?? [];
  const lastId = messages[messages.length - 1]?.id ?? 0;
  const firstId = messages[0]?.id ?? 0;
  const hasMore = older.done === null ? messages.length >= OLDER_PAGE : !older.done;

  const loadOlder = async () => {
    const el = listRef.current;
    if (!el || older.loading || !hasMore || !firstId) return;
    keepFrom.current = { height: el.scrollHeight, top: el.scrollTop };
    setOlder((o) => ({ ...o, loading: true, error: null }));
    try {
      const page = await fetchOlder(roomId, firstId);
      qc.setQueryData<ChatThread>(messagesKey(roomId), (old) => addToThread(old, { ...page, partnerLastReadMessageId: null }));
      setOlder({ loading: false, done: page.messages.length < OLDER_PAGE, error: null });
    } catch (e) {
      keepFrom.current = null;
      setOlder((o) => ({ ...o, loading: false, error: e }));
    }
  };
  // 앞에 메시지가 붙으면 보던 말풍선이 그 자리에 있게 (늘어난 높이만큼 내린다)
  useLayoutEffect(() => {
    const el = listRef.current;
    const from = keepFrom.current;
    if (!el || !from) return;
    el.scrollTop = el.scrollHeight - from.height + from.top;
    keepFrom.current = null;
  }, [firstId]);

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
  // 머리줄 아래 [견적서 보기]: 불러온 메시지 가운데 가장 최근 QUOTE 의 refId(견적서 버전). 없으면 숨긴다
  const latestQuoteVersion = messages.reduce<number | null>((found, m) => (m.type === "QUOTE" && m.refId ? m.refId : found), null);
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
      {latestQuoteVersion !== null && (
        <div className="chat-panel__quote">
          <Link to={`/quotes/by-version/${latestQuoteVersion}`} onClick={onClose}>
            견적서 보기
          </Link>
        </div>
      )}
      <div className="chat-panel__body">
        <div
          className="room__msgs"
          ref={listRef}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop < 60) void loadOlder();
          }}
        >
          {hasMore && (
            <div className="room__older">
              {older.error ? (
                <button type="button" className="btn btn--sm" onClick={() => void loadOlder()}>
                  예전 대화 다시 불러오기
                </button>
              ) : older.loading ? (
                <span role="status">예전 대화를 불러오는 중이에요…</span>
              ) : (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => void loadOlder()}>
                  예전 대화 더 보기
                </button>
              )}
            </div>
          )}
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
                  meId={meId}
                  room={room}
                  role={role}
                  onLeave={onClose}
                  acts={acts}
                />
              </Fragment>
            );
          })}
        </div>
        {started ? (
          <Composer
            roomId={roomId}
            replyTo={replyTo}
            replyName={replyTo && replyTo.senderId === meId ? "나" : room.partnerName}
            onClearReply={() => setReplyTo(null)}
          />
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
