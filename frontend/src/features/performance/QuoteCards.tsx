/**
 * 내 공연 상세의 진행 중 단계: 받은 견적서를 카드로 (목업 v4 performance.html .cmp). 11/24 해원 —
 * 견적함 화면은 두지 않고 여기서 본다. 한 번에 2장(휴대폰 1장), 더 있으면 < > 로 넘겨 본다.
 * 데이터는 단계별 비교 API(GET /stages/{id}/quotes)를 그대로 쓴다.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStageQuotes } from "../compare/api";
import type { CheckItem, CompareQuote, StageSummary } from "../../shared/api/types";
import { Ico } from "../../shared/ui/Ico";
import { STAGE_NAME } from "./labels";
import s from "./QuoteCards.module.css";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const nameOf = (q: CompareQuote) => q.companyName || q.venueName || q.label;

/** 검사 요약: 가장 심각한 결과 하나와 그 메시지 */
const ORDER: CheckItem["result"][] = ["CONFLICT", "WARNING", "NEEDS_INFO", "PASS"];
const CHECK: Record<CheckItem["result"], { label: string; cls: string; icon: "pass" | "warn" | "info" | "conflict" }> = {
  CONFLICT: { label: "충돌", cls: "conflict", icon: "conflict" },
  WARNING: { label: "경고", cls: "warn", icon: "warn" },
  NEEDS_INFO: { label: "확인 필요", cls: "info", icon: "info" },
  PASS: { label: "통과", cls: "pass", icon: "pass" },
};

function flag(q: CompareQuote, stage: StageSummary): { text: string; on: boolean } {
  if (q.status === "CONFIRMED" && (stage.status === "CONFIRMED" || stage.status === "RECHECK")) return { text: "확정", on: true };
  if (q.status !== "SENT") return { text: "마감", on: false };
  return q.chatStarted ? { text: "채팅 중", on: true } : { text: "채팅 전", on: false };
}

function Includes({ q, stage }: { q: CompareQuote; stage: StageSummary }) {
  const items: { label: string; on: boolean }[] =
    stage.stageType === "VENUE"
      ? [{ label: q.venueName ?? "공간", on: true }, { label: "장비", on: q.includesEquipment }, { label: "엔지니어", on: q.includesEngineer }]
      : [{ label: STAGE_NAME[stage.stageType], on: true }, ...(stage.stageType === "ENGINEER" ? [] : [{ label: "엔지니어", on: q.includesEngineer }])];
  return (
    <p className={s.inc}>
      {items.map((i) => (
        <span key={i.label} className={i.on ? undefined : s.no}>
          {i.on ? i.label : `${i.label} 없음`}
        </span>
      ))}
    </p>
  );
}

function Card({ q, stage, lowest, many }: { q: CompareQuote; stage: StageSummary; lowest: number; many: boolean }) {
  const f = flag(q, stage);
  const worst = ORDER.find((r) => q.checks.some((c) => c.result === r)) ?? "PASS";
  const worstCount = q.checks.filter((c) => c.result === worst).length;
  const note = q.checks.find((c) => c.result === worst)?.message;
  const diff = q.totalAmount - lowest;
  return (
    <article className={s.card} aria-label={`${nameOf(q)} 견적서`}>
      <div className={s.head}>
        <p className={s.name}>
          {nameOf(q)} <span className="tag">v{q.version}</span>
        </p>
        <p className={s.meta}>{q.venueName ? `${q.venueName} · ${q.label}` : q.label}</p>
        <span className={f.on ? `${s.flag} ${s.on}` : s.flag}>{f.text}</span>
      </div>
      <div className={s.row}>
        <span className={s.price}>{won(q.totalAmount)}</span>
        {many && <span className={s.diff}>{diff === 0 ? "받은 견적서 중 가장 낮아요" : <>가장 낮은 견적보다 <b>+{won(diff)}</b></>}</span>}
      </div>
      <div className={s.row}>
        <Includes q={q} stage={stage} />
      </div>
      <div className={s.row}>
        <span className={`status status--${CHECK[worst].cls}`}>
          <Ico name={CHECK[worst].icon} sm />
          {CHECK[worst].label}
          {worst === "PASS" ? "" : ` ${worstCount}`}
        </span>
        {note && <span className={s.note}>{note}</span>}
      </div>
      <div className={`${s.row} ${s.acts}`}>
        {q.roomId !== null && f.text !== "마감" && (
          <Link className={f.on ? "btn btn--sm btn--primary" : "btn btn--sm"} to={{ search: `?chat=${q.roomId}` }}>
            {q.chatStarted ? "채팅 열기" : "채팅 시작"}
          </Link>
        )}
        <Link className="btn btn--sm" to={`/quotes/${q.quoteId}`}>
          견적서
        </Link>
      </div>
    </article>
  );
}

export function QuoteCards({ stage }: { stage: StageSummary }) {
  const quotes = useStageQuotes(stage.id);
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const list = quotes.data ?? [];

  const update = () => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  };
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [list.length]);

  if (quotes.isPending) return <div className={s.skeleton} aria-hidden="true" />;
  if (list.length === 0) return null;
  const lowest = Math.min(...list.map((q) => q.totalAmount));
  const move = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };
  const paged = !(edge.start && edge.end);

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <p className={s.title}>받은 견적서 {list.length}건</p>
        {paged && (
          <div className={s.nav}>
            <button type="button" className={s.navBtn} aria-label="이전 견적서" disabled={edge.start} onClick={() => move(-1)}>
              <Ico name="left" sm />
            </button>
            <button type="button" className={s.navBtn} aria-label="다음 견적서" disabled={edge.end} onClick={() => move(1)}>
              <Ico name="right" sm />
            </button>
          </div>
        )}
      </div>
      <div className={s.track} ref={track} onScroll={update} role="list" aria-label={`${STAGE_NAME[stage.stageType]} 받은 견적서`}>
        {list.map((q) => (
          <div key={q.quoteId} role="listitem" className={s.slide}>
            <Card q={q} stage={stage} lowest={lowest} many={list.length > 1} />
          </div>
        ))}
      </div>
    </div>
  );
}
