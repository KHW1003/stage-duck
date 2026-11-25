/**
 * 승인 업체 첫 화면 (/partner). 11/24 다시 만듦 — 예전 화면은 코드에 적은 가짜 숫자였다 (디자인 검수 "다시 만들어야 함").
 * 모든 숫자·목록은 업체가 이미 쓰는 API 에서 온다 (새 API 없음):
 *   받은 견적 요청 GET /supplier/offers · 공고 GET /postings · 내 예약 GET /supplier/reservations · 채팅 GET /chat-rooms
 *   알림 GET /me/notifications · 경고 GET /supplier/warnings · 내 소개 글 GET /pr-posts/mine
 * 화면은 판정·금액 계산을 하지 않는다 (CLAUDE.md 12). 개수 세기·날짜 정렬만 한다.
 * 모양: 카드·그림자·파스텔 없이 얇은 선과 여백으로 묶고, 상태는 아이콘 + 글자 + 색 (DESIGN.md 8장). 불러오는 중에는 회색 자리.
 */
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMyPrPosts } from "../board/api";
import { useChatRooms } from "../chat/api";
import { notificationTo, useMarkRead, useNotifications } from "../notification/api";
import { useReceivedOffers, type ReceivedOffer } from "../offer/api";
import { useSupplierReservations, useSupplierWarnings, type SupplierReservation } from "../payment/api";
import { STAGE_NAME, hm } from "../performance/labels";
import { usePostings } from "../quote/api";
import { isQuotable } from "../quote/PostingBrief";
import { useMe } from "../../shared/auth/useMe";
import { Ico, type KitIconName } from "../../shared/ui/Ico";
import s from "./partner-dashboard.module.css";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 86_400_000;

/** 달력 칸: 그 달 1일의 요일만큼 빈칸, 뒤는 7의 배수까지 빈칸 */
export function monthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay();
  const last = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const md = (iso: string) => {
  const d = dateOf(iso);
  return `${d.getMonth() + 1}.${d.getDate()} (${WEEKDAY[d.getDay()]})`;
};
const daysLeft = (iso: string, today: Date) => Math.round((dateOf(iso).getTime() - dateOf(ymd(today)).getTime()) / DAY);
const dLabel = (iso: string, today: Date) => {
  const n = daysLeft(iso, today);
  return n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : "";
};
const until = (iso: string, now: Date) => {
  const h = Math.floor((new Date(iso).getTime() - now.getTime()) / 3_600_000);
  if (h < 1) return "곧 마감";
  if (h < 24) return `${h}시간 남음`;
  return `${Math.floor(h / 24)}일 남음`;
};

const RES_STATUS: Record<SupplierReservation["status"], { label: string; tone: "pass" | "warn" | "info" | "muted" | "conflict" }> = {
  ASSIGNING: { label: "섭외 중", tone: "info" },
  AWAITING_PAYMENT: { label: "결제 대기", tone: "info" },
  PAID: { label: "결제 완료", tone: "pass" },
  COMPLETED: { label: "공연 완료", tone: "muted" },
  NEEDS_REVIEW: { label: "재확인 필요", tone: "warn" },
  CANCELLED: { label: "취소", tone: "conflict" },
};

type Tone = "pass" | "warn" | "info" | "muted" | "conflict";
const TONE_ICON: Record<Tone, KitIconName> = { pass: "pass", warn: "warn", info: "info", muted: "clock", conflict: "conflict" };

function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`${s.status} ${s[tone]}`}>
      <Ico name={TONE_ICON[tone]} sm />
      {children}
    </span>
  );
}

/** 불러오는 중: 줄 모양 회색 자리 (움직임 없음) */
function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={s.skeleton} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

