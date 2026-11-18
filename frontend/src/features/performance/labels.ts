/**
 * 내 공연 화면 문구. 상태 코드는 서버가 정하고, 화면은 이 표로 말만 고른다 (CLAUDE.md 4장, 문구.md 7장).
 */
import type { NextAction, StageStatus, StageSummary, StageType } from "../../shared/api/types";

export const STAGE_NAME: Record<StageType, string> = { VENUE: "공연장", EQUIPMENT: "장비", ENGINEER: "엔지니어" };
const STAGE_OBJ: Record<StageType, string> = { VENUE: "공연장을", EQUIPMENT: "장비를", ENGINEER: "엔지니어를" };

export const STAGE_STATUS: Record<StageStatus, string> = {
  WAITING: "대기",
  OPEN: "모집 중",
  NEGOTIATING: "조율 중",
  CONFIRMED: "확정",
  SKIPPED: "건너뜀",
  RECHECK: "재확인 필요",
};

/** "장비 조율 중 · 견적 2건" (AC-F5-02). 견적서 수는 모집·조율 중일 때만 */
export function stageLine(stage: StageSummary): string {
  const base = `${STAGE_NAME[stage.stageType]} ${STAGE_STATUS[stage.status]}`;
  const counting = stage.status === "OPEN" || stage.status === "NEGOTIATING";
  return counting && stage.quoteCount !== null ? `${base} · 견적 ${stage.quoteCount}건` : base;
}

/** 다음 할 일 안내 (NFR-UX-06). stage = 그 일이 걸린 단계 */
export function nextActionText(action: NextAction, stage?: StageSummary): string {
  const name = stage ? STAGE_NAME[stage.stageType] : "";
  switch (action) {
    case "PUBLISH":
      return "보내지 않은 요청서예요. 이어서 써서 게시해 주세요.";
    case "WAIT_QUOTES":
      return `${name} 업체의 견적서를 기다리고 있어요. 견적서가 오면 알림으로 알려 드려요.`;
    case "NEGOTIATE":
      return `${name} 업체와 채팅으로 조율하고 있어요. 견적서를 비교하고 확정해 주세요.`;
    case "RECHECK":
      return `요청서가 바뀌어서 ${name} 업체에 다시 확인을 받아야 해요. 재확인 전에는 결제할 수 없어요.`;
    case "OPEN_NEXT":
      return `${stage ? STAGE_OBJ[stage.stageType] : ""} 정했어요. 다음 단계로 넘어가 주세요.`;
    case "PAY":
      return "섭외가 모두 끝났어요. 통합 청구서를 확인하고 테스트 결제를 해 주세요. 실제 청구되지 않습니다.";
    case "DONE":
      return "섭외가 모두 확정됐어요 (결제 완료).";
    case "NONE":
      return "내렸거나 취소한 공고예요.";
  }
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "11월 28일(토)" */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일(${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

/** "19:00:00" → "19:00" */
export const hm = (t: string) => t.slice(0, 5);

