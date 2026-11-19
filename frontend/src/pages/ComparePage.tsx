/**
 * 단계별 견적 비교 (/performances/:id/compare?stage=). 목업: mockup-v4/pages/compare.html · FR-CHK-01 · AC-F3-20~24 · 묶음 4
 * 검사·종합 결과는 서버 run_checks() 결과를 그대로 그린다 (CLAUDE.md 12). 화면은 판정하지 않는다.
 * 공간 사진은 공간 찾기와 같은 기본 사진(venuePhotos). 업체 이름·채팅·오퍼 칸은 아직 뺐다 (내용 미정).
 */
import type { CSSProperties } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useStageQuotes } from "../features/compare/api";
import { usePerformance } from "../features/performance/api";
import { STAGE_NAME, STAGE_STATUS, dateLabel, hm } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { venuePhotos } from "../features/venue/view";
import type { CheckItem, CompareQuote, StageSummary } from "../shared/api/types";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { StatusBadge } from "../shared/StatusBadge";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import { formatWon } from "../shared/ui/MoneyText";
import "./compare.css";

/** 검사 이름 (요구사항 명세서 3.8). 문장은 서버 message 를 그대로 쓴다 */
const CHECK_NAME: Record<string, string> = {
  "CHK-01": "수용 인원", "CHK-02": "설치 시간", "CHK-03": "공간 조건", "CHK-04": "입실 → 설치",
  "CHK-05": "설치 → 리허설", "CHK-07": "철수 → 퇴실", "CHK-08": "엔지니어 근무", "CHK-09": "엔지니어 중복",
  "CHK-10": "예산", "CHK-11": "정보 누락", "CHK-12": "요청서 버전",
};
const TONE: Record<CheckItem["result"], { cls: string; icon: "pass" | "warn" | "info" | "conflict" }> = {
  PASS: { cls: "pass", icon: "pass" }, WARNING: { cls: "warn", icon: "warn" },
  NEEDS_INFO: { cls: "info", icon: "info" }, CONFLICT: { cls: "conflict", icon: "conflict" },
};
const STATE_CLASS: Partial<Record<StageSummary["status"], string>> = { CONFIRMED: "state--done", NEGOTIATING: "state--on", OPEN: "state--on" };

function kind(q: CompareQuote, stage: StageSummary): string {
  const parts = [stage.stageType === "VENUE" ? "공간" : STAGE_NAME[stage.stageType]];
  if (q.includesEquipment && stage.stageType !== "EQUIPMENT") parts.push("장비");
  if (q.includesEngineer && stage.stageType !== "ENGINEER") parts.push("엔지니어");
  return parts.join(" + ");
}

function includes(q: CompareQuote, stage: StageSummary): string {
  return kind(q, stage).split(" + ").join(" · ");
}

const nameOf = (q: CompareQuote) => (q.venueName ? `${q.venueName} · ${q.label}` : q.label);

function QuoteColumn({ q, stage }: { q: CompareQuote; stage: StageSummary }) {
  const confirmed = q.status === "CONFIRMED";
  const off = stage.status === "CONFIRMED" && !confirmed;
  return (
    <article className={["q-col", confirmed && "is-on", off && "is-off"].filter(Boolean).join(" ")} aria-label={nameOf(q)}>
      {q.venueId !== null && q.venueType !== null && (
        <div className="q-col__photo" role="img" aria-label={`${nameOf(q)} 사진`}
          style={{ "--img": `url('${venuePhotos({ id: q.venueId, venueType: q.venueType })[0]}')` } as CSSProperties} />
      )}
      <div className="q-col__head">
        <p className="q-col__kind">
          {kind(q, stage)} {q.isFullSpec && <span className="tag tag--fill">풀스펙</span>}
          {confirmed ? <span className="state state--done">확정</span> : <span className="tag">v{q.version}</span>}
        </p>
        <p className="q-col__name">{nameOf(q)}</p>
        <p className="q-col__total">{formatWon(q.totalAmount)}<small>원</small></p>
        <p className="q-col__incl">부가세 포함</p>
        <p className="mt-8"><StatusBadge result={q.overall} /></p>
      </div>
      <ul className="q-col__checks" aria-label="자동 검사">
        {q.checks.map((c) => (
          <li key={c.id}>
            <span className={`status status--${TONE[c.result].cls}`}><Ico name={TONE[c.result].icon} sm />{CHECK_NAME[c.id] ?? c.id}</span>
            <span>{c.message}</span>
          </li>
        ))}
      </ul>
      <div className="q-col__foot">
        <span className="state">{confirmed ? "확정" : off ? "마감" : "조율 중"}</span>
        {q.offered && <span className="small">오퍼로 받은 견적서</span>}
      </div>
    </article>
  );
}