function SecHead({ id, title, count, to, more = "전체 보기" }: { id?: string; title: string; count?: number; to?: string; more?: string }) {
  return (
    <div className={s.secHead}>
      <h2 id={id}>
        {title}
        {count !== undefined && <span className={s.count}>{count}</span>}
      </h2>
      {to && (
        <Link className={s.more} to={to}>
          {more}
          <Ico name="right" sm />
        </Link>
      )}
    </div>
  );
}

interface Todo {
  key: string;
  tone: Tone;
  label: string;
  title: string;
  sub: string;
  meta?: string;
  action: string;
  to: string;
}

function buildTodos(
  offers: ReceivedOffer[],
  reservations: SupplierReservation[],
  rooms: { roomId: number; partnerName: string; unreadCount: number }[],
  bumpable: number,
  noPost: boolean,
  now: Date,
): Todo[] {
  const list: Todo[] = [];
  for (const o of offers) {
    const soon = new Date(o.expiresAt).getTime() - now.getTime() < DAY;
    list.push({
      key: `offer-${o.offerId}`,
      tone: soon ? "warn" : "info",
      label: "견적 요청",
      title: `${o.nickname}님이 견적을 요청했어요`,
      sub: `${o.title} · ${STAGE_NAME[o.stageType]} · ${md(o.showDate)} · 관객 ${o.audience}명`,
      meta: until(o.expiresAt, now),
      action: "견적 쓰기",
      to: `/supplier/postings/${o.stageId}/quote`,
    });
  }
  for (const r of reservations.filter((x) => x.status === "NEEDS_REVIEW")) {
    list.push({
      key: `res-${r.performanceId}`,
      tone: "warn",
      label: "재확인",
      title: "다른 업체가 취소해 공연 내용이 바뀌었어요",
      sub: `${r.title} · ${md(r.showDate)}`,
      action: "예약 보기",
      to: "/supplier/reservations",
    });
  }
  // 안 읽은 대화: 하나면 그 방을, 여럿이면 한 줄로 묶어 채팅 목록을 연다 (줄이 같은 말로 반복되지 않게)
  const unreadRooms = rooms.filter((x) => x.unreadCount > 0);
  if (unreadRooms.length === 1) {
    const room = unreadRooms[0];
    list.push({ key: `chat-${room.roomId}`, tone: "info", label: "새 메시지", title: `${room.partnerName}님의 메시지 ${room.unreadCount}개`, sub: "채팅에서 답해 주세요", action: "채팅 열기", to: `/partner?chat=${room.roomId}` });
  } else if (unreadRooms.length > 1) {
    const total = unreadRooms.reduce((n, r) => n + r.unreadCount, 0);
    list.push({
      key: "chat-many",
      tone: "info",
      label: "새 메시지",
      title: `안 읽은 대화 ${unreadRooms.length}개 · 메시지 ${total}개`,
      sub: `${unreadRooms.slice(0, 3).map((r) => r.partnerName).join(", ")}${unreadRooms.length > 3 ? ` 외 ${unreadRooms.length - 3}명` : ""}`,
      action: "채팅 열기",
      to: "/partner?chat=list",
    });
  }
  if (noPost) {
    list.push({ key: "post-new", tone: "muted", label: "소개 글", title: "업체 찾기에 소개 글이 없어요", sub: "소개 글이 있어야 뮤지션이 먼저 찾아와요", action: "소개 글 쓰기", to: "/supplier/posts" });
  } else if (bumpable > 0) {
    list.push({ key: "post-bump", tone: "pass", label: "소개 글", title: `소개 글 ${bumpable}개를 끌어올릴 수 있어요`, sub: "7일에 한 번, 목록 맨 위로 올라가요", action: "끌어올리기", to: "/supplier/posts" });
  }
  return list;
}

