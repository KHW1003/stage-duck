/**
 * API 요청·응답 타입 (api-contract.md 와 같은 이름, camelCase). 묶음마다 자기 타입을 여기에 더한다.
 */

export type Role = "USER" | "SUPPLIER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "WITHDRAWN";
export type SupplierReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";

/** GET /me (#24) — 본인 정보라 연락처를 포함한다 */
export interface Me {
  id: number;
  role: Role;
  status: UserStatus;
  email: string;
  name: string;
  phone: string;
  nickname: string | null;
  supplierReviewStatus: SupplierReviewStatus | null;
  landing: string;
}

/** 업체 1단계 가입 응답·로그인 응답 (POST /auth/signup/supplier, POST /auth/login) */
export interface AuthResult {
  id: number;
  role: Role;
  nickname: string | null;
  landing: string;
}

export interface Agreements {
  service: boolean;
  privacyRequired: boolean;
  privacyOptional: boolean;
  marketing: boolean;
}

/** POST /auth/signup/supplier (FR-SUP-01) */
export interface SupplierSignupRequest {
  email: string;
  password: string;
  name: string;
  phone: string;
  agreements: Agreements;
}

export type BusinessType = "SOLE_PROPRIETOR" | "CORPORATION" | "INDIVIDUAL";
export type SupplierCategory = "VENUE" | "EQUIPMENT" | "INSTALL" | "ENGINEER";

/** POST·PUT /supplier/application (FR-SUP-02). 개인(INDIVIDUAL)은 businessRegNo·businessAddress 를 보내지 않는다 */
export interface SupplierApplicationRequest {
  businessType: BusinessType;
  companyName: string;
  representativeName: string;
  businessRegNo?: string;
  businessAddress?: string;
  mainPhone: string;
  mailOrderNo: string | null;
  categories: SupplierCategory[];
}

/** GET /supplier/application — 내 신청 내용과 심사 상태 (AC-F1-20) */
export interface SupplierApplication {
  businessType: BusinessType;
  companyName: string;
  representativeName: string;
  businessRegNo: string | null;
  businessAddress: string | null;
  mainPhone: string;
  mailOrderNo: string | null;
  categories: SupplierCategory[];
  reviewStatus: SupplierReviewStatus;
  rejectReason: string | null;
  appliedAt: string;
}

// ---- 공연 요청서 (api-contract.md 3.2, 묶음 2) ----
export type PerformanceForm = "BAND" | "THEATER" | "TALK_EVENT" | "RELIGIOUS" | "ETC";
export type PerformanceStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ASSIGNING"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "WITHDRAWN";
export type StageType = "VENUE" | "EQUIPMENT" | "ENGINEER";
export type StageStatus = "WAITING" | "OPEN" | "NEGOTIATING" | "CONFIRMED" | "SKIPPED" | "RECHECK";

export interface VenueNeed {
  needed: boolean;
  proposalWanted: boolean;
  types: string[];
  capacity: number | null;
  budget: number | null;
  checkinWish: string | null;
  checkoutWish: string | null;
  mustHave: string[];
  note: string;
}

export interface EquipmentNeed {
  needed: boolean;
  proposalWanted: boolean;
  items: { name: string; qty: number }[];
  services: string[];
  budget: number | null;
  owned: { name: string; detail: string }[];
  note: string;
}

export interface EngineerNeed {
  needed: boolean;
  tasks: string[];
  conditions: string[];
  etc: string;
  note: string;
}

/** STEP2 (data-model.md performances.needs) */
export interface PerformanceNeeds {
  venue: VenueNeed;
  equipment: EquipmentNeed;
  engineer: EngineerNeed;
  ownedVenue: null;
}

/** POST /performances 요청 (STEP1 + STEP2) */
export interface PerformanceRequest {
  title: string;
  form: PerformanceForm;
  lineup: { part: string; count: number }[];
  showDate: string;
  rehearsalStart: string;
  showStart: string;
  showEnd: string;
  audience: number;
  sido: string;
  sigungu: string;
  /** 수정할 때 빼면 저장된 번호를 그대로 둔다 */
  contactPhone?: string | null;
  needs: PerformanceNeeds;
}

export interface PerformanceCreated {
  id: number;
  status: PerformanceStatus;
  currentVersion: number;
}

export interface PerformancePublished {
  id: number;
  status: PerformanceStatus;
  stages: { id: number; stageType: StageType; seq: number; status: StageStatus }[];
}

// ---- 내 공연 현황 (#40) ----
/** 서버가 정한 다음 할 일 (backend request/calc.py next_action) */
export type NextAction = "PUBLISH" | "WAIT_QUOTES" | "NEGOTIATE" | "RECHECK" | "OPEN_NEXT" | "PAY" | "DONE" | "NONE";

export interface StageSummary {
  id: number;
  stageType: StageType;
  seq: number;
  status: StageStatus;
  /** 받은 견적서 수. 아직 연결 전이면 null */
  quoteCount: number | null;
}

export interface PerformanceSummary {
  id: number;
  title: string;
  form: PerformanceForm;
  status: PerformanceStatus;
  showDate: string;
  rehearsalStart: string;
  showStart: string;
  showEnd: string;
  audience: number;
  sido: string;
  sigungu: string;
  currentVersion: number;
  stages: StageSummary[];
  nextAction: NextAction;
  nextStageId: number | null;
}

export interface MyPerformances {
  active: PerformanceSummary[];
  draft: PerformanceSummary[];
  past: PerformanceSummary[];
}

export interface PerformanceDetail extends PerformanceSummary {
  lineup: { part: string; count: number }[];
  needs: PerformanceNeeds;
  hasContactPhone: boolean;
  publishedAt: string | null;
}

export interface AdvanceResult {
  stageId: number;
  stageType: StageType;
  status: StageStatus;
  performanceStatus: PerformanceStatus;
  next: { stageId: number; stageType: StageType; status: StageStatus };
}