function SideBySide({ quotes, stage }: { quotes: CompareQuote[]; stage: StageSummary }) {
  const venue = stage.stageType === "VENUE";
  const rows: [string, (q: CompareQuote) => string][] = [
    ["총액", (q) => `${formatWon(q.totalAmount)}원`],
    ...(venue ? ([
      ["입실 · 설치 가능", (q) => [q.checkinTime, q.setupAvailableTime].filter(Boolean).join(" · ") || "-"],
      ["수용 인원", (q) => (q.maxCapacity ? `${q.maxCapacity}명` : "-")],
      ["퇴실 마감", (q) => q.checkoutTime ?? "-"],
    ] as [string, (q: CompareQuote) => string][]) : []),
    ["포함", (q) => includes(q, stage)],
    ["요청서 버전", (q) => `v${q.basedOnPerfVersion} 기준`],
  ];
  return (
    <div className="sp" role="table" aria-label={`${STAGE_NAME[stage.stageType]} 견적서 항목별 비교`} style={{ "--cols": quotes.length } as CSSProperties}>
      <div role="row" className="sp__row">
        <div className="sp__h is-k" role="columnheader" />
        {quotes.map((q) => (
          <div key={q.quoteId} role="columnheader" className={`sp__h is-v${q.status === "CONFIRMED" ? " is-pick" : ""}`}>
            <b>{nameOf(q)}</b>
            {q.isFullSpec && <span>풀스펙</span>}
            {q.status === "CONFIRMED" && <em><Ico name="pass" sm />확정</em>}
          </div>
        ))}
      </div>
      {rows.map(([label, value], i) => (
        <div role="row" className="sp__row" key={label}>
          <div className={`sp__k${i === rows.length - 1 ? " is-last" : ""}`} role="rowheader">{label}</div>
          {quotes.map((q) => (
            <div key={q.quoteId} role="cell" className={["sp__v", i === rows.length - 1 && "is-last", q.status === "CONFIRMED" && "is-pick"].filter(Boolean).join(" ")}>
              {i === 0 ? <b className="sp__price">{value(q)}</b> : value(q)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ComparePage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const perf = usePerformance(id);
  const stages = perf.data?.stages ?? [];
  const wanted = Number(params.get("stage"));
  const stage =
    stages.find((s) => s.id === wanted) ??
    stages.find((s) => s.id === perf.data?.nextStageId && s.status !== "WAITING") ??
    stages.find((s) => s.status !== "WAITING");
  const quotes = useStageQuotes(stage?.id);
  usePageMeta("단계별 견적 비교");

  if (perf.isError) return <main className="container main"><ErrorNotice error={perf.error} /></main>;
  if (!perf.data) return <main className="container main"><p className="muted">불러오는 중이에요.</p></main>;
  const p = perf.data;

  return (
    <>
      <KitPageTop
        title="단계별 견적 비교"
        crumbs={[{ label: "내 공연", to: "/me/performances" }, { label: p.title, to: `/performances/${p.id}` }, { label: "단계별 비교" }]}
        meta={[p.title, dateLabel(p.showDate), `리허설 ${hm(p.rehearsalStart)}`, `관객 ${p.audience}명`]}
      />
      <div className="tab-bar"><div className="container"><div className="tabs" role="tablist" aria-label="단계">
        {stages.map((s) => {
          const waiting = s.status === "WAITING";
          return (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === stage?.id} aria-disabled={waiting || undefined}
              onClick={() => !waiting && setParams({ stage: String(s.id) })}>
              {String(s.seq).padStart(2, "0")} {STAGE_NAME[s.stageType]}{" "}
              <span className={`state ${STATE_CLASS[s.status] ?? ""}`}>{STAGE_STATUS[s.status]}</span>
            </button>
          );
        })}
      </div></div></div>
      <main className="container main">
        {!stage ? (
          <p className="muted">아직 열린 단계가 없어요. 요청서를 게시하면 공연장 단계부터 견적서를 받아요.</p>
        ) : quotes.isError ? (
          <ErrorNotice error={quotes.error} />
        ) : !quotes.data ? (
          <p className="muted">불러오는 중이에요.</p>
        ) : quotes.data.length === 0 ? (
          <p className="muted">아직 받은 견적서가 없어요. 업체가 견적서를 보내면 여기에서 나란히 비교할 수 있어요.</p>
        ) : (
          <section aria-label={`${STAGE_NAME[stage.stageType]} 견적서`}>
            <p className="desc muted mb-16">같은 기준으로 자동 검사한 결과예요. 실제 가능 여부는 업체와 채팅으로 확인해 주세요.</p>
            <div className="q-cols" style={{ "--cols": quotes.data.length } as CSSProperties}>
              {quotes.data.map((q) => <QuoteColumn key={q.quoteId} q={q} stage={stage} />)}
            </div>
            <div className="sec-head mt-40"><h2>항목별로 나란히 보기</h2></div>
            <SideBySide quotes={quotes.data} stage={stage} />
          </section>
        )}
      </main>
    </>
  );
}
