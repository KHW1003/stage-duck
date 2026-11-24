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
 * 수정·삭제(11/24·25): 내 글 메시지 [수정] → 아래 입력창에서 고쳐 저장, 내 메시지 [삭제] → 확인 없이 "삭제된 메시지예요"
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
  onEditStart: (m: ChatMsg) => void;
  editingId: number | null;
  onDelete: (id: number) => void;
  busy: boolean;
  /** 휴대폰: 꾹 누른 말풍선의 아이콘만 연다 (11/25). PC 는 마우스를 올리면 */
  openId: number | null;
  onLongPress: (id: number | null) => void;
}

const LONG_PRESS_MS = 450;

/** 꾹 누르기: 손가락을 0.45초 떼지 않으면 onLong. 움직이거나 일찍 떼면 취소 (스크롤과 구분) */
function useLongPress(onLong: () => void) {
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onTouchStart: () => {
      clear();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        onLong();
      }, LONG_PRESS_MS);
    },
    onTouchMove: clear,
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}

function Bubble({ m, mine, read, partner, meId, room, role, onLeave, acts }: {
  m: ChatMsg; mine: boolean; read: boolean; partner: string; meId: number; room: Room; role: Props["role"]; onLeave: () => void;
  acts: MsgActions;
}) {
  const press = useLongPress(() => acts.onLongPress(m.id));
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
      <div
        className={["msg", mine && "msg--me", acts.openId === m.id && "msg--acts", acts.editingId === m.id && "msg--editing"].filter(Boolean).join(" ")}
        data-msg-id={m.id}
        onContextMenu={(e) => {
          // 휴대폰에서 꾹 누르면 뜨는 기본 메뉴 대신 답장·수정·삭제
          if (acts.openId === m.id) e.preventDefault();
        }}
      >
        <div className="msg__col" {...(m.deleted ? {} : press)}>
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
        <span className="msg__t">
          {/* 답장·수정·삭제: "읽음"·시간 칸 위에 뜬다 — 말풍선을 가리지 않게 (11/25) */}
          {!m.deleted && acts.editingId !== m.id && (
            <span className="msg__acts">
              <button type="button" className="msg__act" aria-label="답장" title="답장" onClick={() => acts.onReply(m)}>
                <Ico name="reply" sm />
              </button>
              {mine && m.type === "TEXT" && (
                <button type="button" className="msg__act" aria-label="수정" title="수정" disabled={acts.busy} onClick={() => {
                  acts.onLongPress(null);
                  acts.onEditStart(m);
                }}>
                  <Ico name="edit" sm />
                </button>
              )}
              {mine && (
                <button type="button" className="msg__act" aria-label="삭제" title="삭제" disabled={acts.busy} onClick={() => {
                  acts.onLongPress(null);
                  acts.onDelete(m.id);
                }}>
                  <Ico name="trash" sm />
                </button>
              )}
            </span>
          )}
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

function Composer({ roomId, replyTo, replyName, onClearReply, onSending, editTarget, onClearEdit, onSaveEdit }: {
  roomId: number; replyTo: ChatMsg | null; replyName: string; onClearReply: () => void; onSending: () => void;
  editTarget: ChatMsg | null; onClearEdit: () => void; onSaveEdit: (id: number, body: string) => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<unknown>(null);
  // 수정을 고르면 그 글을 입력창에 넣고, 그만두면 비운다 (11/25: 말풍선 안 입력칸 대신 아래 입력창에서)
  const editingId = editTarget?.id ?? null;
  useEffect(() => {
    setEditError(null);
    setText(editTarget?.body ?? "");
    if (editTarget) textRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);
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
  const busy = send.isPending || attach.isPending || saving;
  const clearErrors = () => {
    setPickError(null);
    send.reset();
    attach.reset();
  };
  const submit = () => {
    const body = text.trim();
    if (!body || busy) return;
    if (editTarget) {
      if (body === editTarget.body) return onClearEdit();
      setSaving(true);
      setEditError(null);
      onSaveEdit(editTarget.id, body)
        .then(() => onClearEdit())
        .catch((e: unknown) => setEditError(e))
        .finally(() => setSaving(false));
      return;
    }
    clearErrors();
    onSending();
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
    onSending();
    attach.mutate({ type, file, replyToId: replyTo?.id ?? null }, { onSuccess: onClearReply });
  };
  const error = editError ?? send.error ?? attach.error;
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
      {editTarget && (
        <div className="composer__reply composer__reply--edit" role="status">
          <Ico name="edit" sm />
          <b className="composer__reply-main">메시지 수정</b>
          <button type="button" className="icon-btn" aria-label="수정 취소" onClick={onClearEdit}>
            <Ico name="x" sm />
          </button>
        </div>
      )}
      {replyTo && !editTarget && (
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
        <button className="icon-btn" type="button" aria-label="사진 보내기" disabled={busy || Boolean(editTarget)} onClick={() => photoInput.current?.click()}>
          <Ico name="image" />
        </button>
        <button className="icon-btn" type="button" aria-label="파일 보내기" disabled={busy || Boolean(editTarget)} onClick={() => fileInput.current?.click()}>
          <Ico name="clip" />
        </button>
        <input ref={photoInput} type="file" hidden accept={ATTACH_RULES.IMAGE.accept} aria-label="사진 고르기" onChange={onPick("IMAGE")} />
        <input ref={fileInput} type="file" hidden accept={ATTACH_RULES.FILE.accept} aria-label="파일 고르기" onChange={onPick("FILE")} />
        <textarea ref={textRef} rows={1} placeholder={editTarget ? "고칠 내용을 입력하세요" : replyTo ? "답장을 입력하세요" : "메시지를 입력하세요"} aria-label="메시지" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Escape" && editTarget) onClearEdit();
          else if (e.key === "Escape" && replyTo) onClearReply();
          onKey(e);
        }} />
        <button className="btn btn--primary" type="button" aria-label={editTarget ? "수정 저장" : "보내기"} disabled={busy || !text.trim()} onClick={submit}>
          <Ico name={editTarget ? "check" : "send"} sm />
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
  const [openActs, setOpenActs] = useState<number | null>(null); // 휴대폰: 꾹 눌러 아이콘을 연 말풍선
  const [editTarget, setEditTarget] = useState<ChatMsg | null>(null); // 입력창에서 고치는 중인 내 메시지
  const listRef = useRef<HTMLDivElement>(null);
  const editMsg = useEditMessage(roomId);
  const deleteMsg = useDeleteMessage(roomId);
  const acts: MsgActions = {
    onReply: (m) => {
      setEditTarget(null);
      setReplyTo(m);
      setOpenActs(null);
    },
    onJump: (id) => jumpTo(id),
    onEditStart: (m) => {
      setReplyTo(null);
      setEditTarget(m);
    },
    editingId: editTarget?.id ?? null,
    onDelete: (id) => {
      if (editTarget?.id === id) setEditTarget(null);
      deleteMsg.mutate(id); // 확인 창 없이 바로 (11/25)
    },
    busy: editMsg.isPending || deleteMsg.isPending,
    openId: openActs,
    onLongPress: setOpenActs,
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

  // 맨 아래(최신) 붙이기: 처음 열 때·새 메시지·패널이 보이거나 크기가 바뀔 때. 위로 올려 보는 중이면 끌어내리지 않는다
  // (11/24: 주소로 바로 열면 패널이 보이기 전에 맞춰 맨 위에서 열리던 문제)
  const stick = useRef(true);
  const toBottom = () => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  };
  // 방 정보(room)가 대화보다 늦게 오면 그때 목록이 처음 그려진다 → 그 시점에도 맞춘다
  const listShown = Boolean(room) && thread.isSuccess;
  useLayoutEffect(toBottom, [lastId, listShown]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(toBottom);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listShown]);

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
          className={editTarget ? "room__msgs is-editing" : "room__msgs"}
          ref={listRef}
          onClick={(e) => {
            // 휴대폰: 꾹 눌러 연 아이콘은 다른 곳을 누르면 닫는다
            if (openActs !== null && !(e.target as Element).closest(".msg--acts")) setOpenActs(null);
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (el.scrollTop < 60) void loadOlder();
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
            onSending={() => {
              stick.current = true; // 내가 보내면 늘 맨 아래로
            }}
            editTarget={editTarget}
            onClearEdit={() => setEditTarget(null)}
            onSaveEdit={(id, body) => editMsg.mutateAsync({ id, body })}
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
