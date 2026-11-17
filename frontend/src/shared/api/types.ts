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
