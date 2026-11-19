/**
 * 내 공연·공연 상세가 같이 쓰는 목업 v4 부품 (my.html · performance.html).
 * - Thumb: 공연 형태별 기본 사진 (사진 올리기는 MVP 밖)
 * - DDay: 공연까지 남은 날 (D-12, D-DAY, 지나면 표시 안 함)
 * - RqSteps: 섭외 진행 — 원 + 선. 색만으로 구분하지 않고 상태 글자를 같이 쓴다 (CLAUDE.md 4장)
 */
import type { CSSProperties } from "react";
import type { PerformanceForm, StageSummary } from "../../shared/api/types";
import { Ico } from "../../shared/ui/Ico";
import { STAGE_NAME, STAGE_STATUS } from "./labels";
import "./perf-v4.css";

const PHOTO: Partial<Record<PerformanceForm, string>> = { BAND: "/photos/photo-1598387993441-a364f854c3e1.jpg" };
const DEFAULT_PHOTO = "/photos/photo-1501386761578-eac5c94b800a.jpg";

export function Thumb({ form, empty = false }: { form?: PerformanceForm; empty?: boolean }) {
  const url = empty ? null : (form && PHOTO[form]) || DEFAULT_PHOTO;
  return (
    <span
      className="page-top__thumb"
      style={url ? ({ ["--img" as string]: `url('${url}')` } as CSSProperties) : undefined}
      role="img"
      aria-label={empty ? "사진 없음" : form === "BAND" ? "밴드 공연 기본 이미지" : "공연 기본 이미지"}
    />
  );
}

/** 오늘(로컬) 기준 남은 날. 지난 공연은 null */
export function dDayOf(showDate: string, today = new Date()): string | null {
  const [y, m, d] = showDate.split("-").map(Number);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((new Date(y, m - 1, d).getTime() - base.getTime()) / 86_400_000);
  if (days < 0) return null;
  return days === 0 ? "D-DAY" : `D-${days}`;
}

/** point: 공연 상세 제목 옆은 파란 테두리 (목업 tag--point) */
export function DDay({ showDate, point = false }: { showDate: string; point?: boolean }) {
  const label = dDayOf(showDate);
  return label ? <span className={point ? "tag tag--point" : "tag"}>{label}</span> : null;
}

function stepClass(s: StageSummary): string {
  if (s.status === "CONFIRMED") return "is-done";
  if (s.status === "SKIPPED") return "is-skip";
  if (s.status === "OPEN" || s.status === "NEGOTIATING" || s.status === "RECHECK") return "is-now";
  return "";
}

/** "확정" · "조율 중 · 견적 2건" · "대기" */
export function stepText(s: StageSummary): string {
  const counting = s.status === "OPEN" || s.status === "NEGOTIATING";
  return counting && s.quoteCount !== null ? `${STAGE_STATUS[s.status]} · 견적 ${s.quoteCount}건` : STAGE_STATUS[s.status];
}

export function RqSteps({ stages }: { stages: StageSummary[] }) {
  if (stages.length === 0) return null;
  return (
    <ol className="rq-steps" aria-label="섭외 진행">
      {stages.map((s) => {
        const cls = stepClass(s);
        return (
          <li key={s.id} className={cls || undefined}>
            <span className="rq-dot" aria-hidden="true">
              {cls === "is-done" && <Ico name="check" />}
              {cls === "is-now" && <Ico name="chat" />}
            </span>
            <small>{STAGE_NAME[s.stageType]}</small>
            <b>{stepText(s)}</b>
          </li>
        );
      })}
    </ol>
  );
}

/** 할 일 안내를 "굵은 첫 문장 + 나머지"로 나눈다 (목업 .todo) */
export function splitFirst(text: string): [string, string] {
  const i = text.indexOf(". ");
  return i < 0 ? [text, ""] : [text.slice(0, i + 1), text.slice(i + 2)];
}
