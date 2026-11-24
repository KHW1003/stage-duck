/**
 * 내 공연 상세 (/performances/:id, #40). 목업 v4 performance.html
 * - 위: 사진·제목·D-day·정보 줄 + [요청서 수정]·[공고 내리기]
 * - 섭외 진행: 원 + 선 (my.html 과 같은 모양) + STEP 01~03 줄. 머리줄을 누르면 펼치고 접는다
 *   (처음: 진행 중 단계만 열림, 확정·대기는 닫힘. 여러 개를 동시에 열 수 있다)
 * - 확정 단계: 확정한 견적서(공간·금액·버전), 진행 중: 할 일 + 받은 견적서 수 + [단계별 비교], 다음 단계로(OPEN_NEXT)면 패널
 * - 요청서 요약 표
 * 진행 중 단계에는 받은 견적서 카드(목업 .cmp, QuoteCards)를 2장씩, 더 있으면 < > 로 넘겨 본다 (11/24: 견적함 화면 대신 여기서).
 * 항목별로 나란히 보는 표는 단계별 비교 화면(#48 /performances/:id/compare).
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PerformanceDetail, StageSummary } from "../shared/api/types";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { DeadlineNotice } from "../shared/ui/DeadlineNotice";
import { Ico } from "../shared/ui/Ico";
import { useStageQuotes } from "../features/compare/api";
import { usePerformance, useWithdraw } from "../features/performance/api";
import { ConfirmModal } from "../features/performance/ConfirmModal";
import { dateLabel, hm, nextActionText, STAGE_NAME, STAGE_STATUS } from "../features/performance/labels";
import { NextStagePanel } from "../features/performance/NextStagePanel";
import { QuoteCards } from "../features/performance/QuoteCards";
import { FavoriteSuggest } from "../features/offer/FavoriteSuggest";
import { PerformanceReviews } from "../features/review/PerformanceReviews";
import { DDay, RqSteps, Thumb, splitFirst } from "../features/performance/v4";
import { CONDITIONS, FORMS, SERVICES, TASKS, VENUE_TYPES } from "../features/request/codes";
import { usePageMeta } from "../features/seo/usePageMeta";

/** 받침이 있으면 "을", 없으면 "를" (공연장을 · 장비를 · 엔지니어를) */
function withObj(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${hasFinal ? "을" : "를"}`;
}

const EDITABLE = ["DRAFT", "PUBLISHED", "ASSIGNING", "AWAITING_PAYMENT"];
const POSTED = ["PUBLISHED", "ASSIGNING"];
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const labelOf = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
const region = (p: { sido: string; sigungu: string }) => `${p.sido.replace(/(광역시|특별시|특별자치시|도)$/, "")} ${p.sigungu}`;

type StepState = "done" | "now" | "wait" | "skip";
function stepState(s: StageSummary): StepState {
  if (s.status === "CONFIRMED") return "done";
  if (s.status === "SKIPPED") return "skip";
  if (s.status === "OPEN" || s.status === "NEGOTIATING" || s.status === "RECHECK") return "now";
  return "wait";
}

/** 확정한 견적서 (단계별 비교 API #48 에서 CONFIRMED 인 것) */
function ConfirmedQuote({ stage }: { stage: StageSummary }) {
  const quotes = useStageQuotes(stage.id);
  const q = quotes.data?.find((x) => x.status === "CONFIRMED");
  if (!q) return <p className="muted">확정한 견적서를 불러오는 중이에요.</p>;
  return (
    <div className="kv4">
      <div>
        <span>{stage.stageType === "VENUE" ? "공간" : "견적서"}</span>
        <b>{q.venueName ?? q.label}</b>
      </div>
      <div>
        <span>견적서</span>
        <b>
          {q.label} v{q.version}
        </b>
      </div>
      <div>
        <span>자동 검사</span>
        <b>{q.overall === "PASS" ? "통과" : q.overall === "CONFLICT" ? "충돌" : "확인 필요"}</b>
      </div>
      <div>
        <span>금액</span>
        <b>{won(q.totalAmount)}</b>
      </div>
    </div>
  );
}

function StepRow({ p, s, index, last }: { p: PerformanceDetail; s: StageSummary; index: number; last: boolean }) {
  const state = stepState(s);
  const [open, setOpen] = useState(state === "now" || (p.nextStageId === s.id && p.nextAction === "OPEN_NEXT"));
  const bodyId = `step${index + 1}-body`;
  const name = STAGE_NAME[s.stageType];
  const isNext = p.nextStageId === s.id;
  const [lead, rest] = splitFirst(nextActionText(p.nextAction, s));
  const prev = index > 0 ? STAGE_NAME[p.stages[index - 1].stageType] : null;
  const hint =
    state === "done"
      ? "확정"
      : state === "now"
        ? `견적서 ${s.quoteCount ?? 0}건`
        : state === "skip"
          ? "직접 준비해요"
          : prev
            ? `${withObj(prev)} 확정하면 열려요.`
            : "공고를 게시하면 열려요.";

  return (
    <section className={open ? "stp is-open" : "stp"} data-state={state} aria-label={`STEP 0${index + 1} ${name}`}>
      <div className="stp__head">
        <button className="stp__toggle" type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          <span className="stp__no">STEP 0{index + 1}</span>
          {state === "done" ? (
            <span className="status status--pass">
              <Ico name="pass" />
              확정
            </span>
          ) : (
            <span className={state === "now" ? "state state--on" : "state"}>{STAGE_STATUS[s.status]}</span>
          )}
          <span className="stp__title">{state === "now" ? `${name} 견적서 비교` : name}</span>
          <span className="muted">{hint}</span>
          <span className="stp__chev" aria-hidden="true">
            <Ico name="right" />
          </span>
        </button>
        {state === "now" && (s.quoteCount ?? 0) > 0 && (
          <Link className="btn btn--sm btn--primary" to={`/performances/${p.id}/compare`}>
            단계별 비교
          </Link>
        )}
      </div>
      <div className="stp__body" id={bodyId} role="region" aria-label={`STEP 0${index + 1} ${name} 내용`}>
        <div className="stp__clip">
          <div className="stp__inner">
            {state === "done" && open && <ConfirmedQuote stage={s} />}
            {state === "now" && (
              <>
                {isNext && (
                  <div className={p.nextAction === "WAIT_QUOTES" ? "todo todo--quiet" : "todo"}>
                    <Ico name="doc" />
                    <div className="grow">
                      <b>{lead}</b> {rest}
                    </div>
                  </div>
                )}
                <p className="stat-line">
                  <span>
                    단계 상태<b>{STAGE_STATUS[s.status]}</b>
                  </span>
                  <span>
                    받은 견적서<b>{s.quoteCount ?? 0}건</b>
                  </span>
                </p>
                {(s.quoteCount ?? 0) > 0 && <QuoteCards stage={s} />}
                <p className="muted mt-12" style={{ fontSize: 13 }}>
                  한 단계에서 여러 업체와 채팅할 수 있지만, 확정은 한 업체만 할 수 있어요.
                </p>
                {(s.status === "OPEN" || s.status === "NEGOTIATING") && <FavoriteSuggest stage={s} title={p.title} />}
              </>
            )}
            {state === "done" && isNext && p.nextAction === "OPEN_NEXT" && (
              <div className="todo">
                <Ico name="doc" />
                <div className="grow">
                  <b>{lead}</b> {rest}
                  <NextStagePanel performance={p} />
                </div>
              </div>
            )}
            {state === "wait" && (
              <p className="muted">
                {prev ? `${withObj(prev)} 확정하면 ${name} 업체에 공고가 열려요.` : `공고를 게시하면 ${name} 업체에 공고가 열려요.`}
                {last ? "" : " 필요 없으면 그때 건너뛸 수 있어요."}
              </p>
            )}
            {state === "skip" && <p className="muted">이 단계는 건너뛰었어요. 필요한 장비·인력은 직접 준비해요.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function RequestTable({ p }: { p: PerformanceDetail }) {
  const n = p.needs;
  const needs = [
    n.venue.needed && `공연장${n.venue.types.length ? ` (${n.venue.types.map((t) => labelOf(VENUE_TYPES, t)).join(", ")})` : ""}`,
    n.equipment.needed &&
      `장비${n.equipment.proposalWanted ? " (업체 제안 받기)" : n.equipment.items.length ? ` (${n.equipment.items.map((i) => `${i.name} ${i.qty}`).join(", ")})` : ""}${
        n.equipment.services.length ? ` · ${n.equipment.services.map((v) => labelOf(SERVICES, v)).join(", ")}` : ""
      }`,
    n.engineer.needed &&
      `엔지니어${n.engineer.tasks.length ? ` (${n.engineer.tasks.map((t) => labelOf(TASKS, t).replace(/ \(.*\)$/, "")).join(", ")})` : ""}${
        n.engineer.conditions.length ? ` · ${n.engineer.conditions.map((c) => labelOf(CONDITIONS, c)).join(", ")}` : ""
      }`,
  ].filter(Boolean);
  const lineup = p.lineup.map((l) => `${l.part} ${l.count}`).join(", ");
  return (
    <div className="table-box">
      <table className="info-table pf-info">
        <tbody>
          <tr>
            <th scope="row">공연명</th>
            <td>{p.title}</td>
            <th scope="row">형태 · 편성</th>
            <td>
              {labelOf(FORMS, p.form)}
              {lineup && ` · ${lineup}`}
            </td>
          </tr>
          <tr>
            <th scope="row">날짜 · 시간</th>
            <td className="num">
              {dateLabel(p.showDate)} {hm(p.showStart)}~{hm(p.showEnd)}
            </td>
            <th scope="row">리허설</th>
            <td className="num">{hm(p.rehearsalStart)}</td>
          </tr>
          <tr>
            <th scope="row">지역</th>
            <td>{region(p)}</td>
            <th scope="row">관객</th>
            <td>{p.audience}명</td>
          </tr>
          <tr>
            <th scope="row">필요해요</th>
            <td colSpan={3}>{needs.join(" · ") || "없음"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function PerformancePage() {
  const id = Number(useParams().id);
  const perf = usePerformance(id);
  usePageMeta(perf.data?.title);
  const withdraw = useWithdraw();
  const [askWithdraw, setAskWithdraw] = useState(false);

  if (perf.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (!perf.data) return <ErrorNotice error={perf.error} />;
  const p = perf.data;
  const group = p.status === "DRAFT" ? "작성 중" : ["COMPLETED", "CANCELLED", "WITHDRAWN"].includes(p.status) ? "지난 공연" : "진행 중";

  return (
    <>
      <div className="page-top">
        <div className="container page-top__inner">
          <div className="page-top__lead">
            <Thumb form={p.form} />
            <div>
              <ol className="page-top__crumb" aria-label="현재 위치">
                <li>
                  <Link to="/me/performances">내 공연</Link>
                </li>
                <li>{group}</li>
              </ol>
              <h1>
                {p.title} <DDay showDate={p.showDate} point />
              </h1>
              <div className="page-top__meta">
                <span>
                  <Ico name="calendar" sm />
                  {dateLabel(p.showDate)}
                </span>
                <span>
                  공연 {hm(p.showStart)}~{hm(p.showEnd)} · 리허설 {hm(p.rehearsalStart)}
                </span>
                <span>
                  <Ico name="pin" sm />
                  {region(p)}
                </span>
                <span>관객 {p.audience}명</span>
                <span>요청서 v{p.currentVersion}</span>
              </div>
            </div>
          </div>
          <div className="page-top__actions">
            {EDITABLE.includes(p.status) && (
              <Link className="btn btn--sm" to={`/performances/${p.id}/edit`}>
                <Ico name="edit" sm />
                요청서 수정
              </Link>
            )}
            {POSTED.includes(p.status) && (
              <button className="btn btn--sm btn--ghost" type="button" onClick={() => setAskWithdraw(true)}>
                공고 내리기
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="container main">
        <DeadlineNotice deadline={p.paymentDeadline} what={p.status === "AWAITING_PAYMENT" ? "결제" : "남은 업체 선택과 결제"} />
        {(p.status === "CONFIRMED" || p.status === "COMPLETED") && <PerformanceReviews performanceId={p.id} />}
        <section className="sec">
          <div className="sec-head">
            <h2>
              <Ico name="layers" />
              섭외 진행
            </h2>
          </div>
          <div className="st-box">
            <RqSteps stages={p.stages} />
          </div>
          {p.nextAction === "PAY" && (
            <div className="todo">
              <Ico name="receipt" />
              <div className="grow">
                <b>섭외가 모두 끝났어요.</b> 통합 청구서를 확인하고 테스트 결제를 해 주세요. 실제 청구되지 않습니다.
              </div>
              <Link className="btn btn--sm btn--primary" to={`/performances/${p.id}/order`}>
                청구서 보기
              </Link>
            </div>
          )}
          {p.nextAction === "DONE" && (
            <div className="todo todo--quiet">
              <Ico name="pass" />
              <div className="grow">
                <b>테스트 결제가 끝났어요.</b> 결제금은 공연이 끝날 때까지 보관돼요.
              </div>
              <Link className="btn btn--sm" to={`/performances/${p.id}/order`}>
                청구서 보기
              </Link>
            </div>
          )}
          <div className="steps">
            {p.stages.map((s, i) => (
              <StepRow key={s.id} p={p} s={s} index={i} last={i === p.stages.length - 1} />
            ))}
          </div>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2>
              <Ico name="doc" />
              요청서
            </h2>
            {EDITABLE.includes(p.status) && (
              <div className="sec-head__side">
                <Link className="link" to={`/performances/${p.id}/edit`}>
                  고치기
                  <Ico name="right" sm />
                </Link>
              </div>
            )}
          </div>
          <RequestTable p={p} />
        </section>
      </main>

      {askWithdraw && (
        <ConfirmModal
          title="공고를 내릴까요?"
          confirmLabel="내리기"
          danger
          loading={withdraw.isPending}
          error={withdraw.error}
          onCancel={() => setAskWithdraw(false)}
          onConfirm={() => withdraw.mutate(p.id, { onSuccess: () => setAskWithdraw(false) })}
        >
          <p>내리면 업체에게 공고가 더 이상 보이지 않아요. 채팅 중인 업체가 있으면 반려로 셀 수 있어요.</p>
        </ConfirmModal>
      )}
    </>
  );
}
