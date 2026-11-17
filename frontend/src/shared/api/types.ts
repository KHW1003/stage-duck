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
