/**
 * 내 공연 (/me/performances, #40). 사용자 역할만. 목업 v4 my.html — 공연마다 사진·제목·D-day·정보 줄 + 섭외 진행 + 할 일.
 * AC-F5-02: "공연장 확정 → 장비 조율 중 (견적 2건) → 엔지니어 대기"처럼 단계와 다음 할 일이 보인다.
 * 묶음: 진행 중 / 작성 중(보내지 않은 요청서) / 지난 공연.
 */
import { Link } from "react-router-dom";
import type { PerformanceStatus, PerformanceSummary } from "../shared/api/types";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { usePostingLimit, useMyPerformances, type PostingLimit } from "../features/performance/api";
import { Ico } from "../shared/ui/Ico";
import { dateLabel, hm, nextActionText, STAGE_NAME } from "../features/performance/labels";
import { DDay, RqSteps, Thumb, splitFirst } from "../features/performance/v4";
import { usePageMeta } from "../features/seo/usePageMeta";

/** "11월 13일 14:00" */
function at(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** AC-F4-05: 공고를 여러 번 내려 게시가 막혀 있으면 언제부터 되는지 알려 준다 (FR-POL-02) */
export function PostingLimitNotice({ limit }: { limit: PostingLimit }) {
  if (!limit.limited || !limit.availableAt) return null;
  return (
    <div className="notice notice--warn" role="status">
      <Ico name="clock" />
      <div>
        공고를 여러 번 내려서 <b>{at(limit.availableAt)}</b> 이후에 새 공고를 게시할 수 있어요. (채팅 후 내림 {limit.afterChat}회 · 견적서만 받고 내림{" "}
        {limit.noChat}회, 마지막으로 내린 뒤 180일이 지나면 0회가 돼요)
      </div>
    </div>
  );
}

function Meta({ p, ended = false }: { p: PerformanceSummary; ended?: boolean }) {
  return (
    <div className="page-top__meta">
      <span>
        <Ico name="calendar" sm />
        {dateLabel(p.showDate)}
        {ended && " · 공연 종료"}
      </span>
      {!ended && (
        <span>
          공연 {hm(p.showStart)}~{hm(p.showEnd)} · 리허설 {hm(p.rehearsalStart)}
        </span>
      )}
      <span>
        <Ico name="pin" sm />
        {p.sido.replace(/(광역시|특별시|특별자치시|도)$/, "")} {p.sigungu}
      </span>
      <span>관객 {p.audience}명</span>
    </div>
  );
}

/** 할 일 줄의 버튼 (목업: 채팅에서 확인 · 청구서 보기 · 단계별 비교). 청구서는 #187 /performances/:id/order */
function todoAction(p: PerformanceSummary): { label: string; to: string; primary: boolean } | null {
  const stage = p.stages.find((s) => s.id === p.nextStageId);
  switch (p.nextAction) {
    case "OPEN_NEXT":
      return { label: "다음 단계로", to: `/performances/${p.id}/next`, primary: true };
    case "NEGOTIATE":
      return { label: "단계별 비교", to: `/performances/${p.id}/compare`, primary: true };
    case "WAIT_QUOTES":
      return stage && (stage.quoteCount ?? 0) > 0 ? { label: "단계별 비교", to: `/performances/${p.id}/compare`, primary: false } : null;
    case "RECHECK":
      return { label: "공연 보기", to: `/performances/${p.id}`, primary: true };
    case "PAY":
      return { label: "청구서 보기", to: `/performances/${p.id}/order`, primary: true };
    case "DONE":
      return { label: "청구서 보기", to: `/performances/${p.id}/order`, primary: false };
    default:
      return null;
  }
}

function Active({ p }: { p: PerformanceSummary }) {
  const titleId = `perf-${p.id}-title`;
  const stage = p.stages.find((s) => s.id === p.nextStageId);
  const [lead, rest] = splitFirst(nextActionText(p.nextAction, stage));
  const action = todoAction(p);
  const quiet = p.nextAction === "WAIT_QUOTES";
  return (
    <article className="pf" aria-labelledby={titleId}>
      <div className="pf__head">
        <Thumb form={p.form} />
        <div className="grow">
          <h3 className="pf__name">
            <Link id={titleId} to={`/performances/${p.id}`}>
              {p.title}
            </Link>{" "}
            <DDay showDate={p.showDate} />
          </h3>
          <Meta p={p} />
        </div>
        <Link className="btn btn--sm" to={`/performances/${p.id}`}>
          공연 보기
        </Link>
      </div>
      <div className="pf__body">
        <RqSteps stages={p.stages} />
        <div className={quiet ? "todo todo--quiet" : "todo"}>
          <div className="grow">
            <b>{lead}</b> {rest}
          </div>
          {action && (
            <Link className={action.primary ? "btn btn--sm btn--primary" : "btn btn--sm"} to={action.to}>
              {action.label}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function Draft({ p }: { p: PerformanceSummary }) {
  const titleId = `perf-${p.id}-title`;
  return (
    <article className="pf pf--draft" aria-labelledby={titleId}>
      <div className="pf__head">
        <Thumb empty />
        <div className="grow">
          <h3 className="pf__name">
            <span id={titleId}>{p.title}</span> <span className="tag tag--tbd">임시 저장</span>
          </h3>
          <div className="page-top__meta">
            <span>
              <Ico name="calendar" sm />
              {dateLabel(p.showDate)}
            </span>
            <span>
              {p.sido.replace(/(광역시|특별시|특별자치시|도)$/, "")} {p.sigungu}
            </span>
          </div>
        </div>
        <Link className="btn btn--sm btn--primary" to={`/performances/${p.id}/edit`}>
          이어서 쓰기
        </Link>
      </div>
    </article>
  );
}

const PAST_STATUS: Partial<Record<PerformanceStatus, { label: string; pass: boolean }>> = {
  COMPLETED: { label: "공연 종료", pass: true },
  CANCELLED: { label: "취소", pass: false },
  WITHDRAWN: { label: "공고 내림", pass: false },
};

function Past({ p }: { p: PerformanceSummary }) {
  const titleId = `perf-${p.id}-title`;
  const st = PAST_STATUS[p.status];
  return (
    <article className="pf pf--past" aria-labelledby={titleId}>
      <div className="pf__head">
        <Thumb form={p.form} />
        <div className="grow">
          <h3 className="pf__name">
            <Link id={titleId} to={`/performances/${p.id}`}>
              {p.title}
            </Link>{" "}
            {st && (
              <span className={st.pass ? "status status--pass" : "status"}>
                {st.pass && <Ico name="pass" />}
                {st.label}
              </span>
            )}
          </h3>
          <Meta p={p} ended />
          {p.stages.length > 0 && (
            <ol className="track-line" aria-label="섭외 진행">
              {p.stages.map((s) => (
                <li key={s.id} className={s.status === "CONFIRMED" ? "is-done" : s.status === "SKIPPED" ? "is-skip" : undefined}>
                  {STAGE_NAME[s.stageType]}
                </li>
              ))}
            </ol>
          )}
        </div>
        <Link className="btn btn--sm" to={`/performances/${p.id}`}>
          공연 보기
        </Link>
      </div>
    </article>
  );
}

function Section({ title, desc, items, Row }: { title: string; desc?: string; items: PerformanceSummary[]; Row: (props: { p: PerformanceSummary }) => JSX.Element }) {
  if (items.length === 0) return null;
  return (
    <section className="sec">
      <div className="sec-head">
        <div>
          <h2>
            {title} <em className="sd-num">{items.length}</em>
          </h2>
          {desc && <p>{desc}</p>}
        </div>
      </div>
      {items.map((p) => (
        <Row key={p.id} p={p} />
      ))}
    </section>
  );
}

export function MyPerformancesPage() {
  const mine = useMyPerformances();
  const limit = usePostingLimit();
  usePageMeta("내 공연");
  const empty = mine.data && mine.data.active.length + mine.data.draft.length + mine.data.past.length === 0;

  return (
    <>
      <KitPageTop
        title="내 공연"
        crumbs={[{ label: "내 공연" }]}
        desc="공연마다 섭외가 어디까지 왔는지와 지금 할 일을 확인하세요."
        actions={
          <Link className="btn btn--primary" to="/performances/new">
            <Ico name="plus" />
            새 요청서 쓰기
          </Link>
        }
      />
      <main className="container main">
        {mine.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        <ErrorNotice error={mine.error} />
        {limit.data && <PostingLimitNotice limit={limit.data} />}
        {empty && (
          <div className="empty" role="status">
            <Ico name="music" />
            <b>아직 준비 중인 공연이 없어요</b>
            <p>요청서를 쓰면 공연장부터 차례로 업체 견적서를 받을 수 있어요.</p>
            <Link className="btn btn--sm btn--primary" to="/performances/new">
              요청서 쓰기
            </Link>
          </div>
        )}
        {mine.data && (
          <>
            <Section title="진행 중" items={mine.data.active} Row={Active} />
            <Section title="작성 중" desc="보내지 않은 요청서예요." items={mine.data.draft} Row={Draft} />
            <Section title="지난 공연" items={mine.data.past} Row={Past} />
          </>
        )}
      </main>
    </>
  );
}
