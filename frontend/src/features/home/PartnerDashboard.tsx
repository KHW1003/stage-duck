/**
 * 업체 메인 — 승인 업체 첫 화면 (mockup/partner.html 3번 st-approved).
 * 인사 → 지금 할 일 · 내 견적서 → 나에게 맞는 공고(전체·공고·받은 오퍼) → 이번 달 일정 · 내 업체.
 *
 * 값은 아직 목업 예시(시연_예시값.md)다. 바꿀 곳:
 * - 공고·오퍼 목록: 3번 공고 목록 API(#41, PostingSummary)가 develop 에 들어오면 JOBS 대신
 * - 할 일: 알림(notify, #45) / 견적서 수·정산: 견적서·결제 묶음
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cx } from "./cx";
import { HomeIcon, type HomeIconName } from "./icons";
import s from "./home.module.css";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

interface Todo {
  icon: HomeIconName;
  title: string;
  desc: string;
  action: string;
  to: string;
  hot?: boolean;
}

const TODOS: Todo[] = [
  { icon: "mail", title: "오퍼가 도착했어요", desc: "연말 합동 공연 · 응답 기한 47시간", action: "공고 보기", to: "/supplier/postings", hot: true },
  { icon: "bubble", title: "가을밤밴드님이 채팅을 시작했어요", desc: "가을밤 밴드 공연 · 장비 · 5분 전", action: "채팅", to: "/chats" },
  { icon: "pass", title: "재즈 트리오 공연 견적서가 컨펌됐어요", desc: "700,000원 · 결제 완료", action: "담당표", to: "/sheet" },
];

const KPI = [
  { label: "보낸 견적서", value: 3, to: "/supplier/postings" },
  { label: "채팅 중", value: 1, to: "/chats" },
  { label: "확인 카드 대기", value: 1, to: "/supplier/postings", tone: "warn" as const },
  { label: "컨펌", value: 1, to: "/supplier/postings", tone: "done" as const },
];

interface Job {
  id: number;
  date: string; // YYYY-MM-DD
  title: string;
  desc: string;
  due: string;
  offer?: boolean;
  urgent?: boolean;
  action: { label: string; to: string; primary: boolean };
}

const JOBS: Job[] = [
  {
    id: 1,
    date: "2026-11-28",
    title: "가을밤 밴드 공연 · 광주 동구 · 관객 80명",
    desc: "앞 단계 공간 C (입실 15:00) · 가을밤밴드 · 이용 0 · 반려 0",
    due: "확인 카드 보냄 · 47:12",
    action: { label: "상세", to: "/supplier/postings", primary: false },
  },
  {
    id: 2,
    date: "2026-12-05",
    title: "겨울 어쿠스틱 공연 · 광주 서구 · 관객 40명",
    desc: "앞 단계 공간 B (입실 17:00) · 봄날 · 이용 2 · 반려 1",
    due: "견적서 보내기 전",
    action: { label: "견적서 쓰기", to: "/supplier/postings", primary: true },
  },
  {
    id: 3,
    date: "2026-12-12",
    title: "연말 합동 공연 · 광주 북구 · 관객 120명",
    desc: '앞 단계 공간 A 컨펌 · "드럼 세트는 저희가 가져가요."',
    due: "응답 기한 47시간",
    offer: true,
    urgent: true,
    action: { label: "오퍼 보기", to: "/supplier/postings", primary: true },
  },
];

const SCHEDULE = [
  { date: "2026-11-14", text: "재즈 트리오 공연 · 설치 13:00", state: "결제 완료", pass: true },
  { date: "2026-11-28", text: "가을밤 밴드 공연 · 설치 15:00~15:45", state: "컨펌 대기", pass: false },
];

type Filter = "all" | "posting" | "offer";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "posting", label: "공고" },
  { key: "offer", label: "받은 오퍼" },
];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** 달력 칸: 앞 빈칸 + 1일~말일 + 뒤 빈칸 (7의 배수) */
export function monthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay();
  const last = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Calendar({ today }: { today: Date }) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const events = SCHEDULE.map((e) => parse(e.date)).filter((d) => d.getFullYear() === y && d.getMonth() === m).map((d) => d.getDate());
  return (
    <div className={s.pPanel}>
      <div className={s.pPanelHead}>
        <h2>이번 달 일정</h2>
        <span className={s.muted}>
          {y}년 {m + 1}월
        </span>
      </div>
      <div className={s.cal} aria-label={`${y}년 ${m + 1}월 달력`}>
        {WEEKDAY.map((w) => (
          <span key={w} className={s.calDow}>
            {w}
          </span>
        ))}
        {monthCells(y, m).map((d, i) => (
          <span key={i} className={cx(d === today.getDate() && s.isToday, d !== null && events.includes(d) && s.isEvent)}>
            {d ?? ""}
          </span>
        ))}
      </div>
      <ul className={s.calList}>
        {SCHEDULE.map((e) => {
          const d = parse(e.date);
          return (
            <li key={e.date}>
              <b>
                {d.getDate()} ({WEEKDAY[d.getDay()]})
              </b>
              <span>{e.text}</span>
              {e.pass ? (
                <span className={cx(s.status, s.statusPass)}>
                  <HomeIcon name="pass" />
                  {e.state}
                </span>
              ) : (
                <span className={cx(s.status, s.statusWarn)}>{e.state}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PartnerDashboard({ company, today = new Date() }: { company: string; today?: Date }) {
  const [filter, setFilter] = useState<Filter>("all");
  const jobs = useMemo(() => JOBS.filter((j) => filter === "all" || (filter === "offer") === !!j.offer), [filter]);
  const count = (f: Filter) => JOBS.filter((j) => f === "all" || (f === "offer") === !!j.offer).length;

  return (
    <>
      <section className={s.pTop}>
        <div className={s.wrap}>
          <div className={s.pHello}>
            <div>
              <p className={s.eyebrow}>
                {today.getMonth() + 1}월 {today.getDate()}일 {WEEKDAY[today.getDay()]}요일
              </p>
              <h1>
                {company}님, 오늘 확인할 일이 <em>{TODOS.length}건</em> 있어요
              </h1>
              <div className={s.pTags}>
                <span className={cx(s.status, s.statusPass)}>
                  <HomeIcon name="pass" />
                  승인 업체
                </span>
                <span className={s.chip}>음향 장비·설치 · 엔지니어</span>
                <span className={s.chip}>광주 · 전남</span>
              </div>
            </div>
            <div className={s.pHelloBtns}>
              <Link className={cx(s.btn, s.btnGhost, s.btnSm)} to="/supplier/posts">
                소개 글 수정
              </Link>
              <Link className={cx(s.btn, s.btnPrimary, s.btnSm)} to="/supplier/postings">
                공고 목록
              </Link>
            </div>
          </div>
          <div className={s.pBoard}>
            <div className={s.pPanel}>
              <div className={s.pPanelHead}>
                <h2>지금 할 일</h2>
                <Link className={s.more} to="/notifications">
                  알림 전체 <span aria-hidden="true">→</span>
                </Link>
              </div>
              <ul className={s.todo}>
                {TODOS.map((t) => (
                  <li key={t.title} className={cx(s.todoItem, t.hot && s.isHot)}>
                    <span className={s.todoIcon}>
                      <HomeIcon name={t.icon} />
                    </span>
                    <div>
                      <b>{t.title}</b>
                      <small>{t.desc}</small>
                    </div>
                    <Link className={cx(s.btn, s.btnSm, t.hot ? s.btnPrimary : s.btnGhost)} to={t.to}>
                      {t.action}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.pPanel}>
              <div className={s.pPanelHead}>
                <h2>내 견적서</h2>
                <Link className={s.more} to="/supplier/postings">
                  보낸 견적서 <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className={s.kpi}>
                {KPI.map((k) => (
                  <Link key={k.label} className={cx(s.kpiItem, k.tone === "warn" && s.isWarn, k.tone === "done" && s.isDone)} to={k.to}>
                    <span>{k.label}</span>
                    <b>{k.value}</b>
                  </Link>
                ))}
              </div>
              <div className={s.settle}>
                <div>
                  <span>정산 예정 (공연 뒤)</span>
                  <b>700,000원</b>
                </div>
                <div className={s.settleBar} aria-label="정산 예정 1건">
                  <span style={{ width: "100%" }} />
                </div>
                <small>재즈 트리오 공연 · 결제금 보관 중 · 테스트 결제</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.pJobs} id="jobs">
        <div className={s.wrap}>
          <div className={s.secHead}>
            <div>
              <h2 className={s.secTitle}>나에게 맞는 공고</h2>
              <p className={s.secDesc}>음향 장비·설치 · 광주·전남 · 지금 열린 단계 기준이에요.</p>
            </div>
            <Link className={s.more} to="/supplier/postings">
              공고 전체 보기 <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className={s.pFilter}>
            <div className={s.seg} role="tablist" aria-label="공고 필터">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={filter === f.key ? s.isOn : undefined}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label} <b>{count(f.key)}</b>
                </button>
              ))}
            </div>
            <label className={s.pSort}>
              <span className={s.sr}>정렬</span>
              <select defaultValue="date">
                <option value="date">공연일 가까운 순</option>
                <option value="recent">최근 게시 순</option>
              </select>
            </label>
          </div>
          <ul className={s.jobs}>
            {jobs.map((j) => {
              const d = parse(j.date);
              return (
                <li key={j.id} className={cx(s.job, j.offer && s.isOffer)}>
                  <div className={s.jobDate}>
                    <small>{d.getMonth() + 1}월</small>
                    <b>{d.getDate()}</b>
                    <span>{WEEKDAY[d.getDay()]}</span>
                  </div>
                  <div className={s.jobMain}>
                    <div className={s.jobTags}>
                      {j.offer && <span className={cx(s.badge, s.badgeBlue)}>받은 오퍼</span>}
                      <span className={s.chip}>장비 단계</span>
                    </div>
                    <h3>{j.title}</h3>
                    <p>{j.desc}</p>
                  </div>
                  <div className={s.jobSide}>
                    <span className={cx(s.jobDue, j.urgent && s.isUrgent)}>{j.due}</span>
                    <Link className={cx(s.btn, s.btnSm, j.action.primary ? s.btnPrimary : s.btnGhost)} to={j.action.to}>
                      {j.action.label}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className={s.pBottom} id="calendar">
        <div className={cx(s.wrap, s.pBottomGrid)}>
          <Calendar today={today} />
          <div className={s.pPanel}>
            <div className={s.pPanelHead}>
              <h2>내 업체</h2>
              <Link className={s.more} to="/supplier/profile">
                업체 프로필 <span aria-hidden="true">→</span>
              </Link>
            </div>
            <dl className={s.pReviewInfo} style={{ marginTop: 4 }}>
              {[
                ["거래", "15건"],
                ["기본 설치 시간", "90분"],
                ["엔지니어 경력", "7년"],
                ["배상책임보험", "가입 (업체 입력)"],
              ].map(([dt, dd]) => (
                <div key={dt}>
                  <dt>{dt}</dt>
                  <dd>{dd}</dd>
                </div>
              ))}
            </dl>
            <div className={s.prBox}>
              <div>
                <b>소개 글</b>
                <small>조회 312 · 관심 저장 18 · 마지막 끌어올리기 3일 전</small>
              </div>
              <div className={s.prBoxBtns}>
                <Link className={cx(s.btn, s.btnSm, s.btnGhost)} to="/supplier/posts">
                  글 수정
                </Link>
                <Link className={cx(s.btn, s.btnSm, s.btnPrimary)} to="/supplier/posts">
                  끌어올리기
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
