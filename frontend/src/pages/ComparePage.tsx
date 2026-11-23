/**
 * 단계별 견적 비교 (/performances/:id/compare?stage=). 목업: mockup-v4/pages/compare.html · FR-CHK-01 · AC-F3-20~24 · 묶음 4
 * 검사·종합 결과는 서버 run_checks() 결과를 그대로 그린다 (CLAUDE.md 12). 화면은 판정하지 않는다.
 * 공간 사진은 공간 찾기와 같은 기본 사진(venuePhotos).
 * 디자인 검수 반영 (11/23): 카드 맨 위는 업체 상호 + 별점, 총액 아래 검사 요약(충돌·경고·확인 필요·통과 수)과
 * 가장 낮은 금액과의 차이(사실만, 추천·판정 말은 쓰지 않는다), 카드 맨 아래 [견적서 보기]·[채팅].
 * 검사 줄은 한 줄로 줄이고(넘치면 말줄임, 전체 문장은 title) 전체 문장은 아래 "항목별로 나란히 보기" 표에 둔다.
 */
import type { CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useStageQuotes } from "../features/compare/api";
import { usePerformance } from "../features/performance/api";
import { useReviewSummaries, type ReviewSummary } from "../features/review/api";
import { RatingBadge } from "../features/review/Stars";
import { STAGE_NAME, STAGE_STATUS, dateLabel, hm } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { venuePhotos } from "../features/venue/view";
import type { CheckItem, CompareQuote, StageSummary } from "../shared/api/types";
import { ApiError } from "../shared/api/client";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { NotFound } from "../shared/layout/NotFound";
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

const subOf = (q: CompareQuote) => (q.venueName ? `${q.venueName} · ${q.label}` : q.label);
const nameOf = (q: CompareQuote) => q.companyName || subOf(q);

/** 확정한 견적서인가. 결제 전에 업체가 취소하면(D-57) 단계는 다시 모집 중인데 견적서는 CONFIRMED 로 남아 있어 단계 상태로 함께 본다 */
const picked = (q: CompareQuote, stage: StageSummary) => q.status === "CONFIRMED" && (stage.status === "CONFIRMED" || stage.status === "RECHECK");
const withdrawn = (q: CompareQuote, stage: StageSummary) => q.status === "CONFIRMED" && !picked(q, stage);

/** 총액 아래 검사 요약: 0이 아닌 것만, 심각한 순서 */
const SUMMARY: [CheckItem["result"], string][] = [["CONFLICT", "충돌"], ["WARNING", "경고"], ["NEEDS_INFO", "확인 필요"], ["PASS", "통과"]];

function CheckSummary({ checks }: { checks: CheckItem[] }) {
  const parts = SUMMARY.map(([r, label]) => [r, label, checks.filter((c) => c.result === r).length] as const).filter(([, , n]) => n > 0);
  return (
    <p className="q-col__sum" aria-label={`검사 결과: ${parts.map(([, l, n]) => `${l} ${n}`).join(", ")}`}>
      {parts.map(([r, label, n]) => (
        <span key={r} className={`status status--${TONE[r].cls}`}><Ico name={TONE[r].icon} sm />{label} {n}</span>
      ))}
    </p>
  );
}

interface ColumnProps {
  q: CompareQuote;
  stage: StageSummary;
  lowest: number;
  showDiff: boolean;
  rating?: ReviewSummary;
}