/** 공연 달력: < > 로 다른 달을 본다 (11/24 해원). 공연이 있는 날에 점, 오늘은 테두리. 그 달 공연 수를 제목 옆에 */
function Calendar({ today, marked }: { today: Date; marked: Map<string, number> }) {
  const [offset, setOffset] = useState(0);
  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const y = view.getFullYear();
  const m = view.getMonth();
  const cells = monthCells(y, m);
  const prefix = `${y}-${String(m + 1).padStart(2, "0")}-`;
  const monthCount = [...marked.entries()].filter(([d]) => d.startsWith(prefix)).reduce((n, [, c]) => n + c, 0);
  const isThisMonth = offset === 0;
  return (
    <div className={s.cal}>
      <div className={s.calHead}>
        <p aria-live="polite">
          {y}년 {m + 1}월{monthCount > 0 && <span className={s.calCount}>공연 {monthCount}건</span>}
        </p>
        <div className={s.calNav}>
          {!isThisMonth && (
            <button type="button" className={s.calToday} onClick={() => setOffset(0)}>
              이번 달
            </button>
          )}
          <button type="button" className={s.calBtn} aria-label="이전 달" onClick={() => setOffset((o) => o - 1)}>
            <Ico name="left" sm />
          </button>
          <button type="button" className={s.calBtn} aria-label="다음 달" onClick={() => setOffset((o) => o + 1)}>
            <Ico name="right" sm />
          </button>
        </div>
      </div>
      <div className={s.calGrid} role="grid" aria-label={`${y}년 ${m + 1}월 공연 일정`}>
        {WEEKDAY.map((w) => (
          <span key={w} className={s.calDow} aria-hidden="true">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const iso = ymd(new Date(y, m, d));
          const isToday = iso === ymd(today);
          const count = marked.get(iso) ?? 0;
          return (
            <span
              key={iso}
              className={[s.calDay, isToday && s.calIsToday, count > 0 && s.calHas].filter(Boolean).join(" ")}
              aria-label={`${m + 1}월 ${d}일${count > 0 ? `, 공연 ${count}건` : ""}${isToday ? ", 오늘" : ""}`}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function PartnerDashboard({ company, today = new Date() }: { company: string; today?: Date }) {
  const me = useMe();
  const offers = useReceivedOffers();
  const postings = usePostings("");
  const reservations = useSupplierReservations(me.data?.id);
  const rooms = useChatRooms();
  const { pathname } = useLocation();
  const read = useMarkRead();
  const notes = useNotifications(null);
  const warnings = useSupplierWarnings(true);
  const myPosts = useMyPrPosts();

  const pending = (offers.data ?? [])
    .filter((o) => o.status === "PENDING" && o.stageOpen)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const soonCount = pending.filter((o) => new Date(o.expiresAt).getTime() - today.getTime() < DAY).length;
  const resList = reservations.data ?? [];
  const upcoming = resList
    .filter((r) => r.status !== "CANCELLED" && r.status !== "COMPLETED" && daysLeft(r.showDate, today) >= 0)
    .sort((a, b) => a.showDate.localeCompare(b.showDate));
  const in30 = upcoming.filter((r) => daysLeft(r.showDate, today) <= 30).length;
  const roomList = rooms.data ?? [];
  const unread = roomList.reduce((n, r) => n + r.unreadCount, 0);
  const posts = myPosts.data?.items ?? [];
  const bumpable = posts.filter((p) => p.status === "ACTIVE" && p.canBump).length;
  const newPostings = (postings.data ?? []).slice(0, 6);
  const noteList = (notes.data?.pages ?? []).flatMap((p) => p.items).slice(0, 4);
  const warnCount = warnings.data?.warningCount ?? 0;
  const suspendAt = warnings.data?.suspendAt ?? 3;

  const loading = offers.isLoading || reservations.isLoading || rooms.isLoading || myPosts.isLoading;
  const todos = loading ? [] : buildTodos(pending, resList, roomList, bumpable, myPosts.isSuccess && posts.length === 0, today);
  // 달력 점: 취소되지 않은 예약 모두 (지난 달·다음 달도 넘겨 보므로 지난 공연도 넣는다)
  const marked = new Map<string, number>();
  for (const r of resList.filter((x) => x.status !== "CANCELLED")) {
    const d = r.showDate.slice(0, 10);
    marked.set(d, (marked.get(d) ?? 0) + 1);
  }

  const kpis: { label: string; value: number | null; sub: string; tone?: Tone; to: string }[] = [
    { label: "답할 견적 요청", value: offers.isLoading ? null : pending.length, sub: soonCount ? `24시간 안 마감 ${soonCount}건` : "마감 임박 없음", tone: soonCount ? "warn" : undefined, to: "/supplier/offers" },
    { label: "안 읽은 메시지", value: rooms.isLoading ? null : unread, sub: `대화 ${roomList.length}개`, to: "/partner?chat=list" },
    { label: "30일 안 공연", value: reservations.isLoading ? null : in30, sub: upcoming[0] ? `가장 가까운 공연 ${dLabel(upcoming[0].showDate, today)}` : "예정된 공연 없음", to: "/supplier/reservations" },
    { label: "모집 중 공고", value: postings.isLoading ? null : (postings.data ?? []).filter(isQuotable).length, sub: "내 부문 · 견적을 보낼 수 있는 공고", to: "/supplier/postings" },
  ];

  return (
    <div className={`sd-container ${s.page}`}>
      <header className={s.top}>
        <div>
          <p className={s.date}>
            {today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAY[today.getDay()]}요일
          </p>
          <h1>
            {company}님, 오늘 확인할 일이{" "}
            {loading ? "" : todos.length > 0 ? (
              <>
                <em>{todos.length}건</em> 있어요
              </>
            ) : (
              "없어요"
            )}
          </h1>
        </div>
        <nav className={s.quick} aria-label="바로 가기">
          <Link className={s.quickLink} to="/supplier/postings">
            <Ico name="list" sm />
            공고 목록
          </Link>
          <Link className={s.quickLink} to="/supplier/reservations">
            <Ico name="calendar" sm />
            내 예약
          </Link>
          <Link className={s.quickLink} to="/supplier/posts">
            <Ico name="edit" sm />
            내 소개 글
          </Link>
        </nav>
      </header>

      <section className={s.kpis} aria-label="요약">
        {kpis.map((k) => (
          <Link key={k.label} className={s.kpi} to={k.to}>
            <span className={s.kpiLabel}>{k.label}</span>
            {k.value === null ? <span className={s.kpiSkel} aria-hidden="true" /> : <b className={s.kpiValue}>{k.value}</b>}
            <span className={`${s.kpiSub} ${k.tone ? s[k.tone] : ""}`}>{k.sub}</span>
          </Link>
        ))}
      </section>

      <div className={s.grid}>
        <div className={s.main}>
          <section aria-labelledby="pd-todo">
            <SecHead id="pd-todo" title="지금 할 일" count={loading || todos.length === 0 ? undefined : todos.length} />
            {loading ? (
              <Skeleton rows={3} />
            ) : todos.length === 0 ? (
              <p className={s.empty}>지금 처리할 일이 없어요. 새 공고가 올라오면 알림으로 알려 드려요.</p>
            ) : (
              <ul className={s.rows}>
                {todos.map((t) => (
                  <li key={t.key} className={s.todo}>
                    <Status tone={t.tone}>{t.label}</Status>
                    <div className={s.todoMain}>
                      <b>{t.title}</b>
                      <span>{t.sub}</span>
                    </div>
                    {t.meta ? <span className={`${s.todoMeta} ${t.tone === "warn" ? s.warn : ""}`}>{t.meta}</span> : <span />}
                    <Link className={s.action} to={t.to}>
                      {t.action}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pd-postings">
            <SecHead id="pd-postings" title="새 공고" to="/supplier/postings" more="공고 전체 보기" />
            {postings.isLoading ? (
              <Skeleton rows={4} />
            ) : newPostings.length === 0 ? (
              <p className={s.empty}>지금 볼 수 있는 공고가 없어요.</p>
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">공연</th>
                    <th scope="col">부문</th>
                    <th scope="col">공연 날짜</th>
                    <th scope="col">
                      <span className="sd-sr-only">견적</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {newPostings.map((p) => (
                    <tr key={p.stageId}>
                      <td>
                        <Link className={s.pTitle} to={`/supplier/postings/${p.stageId}`}>
                          {p.title}
                        </Link>
                        <span className={s.pSub}>
                          {p.sido} {p.sigungu}
                          {p.nickname ? ` · ${p.nickname}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className={s.tag}>{STAGE_NAME[p.stageType]}</span>
                      </td>
                      <td className={s.num}>
                        {md(p.showDate)}
                        <span className={s.dday}>{dLabel(p.showDate, today)}</span>
                      </td>
                      <td className={s.right}>
                        {isQuotable(p) ? (
                          <Link className={s.action} to={`/supplier/postings/${p.stageId}/quote`}>
                            견적 쓰기
                          </Link>
                        ) : (
                          <span className={s.pSub}>모집 전</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className={s.side} aria-label="일정과 계정">
          <section aria-labelledby="pd-schedule">
            <SecHead id="pd-schedule" title="다가오는 공연" to="/supplier/reservations" more="내 예약" />
            <Calendar today={today} marked={marked} />
            {reservations.isLoading ? (
              <Skeleton rows={2} />
            ) : upcoming.length === 0 ? (
              <p className={s.empty}>예정된 공연이 없어요.</p>
            ) : (
              <ul className={s.schedule}>
                {upcoming.slice(0, 4).map((r) => (
                  <li key={r.performanceId}>
                    <span className={s.when}>
                      <b>{md(r.showDate)}</b>
                      <em>{dLabel(r.showDate, today)}</em>
                    </span>
                    <span className={s.what}>
                      <b>{r.title}</b>
                      <span>
                        {hm(r.showStart)}~{hm(r.showEnd)} · {r.stageTypes.map((t) => STAGE_NAME[t]).join("·")}
                      </span>
                    </span>
                    <Status tone={RES_STATUS[r.status].tone}>{RES_STATUS[r.status].label}</Status>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pd-account">
            <SecHead id="pd-account" title="내 계정" />
            <dl className={s.account}>
              <div>
                <dt>심사</dt>
                <dd>
                  <Status tone="pass">승인 업체</Status>
                </dd>
              </div>
              <div>
                <dt>경고</dt>
                <dd>
                  {warnCount > 0 ? (
                    <Status tone={warnCount >= suspendAt - 1 ? "conflict" : "warn"}>
                      {warnCount}회 · {suspendAt}회면 이용 정지
                    </Status>
                  ) : (
                    <span className={s.muted}>없음</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>소개 글</dt>
                <dd>
                  {myPosts.isLoading ? (
                    "…"
                  ) : posts.length === 0 ? (
                    <Link className={s.inline} to="/supplier/posts">
                      아직 없어요 · 쓰기
                    </Link>
                  ) : (
                    <span>
                      {posts.length}개{bumpable > 0 ? ` · 끌어올리기 ${bumpable}개 가능` : ""}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="pd-notes">
            <SecHead id="pd-notes" title="최근 알림" to="/notifications" />
            {notes.isLoading ? (
              <Skeleton rows={3} />
            ) : noteList.length === 0 ? (
              <p className={s.empty}>새 알림이 없어요.</p>
            ) : (
              <ul className={s.notes}>
                {noteList.map((n) => (
                  <li key={n.id} className={n.read ? "" : s.unread}>
                    <Link to={notificationTo(n.link, pathname)} onClick={() => !n.read && read.mutate({ ids: [n.id] })}>
                      <b>{n.title}</b>
                      {n.body && <span>{n.body}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
