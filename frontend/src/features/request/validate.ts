/**
 * 화면 쪽 입력 확인 (보조). 기준은 서버 검사(backend/app/request/calc.py)이고, 문구도 서버와 같게 둔다.
 * 돌려주는 값: { 칸 이름(api 이름): 이유 }. 비어 있으면 넘어가도 된다.
 */
import type { PerformanceNeeds } from "../../shared/api/types";

export const MIN_LEAD_DAYS = 14; // 공연 14일 전까지만 요청 (D-53)

export interface Step1Form {
  title: string;
  form: string;
  lineup: { part: string; count: string }[];
  showDate: string;
  rehearsalStart: string;
  showStart: string;
  showEnd: string;
  audience: string;
  sido: string;
  sigungu: string;
  contactPhone: string;
}

export type Errors = Record<string, string>;

/** 오늘로부터 14일 뒤 (YYYY-MM-DD, 이 기기 날짜 기준) */
export function earliestShowDate(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MIN_LEAD_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** AC-F2-04·05·06. originalShowDate: 수정에서 날짜를 그대로 두면 14일 규칙을 보지 않는다 (서버와 같음, #37) */
export function step1Errors(f: Step1Form, today: Date, originalShowDate?: string): Errors {
  const e: Errors = {};
  if (!f.title.trim()) e.title = "공연명을 적어 주세요.";
  if (!f.form) e.form = "공연 형태를 골라 주세요.";
  const first = earliestShowDate(today);
  if (!f.showDate) e.showDate = "공연 날짜를 골라 주세요.";
  else if (f.showDate !== originalShowDate && f.showDate < first) {
    const [, m, d] = first.split("-").map(Number);
    e.showDate = `공연 ${MIN_LEAD_DAYS}일 전까지만 요청할 수 있어요. ${m}월 ${d}일 이후 날짜를 골라 주세요.`;
  }
  if (!f.rehearsalStart || !f.showStart || !f.showEnd) {
    if (!f.rehearsalStart) e.rehearsalStart = "리허설 시작 시각을 적어 주세요.";
    if (!f.showStart) e.showStart = "공연 시작 시각을 적어 주세요.";
    if (!f.showEnd) e.showEnd = "공연 종료 시각을 적어 주세요.";
  } else {
    if (!(f.rehearsalStart < f.showStart)) e.rehearsalStart = "리허설 시작은 공연 시작보다 빨라야 해요. 시각을 다시 확인해 주세요.";
    if (!(f.showStart < f.showEnd)) e.showEnd = "공연 종료는 공연 시작보다 늦어야 해요. 시각을 다시 확인해 주세요.";
  }
  const audience = Number(f.audience);
  if (!f.audience.trim() || !Number.isInteger(audience) || audience < 1 || audience > 500)
    e.audience = "예상 관객은 1명에서 500명 사이로 적어 주세요.";
  if (!f.sido) e.sido = "지역(시·도)을 골라 주세요.";
  if (!f.sigungu.trim()) e.sigungu = "지역(시·군·구)을 골라 주세요.";
  return e;
}

/** AC-F2-10 (+ 필요한 단계가 하나도 없으면 게시할 수 없다) */
export function step2Errors(n: PerformanceNeeds): Errors {
  const e: Errors = {};
  if (!n.venue.needed && !n.equipment.needed && !n.engineer.needed) e.needs = "섭외가 필요한 단계를 하나 이상 골라 주세요.";
  if (n.engineer.needed && n.engineer.tasks.length === 0) e["needs.engineer.tasks"] = "엔지니어에게 맡길 작업을 하나 이상 골라 주세요.";
  for (const part of ["venue", "equipment", "engineer"] as const) {
    if (n[part].note.length > 500) e[`needs.${part}.note`] = "추가 요청은 500자까지 적을 수 있어요.";
  }
  return e;
}

export const STEP1_FIELDS = ["title", "form", "lineup", "showDate", "rehearsalStart", "showStart", "showEnd", "audience", "sido", "sigungu", "contactPhone"];
