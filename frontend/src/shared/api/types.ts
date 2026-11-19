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

// ---- 공고 목록·상세 (#41, backend quote/schemas.py PostingOut·PostingDetailOut) ----
/** GET /postings 한 줄. 사용자는 닉네임과 반려·이용 횟수만 (AC-F4-07). 연락처·실명은 없다 (AC-F5-12) */
export interface PostingSummary {
  stageId: number;
  performanceId: number;
  stageType: StageType;
  status: StageStatus;
  performanceVersion: number;
  title: string;
  showDate: string;
  sido: string;
  sigungu: string;
  nickname: string | null;
  rejectionCount: number;
  usageCount: number;
}

/** 앞 단계 확정 정보 (AC-F3-03). 확정된 견적서 버전에서 읽는다. 전원은 techNote 에 있다 */
export interface PreviousStage {
  stageType: StageType;
  /** 공연장 단계만. 키는 supplier VenueSnapshot 의 camelCase (venueType, checkinTime, conditions, equipment …) */
  venueSnapshot: {
    name: string;
    venueType: string;
    maxCapacity: number;
    checkinTime: string;
    checkoutTime: string;
    hasResidentEngineer: boolean;
    conditions: Record<string, boolean | null>;
    equipment: { category: string; name: string; quantity: number }[];
  } | null;
  checkinTime: string | null;
  setupAvailableTime: string | null;
  items: { name: string; category: string; qty: number; unitPrice: number; amount: number }[];
  techNote: string | null;
}

/** GET /postings/{stageId} */
export interface PostingDetail extends PostingSummary {
  form: PerformanceForm;
  rehearsalStart: string;
  showStart: string;
  showEnd: string;
  audience: number;
  needs: PerformanceNeeds;
  previousStages: PreviousStage[];
}

