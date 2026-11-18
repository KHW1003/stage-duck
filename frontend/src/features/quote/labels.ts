/**
 * 공고 화면 문구. 코드 → 화면 이름은 요청서 선택지(request/codes.ts)와 같은 표를 쓴다 (CLAUDE.md 4장).
 */
import type { PostingSummary } from "../../shared/api/types";
import { FORMS, MUST_HAVE, SERVICES, TASKS, VENUE_TYPES, type Option } from "../request/codes";
import { STAGE_NAME } from "../performance/labels";

export { dateLabel, hm, STAGE_NAME } from "../performance/labels";

/** 코드 → 이름. 표에 없으면 코드를 그대로 */
export function optionLabel(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export const formLabel = (v: string) => optionLabel(FORMS, v);
export const venueTypeLabel = (v: string) => optionLabel(VENUE_TYPES, v);
export const servicesLabel = (vs: string[]) => vs.map((v) => optionLabel(SERVICES, v)).join(" · ");
export const tasksLabel = (vs: string[]) => vs.map((v) => optionLabel(TASKS, v)).join(", ");
export const conditionLabel = (v: string) => optionLabel(MUST_HAVE, v);

/** 공간 조건 값: true 있음·가능 / false 없음·불가 / null 미확인 (VenueSnapshot.conditions) */
export function conditionValue(v: boolean | null): string {
  if (v === null) return "확인 필요";
  return v ? "가능" : "불가";
}

/** "장비 단계" */
export const stageTag = (p: Pick<PostingSummary, "stageType">) => `${STAGE_NAME[p.stageType]} 단계`;

/** AC-F4-07: 닉네임 옆 "이용 2 · 반려 1" */
export const userCounts = (p: Pick<PostingSummary, "usageCount" | "rejectionCount">) =>
  `이용 ${p.usageCount} · 반려 ${p.rejectionCount}`;

export const nicknameOf = (p: Pick<PostingSummary, "nickname">) => p.nickname ?? "닉네임 없음";
