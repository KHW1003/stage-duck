/**
 * 메인 히어로 오른쪽 (로그인한 사용자): 내가 준비하는 공연 (mockup/home.html .now).
 * 진행 중인 공연(GET /me/performances 의 active 첫 번째)을 단계별로 보여 준다. 없으면 요청서 쓰기 안내.
 * 단계 상태는 서버 값(stages[].status)으로만 고른다. 금액·업체 이름은 견적서 묶음(3번)이 내주면 small 줄에 더한다.
 */
import { Link } from "react-router-dom";
import type { PerformanceSummary, StageSummary } from "../../shared/api/types";
import { STAGE_NAME, dateLabel, hm } from "../performance/labels";
import { cx } from "./cx";
import { HomeIcon } from "./icons";
import s from "./home.module.css";

/** 오늘부터 공연일까지 남은 날 (D-15). 공연일이 지났으면 null */
export function dDay(showDate: string, today = new Date()): string | null {
  const [y, m, d] = showDate.split("-").map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000);
  if (diff < 0) return null;
  return diff === 0 ? "D-DAY" : `D-${diff}`;
}

type RowState = "done" | "current" | "wait";

function rowState(stage: StageSummary): RowState {
  if (stage.status === "CONFIRMED" || stage.status === "SKIPPED") return "done";
  if (stage.status === "WAITING") return "wait";
  return "current";
}

function rowText(stage: StageSummary, prev?: StageSummary): string {
  switch (stage.status) {
    case "CONFIRMED":
      return "컨펌했어요";
    case "SKIPPED":
      return "건너뛰었어요";
    case "OPEN":
    case "NEGOTIATING":
      return stage.quoteCount ? `견적서 ${stage.quoteCount}장 도착` : "견적서를 기다리고 있어요";
    case "RECHECK":
      return "요청서가 바뀌어 다시 확인이 필요해요";
    case "WAITING":
      return prev ? `${STAGE_NAME[prev.stageType]}${prev.stageType === "VENUE" ? "을" : "를"} 컨펌하면 공고가 열려요` : "앞 단계가 끝나면 열려요";
  }
}

const ROW_CLASS: Record<RowState, string> = { done: s.isDone, current: s.isCurrent, wait: s.isWait };

export function NowPanel({ perf }: { perf: PerformanceSummary | null }) {
  if (!perf) {
    return (
      <div className={s.now}>
        <div className={s.nowHead}>
          <div>
            <p className={s.nowLabel}>내가 준비하는 공연</p>
            <h2>아직 준비 중인 공연이 없어요</h2>
            <p className={s.nowMeta}>요청서를 쓰면 공연장, 장비, 엔지니어 업체의 견적서를 차례로 받아요.</p>
          </div>
        </div>
        <Link className={s.nowMore} to="/performances/new">
          새 공연 요청서 쓰기 <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }
  const stages = [...perf.stages].sort((a, b) => a.seq - b.seq);
  const done = stages.filter((st) => rowState(st) === "done").length;
  const badge = dDay(perf.showDate);
  return (
    <div className={s.now}>
      <div className={s.nowHead}>
        <div>
          <p className={s.nowLabel}>내가 준비하는 공연</p>
          <h2>{perf.title}</h2>
          <p className={s.nowMeta}>
            {perf.sido} · {dateLabel(perf.showDate)} · 리허설 {hm(perf.rehearsalStart)} · 공연 {hm(perf.showStart)}
          </p>
        </div>
        {badge && <span className={cx(s.badge, s.badgeBlue)}>{badge}</span>}
      </div>
      <div className={s.nowProgress} aria-label={`${stages.length}단계 중 ${done}단계 컨펌`}>
        <span style={{ width: `${stages.length ? (done / stages.length) * 100 : 0}%` }} />
      </div>
      <ol className={s.nowSteps}>
        {stages.map((st, i) => {
          const state = rowState(st);
          return (
            <li key={st.id} className={cx(s.stepRow, ROW_CLASS[state])}>
              <span className={s.stepRowNo}>{i + 1}</span>
              <div>
                <b>{STAGE_NAME[st.stageType]}</b>
                <small>{rowText(st, stages[i - 1])}</small>
              </div>
              {state === "done" && (
                <span className={cx(s.status, s.statusPass)}>
                  <HomeIcon name="pass" />
                  {st.status === "SKIPPED" ? "건너뜀" : "컨펌"}
                </span>
              )}
              {state === "current" && (
                <Link className={cx(s.btn, s.btnSm, s.btnPrimary)} to={`/performances/${perf.id}`}>
                  {st.status === "RECHECK" ? "확인하기" : "비교하기"}
                </Link>
              )}
              {state === "wait" && <span className={cx(s.status, s.statusInfo)}>대기</span>}
            </li>
          );
        })}
      </ol>
      <Link className={s.nowMore} to="/me/performances">
        공연 현황 전체 보기 <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