// ---- 견적서 보내기 (#41, api-contract.md 3.3 POST /stages/{stageId}/quotes) ----
/** 금액은 모두 원 단위 정수 (부가세 포함) */
export interface QuoteItemIn {
  name: string;
  category: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface QuoteStaffIn {
  role: string;
  count: number;
  start: string;
  end: string;
}

export interface QuoteAmounts {
  items: number;
  transport: number;
  install: number;
  labor: number;
  etc: number;
}

export interface QuoteIn {
  label: string;
  /** 공연장 단계만. 다른 단계는 null */
  venueId: number | null;
  /** 공연장 단계만 필수 ("15:00") */
  checkinTime?: string;
  setupAvailableTime?: string;
  items: QuoteItemIn[];
  staff: QuoteStaffIn[];
  setupStart: string | null;
  setupMinutes: number | null;
  teardownMinutes: number | null;
  /** equipment && engineer 면 서버가 풀스펙으로 표시 (AC-F2-19) */
  includes: { equipment: boolean; engineer: boolean; install: boolean; transport: boolean };
  amounts: QuoteAmounts;
  discountAmount: number;
  /** = amounts 합 − discountAmount. 서버가 다시 검사한다 (TOTAL_MISMATCH) */
  totalAmount: number;
  extraCostNote: string | null;
  validUntil?: string;
  techNote: string | null;
}

/** 자동 검사 한 줄 (api-contract.md 4.1 checks[]) */
export interface QuoteCheck {
  id: string;
  result: "PASS" | "NEEDS_INFO" | "CONFLICT" | "WARNING";
  message: string;
}

/** PUT /quotes/{quoteId} 본문 (AC-F2-20): label 은 바꿀 수 없어 보내지 않고, version 은 지금 버전 (다르면 409 VERSION_CONFLICT) */
export type QuoteUpdateIn = Omit<QuoteIn, "label"> & { version: number };

/** 견적서 버전 하나 (backend quote/schemas.py QuoteVersionOut). 연락처는 없다 */
export interface QuoteVersionOut {
  version: number;
  basedOnPerfVersion: number;
  venueId: number | null;
  venueSnapshot: Record<string, unknown> | null;
  checkinTime: string | null;
  setupAvailableTime: string | null;
  setupStart: string | null;
  setupMinutes: number | null;
  teardownMinutes: number | null;
  staff: QuoteStaffIn[];
  items: QuoteItemIn[];
  includesEquipment: boolean;
  includesEngineer: boolean;
  includesInstall: boolean;
  includesTransport: boolean;
  amountItems: number;
  amountTransport: number;
  amountInstall: number;
  amountLabor: number;
  amountEtc: number;
  discountAmount: number;
  totalAmount: number;
  extraCostNote: string | null;
  validUntil: string | null;
  techNote: string | null;
  createdAt: string;
}

/** GET /quotes/{quoteId}: 견적서 + 현재 버전 + 이력 (AC-F2-20) */
export interface QuoteOut {
  quoteId: number;
  stageId: number;
  supplierId: number;
  label: string;
  status: string;
  isFullSpec: boolean;
  currentVersion: number;
  current: QuoteVersionOut;
  versions: QuoteVersionOut[];
}

/** 201 응답 (PUT 고치기도 같은 모양) */
export interface QuoteSentOut {
  quoteId: number;
  version: number;
  chatRoomId: number | null;
  checks: QuoteCheck[];
}

// ---- 커뮤니티 (#100, api-contract.md 7장) ----
export type FreePostCategory = "FREE" | "QUESTION" | "INFO" | "NEWS";

export interface FreePostSummary {
  id: number;
  category: FreePostCategory;
  title: string;
  /** 업체 회원이면 kind=SUPPLIER, name=상호 */
  author: { name: string; kind: "USER" | "SUPPLIER" };
  viewCount: number;
  commentCount: number;
  helpfulCount: number;
  hasPhotos: boolean;
  createdAt: string;
}

export interface FreePostPage {
  items: FreePostSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FreePost extends FreePostSummary {
  body: string;
  /** 사진 파일 id (주소는 files 함수가 생기면 붙는다) */
  photoIds: number[];
  status: "ACTIVE" | "BLINDED" | "DELETED";
  blindReason: string | null;
  prevId: number | null;
  nextId: number | null;
  isMine: boolean;
  updatedAt: string;
  comments: FreeComment[];
  myHelpful: boolean;
  bookmarked: boolean;
}

/** 댓글·답글 (#101). 삭제·블라인드면 body=null (블라인드는 작성자에게만 본문·사유) */
export interface FreeComment {
  id: number;
  author: FreePostSummary["author"];
  body: string | null;
  status: "ACTIVE" | "BLINDED" | "DELETED";
  blindReason: string | null;
  isPostAuthor: boolean;
  isMine: boolean;
  helpfulCount: number;
  myHelpful: boolean;
  createdAt: string;
  replies: FreeComment[];
}

export interface FreeCommentSaved extends FreeComment {
  contactWarning: boolean;
}

export interface FreePostSaved extends FreePost {
  contactWarning: boolean;
}

export interface FreePostRequest {
  category: FreePostCategory | "";
  title: string;
  body: string;
  fileIds: number[];
}

export interface UploadedFile {
  id: number;
  url: string;
  thumbUrl: string;
}

/* ---- 업체 찾기 소개 글 (api-contract.md 5장 /pr-posts, #30) ---- */

export type PrCategory = "VENUE" | "EQUIPMENT" | "ENGINEER";

/** GET /pr-posts 목록 카드 (연락처 없음, CLAUDE.md 20) */
export interface PrPostItem {
  id: number;
  category: PrCategory;
  title: string;
  supplierId: number;
  companyName: string;
  sido: string;
  priceRange: string | null;
  thumbUrl: string | null;
  bumpedAt: string;
}

export interface PrPostPage {
  items: PrPostItem[];
  page: number;
  size: number;
  total: number;
}

/** GET /pr-posts/{id}, POST /pr-posts 응답 */
export interface PrPost extends Omit<PrPostItem, "thumbUrl"> {
  body: string;
  photos: UploadedFile[];
  createdAt: string;
}

/** POST /pr-posts (FR-BOARD-02). 사진은 먼저 POST /files (purpose PR_POST, 최대 10장) */
export interface PrPostRequest {
  category: PrCategory | "";
  title: string;
  body: string;
  sido: string;
  priceRange: string | null;
  fileIds: number[];
}

/* ---- 단계별 견적 비교 (api-contract.md 4.1 GET /stages/{stageId}/quotes, #48) ---- */

export interface CheckItem {
  id: string;
  result: "PASS" | "NEEDS_INFO" | "CONFLICT" | "WARNING";
  message: string;
}

/** 비교 화면 견적서 한 칸. 검사·종합 결과는 서버 run_checks() 그대로 */
export interface CompareQuote {
  quoteId: number;
  supplierId: number;
  label: string;
  status: string;
  version: number;
  basedOnPerfVersion: number;
  totalAmount: number;
  /** 공연장 견적서만 (공간 스냅샷). venueId·venueType 으로 공간 사진을 고른다 */
  venueId: number | null;
  venueType: "CONCERT_HALL" | "CULTURE_SPACE" | "ROOFTOP" | "GARDEN" | "WAREHOUSE" | "ETC" | null;
  venueName: string | null;
  maxCapacity: number | null;
  checkinTime: string | null;
  setupAvailableTime: string | null;
  checkoutTime: string | null;
  includesEquipment: boolean;
  includesEngineer: boolean;
  isFullSpec: boolean;
  offered: boolean;
  overall: CheckItem["result"];
  checks: CheckItem[];
}

/* ---- 통합 청구서·테스트 결제 (api-contract.md 6.1, #50·#51). 금액은 모두 서버 계산값 ---- */

export type OrderStatus = "ISSUED" | "PAID" | "SETTLEMENT_SCHEDULED" | "CANCELLED";
/** 결제 전 null · HOLD 보관 중 · SETTLE_SCHEDULED 정산 예정 */
export type LedgerState = "HOLD" | "SETTLE_SCHEDULED" | null;

export interface OrderLine {
  stageId: number;
  stageType: StageType;
  supplierId: number;
  companyName: string;
  quoteVersionId: number;
  amount: number;
  ledgerState: LedgerState;
}

/** GET·POST /performances/{id}/order */
export interface Order {
  id: number;
  performanceId: number;
  status: OrderStatus;
  itemsTotal: number;
  platformFee: number;
  totalAmount: number;
  issuedAt: string;
  paidAt: string | null;
  lines: OrderLine[];
}

/** GET /performances/{id}/cancel-quote · POST …/cancel (api-contract.md 6.1, #52). 금액은 모두 서버 계산값 */
export interface CancelQuote {
  phase: "BEFORE_PAYMENT" | "GRACE_12H" | "D30_PLUS" | "D29_D15" | "D14_D8" | "D7_D2" | "D1" | "D0" | "SUPPLIER_FAULT";
  ratePercent: number;
  paid: number;
  penaltyBase: number;
  penaltyTotal: number;
  penaltyBySupplier: { supplierId: number; name: string; amount: number }[];
  feeRefunded: number;
  refundTotal: number;
  cancellationId: number | null;
}

/** GET /performances/{id}/sheet (#53). contacts 는 결제 뒤에만 채워진다 */
export interface Sheet {
  performanceId: number;
  title: string;
  showDate: string;
  sido: string;
  sigungu: string;
  audience: number;
  paid: boolean;
  paidAt: string | null;
  schedule: { time: string; title: string; who: string }[];
  lines: { stageType: StageType; status: StageStatus; companyName: string | null; scope: string; amount: number | null }[];
  contacts: { role: string; name: string; realName: string | null; phone: string; email: string }[];
}

/** POST /orders/{id}/payments */
export interface PaymentResult {
  paymentId: number;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  amount: number;
  orderStatus: OrderStatus;
}

// ---- 채팅 (#42, api-contract.md 채팅·7장 WebSocket) ----
export type ChatMessageType = "TEXT" | "IMAGE" | "FILE" | "QUOTE" | "CONFIRM_REQUEST" | "CONFIRMED" | "NOTICE";

/** GET /chat-rooms 한 줄. partnerName 은 업체 상호 또는 사용자 닉네임 (실명 아님) */
export interface ChatRoom {
  roomId: number;
  stageId: number;
  stageType: StageType;
  performanceId: number;
  partnerName: string;
  startedAt: string | null;
  pinnedAt: string | null;
  unreadCount: number;
  lastMessage: { id: number; type: ChatMessageType; body: string | null; createdAt: string } | null;
}

/** REST 메시지. senderUserId NULL = 시스템 메시지, refId 는 QUOTE 면 quote_version_id */
export interface ChatMessageOut {
  id: number;
  type: ChatMessageType;
  body: string | null;
  senderUserId: number | null;
  refId: number | null;
  contactWarning: boolean;
  createdAt: string;
  attachmentUrl?: string | null;
}

export interface ChatMessagesOut {
  messages: ChatMessageOut[];
  partnerLastReadMessageId: number | null;
}

export interface ChatMessageIn {
  type: "TEXT" | "IMAGE" | "FILE";
  body?: string | null;
  fileId?: number | null;
}

/** WebSocket message.created 의 message (REST 와 달리 보낸 사람이 senderId) */
export interface WsChatMessage {
  id: number;
  type: ChatMessageType;
  body: string | null;
  attachmentUrl?: string | null;
  refId: number | null;
  senderId: number | null;
  contactWarning: boolean;
  createdAt: string;
}

/** GET /ws 받기 전용 이벤트 가운데 채팅 위젯이 쓰는 것 */
export type WsChatEvent =
  | { type: "message.created"; data: { roomId: number; message: WsChatMessage } }
  | { type: "message.read"; data: { roomId: number; userId: number; lastMessageId: number } }
  | { type: "quote.updated"; data: { roomId: number; quoteId: number; version: number; changed: string[] } };

/* ---- 프로필 (api-contract.md 5장 /suppliers/{id}/profile · /users/{id}/profile · /me/profile, #33) ---- */

/** 업체 프로필의 등록 공간 한 줄 (GET /venues 목록 카드와 같은 칸 중 화면이 쓰는 것) */
export interface SupplierProfileVenue {
  id: number;
  name: string;
  sido: string;
  sigungu: string;
  venueType: string;
  maxCapacity: number;
  rentalFee: number;
}

/** GET /suppliers/{id}/profile (AC-F5-15). 연락처·사업자 정보 없음 (CLAUDE.md 20) */
export interface SupplierProfile {
  id: number;
  companyName: string;
  imageUrl: string | null;
  categories: SupplierCategory[];
  intro: string | null;
  setupMinutes: number | null;
  teardownMinutes: number | null;
  engineerYears: number | null;
  bandExperience: boolean | null;
  hasLiabilityInsurance: boolean | null;
  soundCertification: string | null;
  joinedAt: string;
  posts: PrPostItem[];
  venues: SupplierProfileVenue[];
}

/** GET /users/{id}/profile · GET /me/profile · PATCH /me/profile 응답 (AC-F5-16). 이름·전화·이메일·생년월일 없음 */
export interface UserProfile {
  id: number;
  nickname: string | null;
  profileImageUrl: string | null;
  joinedAt: string;
  usageCount: number;
  rejectionCount: number;
}

/** PATCH /me/profile — 바꾼 칸만 보낸다. 사진은 먼저 POST /files (purpose PROFILE) */
export interface MyProfileRequest {
  nickname?: string;
  profileFileId?: number | null;
}