function QuoteColumn({ q, stage, lowest, showDiff, rating }: ColumnProps) {
  const confirmed = picked(q, stage);
  const cancelled = withdrawn(q, stage);
  const off = (stage.status === "CONFIRMED" && !confirmed) || cancelled;
  const diff = q.totalAmount - lowest;
  return (
    <article className={["q-col", confirmed && "is-on", off && "is-off"].filter(Boolean).join(" ")} aria-label={q.companyName ? `${q.companyName} ${subOf(q)}` : subOf(q)}>
      {q.venueId !== null && q.venueType !== null && (
        <div className="q-col__photo" role="img" aria-label={`${subOf(q)} 사진`}
          style={{ "--img": `url('${venuePhotos({ id: q.venueId, venueType: q.venueType })[0]}')` } as CSSProperties} />
      )}
      <div className="q-col__head">
        <p className="q-col__kind">
          <span>{kind(q, stage)} {q.isFullSpec && <span className="tag tag--fill">풀스펙</span>}</span>
          {confirmed ? <span className="state state--done">확정</span> : <span className="tag">v{q.version}</span>}
        </p>
        <p className="q-col__name">
          <span>{nameOf(q)}</span>
          {rating && <RatingBadge average={rating.average} count={rating.count} />}
        </p>
        {q.companyName && <p className="q-col__sub">{subOf(q)}</p>}
        <p className="q-col__total">{formatWon(q.totalAmount)}<small>원</small></p>
        <p className="q-col__incl">
          부가세 포함
          {showDiff && (diff === 0 ? <span className="tag">가장 낮은 금액</span> : <span className="q-col__diff">+{formatWon(diff)}원</span>)}
        </p>
        <CheckSummary checks={q.checks} />
      </div>
      <ul className="q-col__checks" aria-label="자동 검사">
        {q.checks.map((c) => (
          <li key={c.id} title={c.message}>
            <span className={`status status--${TONE[c.result].cls}`}><Ico name={TONE[c.result].icon} sm />{CHECK_NAME[c.id] ?? c.id}</span>
            <span className="q-col__msg">{c.message}</span>
          </li>
        ))}
      </ul>
      <div className="q-col__foot">
        <span className="q-col__state">
          <span className="state">{confirmed ? "확정" : cancelled ? "업체 사정 취소" : off ? "마감" : "조율 중"}</span>
          {q.offered && <span className="small muted">견적 요청으로 받음</span>}
        </span>
        <span className="q-col__acts">
          <Link className="link" to={`/quotes/${q.quoteId}`}>견적서 보기</Link>
          {q.roomId !== null && (
            <Link className="btn btn--primary btn--sm" to={{ search: `?stage=${stage.id}&chat=${q.roomId}` }} aria-label={`${nameOf(q)}와 채팅`}>
              <Ico name="chat" sm />채팅
            </Link>
          )}
        </span>
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
    ...[...new Set(quotes.flatMap((q) => q.checks.map((c) => c.id)))].map(
      (cid) => [CHECK_NAME[cid] ?? cid, (q: CompareQuote) => q.checks.find((c) => c.id === cid)?.message ?? "-"] as [string, (q: CompareQuote) => string],
    ),
    ["요청서 버전", (q) => `v${q.basedOnPerfVersion} 기준`],
  ];
  return (
    <div className="sp" role="table" aria-label={`${STAGE_NAME[stage.stageType]} 견적서 항목별 비교`} style={{ "--cols": quotes.length } as CSSProperties}>
      <div role="row" className="sp__row">
        <div className="sp__h is-k" role="columnheader" />
        {quotes.map((q) => (
          <div key={q.quoteId} role="columnheader" className={`sp__h is-v${picked(q, stage) ? " is-pick" : ""}`}>
            <b>{nameOf(q)}</b>
            {q.companyName && <span className="sp__sub">{subOf(q)}</span>}
            {q.isFullSpec && <span>풀스펙</span>}
            {picked(q, stage) && <em><Ico name="pass" sm />확정</em>}
          </div>
        ))}
      </div>
      {rows.map(([label, value], i) => (
        <div role="row" className="sp__row" key={label}>
          <div className={`sp__k${i === rows.length - 1 ? " is-last" : ""}`} role="rowheader">{label}</div>
          {quotes.map((q) => (
            <div key={q.quoteId} role="cell" className={["sp__v", i === 0 && "is-num", i === rows.length - 1 && "is-last", picked(q, stage) && "is-pick"].filter(Boolean).join(" ")}>
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
  const ratings = useReviewSummaries((quotes.data ?? []).map((q) => q.supplierId));
  usePageMeta("단계별 견적 비교");

  if (!Number.isInteger(id) || (perf.error instanceof ApiError && perf.error.status === 404)) return <NotFound />;
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
              {waiting && <Ico name="lock" sm />}
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
              {quotes.data.map((q) => (
                <QuoteColumn key={q.quoteId} q={q} stage={stage} rating={ratings.get(q.supplierId)}
                  lowest={Math.min(...quotes.data.map((x) => x.totalAmount))}
                  showDiff={quotes.data.length > 1 && new Set(quotes.data.map((x) => x.totalAmount)).size > 1} />
              ))}
            </div>
            <div className="sec-head mt-40"><h2>항목별로 나란히 보기</h2></div>
            <SideBySide quotes={quotes.data} stage={stage} />
          </section>
        )}
      </main>
    </>
  );
}
