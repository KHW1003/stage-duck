/**
 * 운영 회사(사업자) 정보 — 바닥글 두 곳과 개인정보 처리방침이 모두 여기서 읽는다 (11/25 해원: 네이버 로그인 검수 준비).
 * 값을 바꾸려면 이 파일만 고친다. 비어 있는(null) 칸은 지어내지 않고 "준비 중"으로 보인다 (D-49).
 * 통신판매업 신고번호가 해당 없으면 "해당 없음"이라고 적는다.
 */
export interface Company {
  /** 상호 (예: 스테이지덕) */
  name: string | null;
  /** 대표자 */
  ceo: string | null;
  /** 사업자등록번호 (예: 123-45-67890) */
  bizNo: string | null;
  /** 통신판매업 신고번호 */
  mailOrderNo: string | null;
  /** 사업장 주소 */
  address: string | null;
  /** 고객센터 전화 */
  tel: string | null;
  /** 고객센터 이메일 */
  email: string | null;
  /** 고객센터 운영 시간 (예: 평일 10:00~18:00) */
  csHours: string | null;
  /** 개인정보 보호책임자 */
  privacyOfficer: { name: string | null; title: string | null; email: string | null };
}

export const COMPANY: Company = {
  name: null,
  ceo: null,
  bizNo: null,
  mailOrderNo: null,
  address: null,
  tel: null,
  email: null,
  csHours: null,
  privacyOfficer: { name: null, title: null, email: null },
};

export const PENDING = "준비 중";

/** 값이 없으면 "준비 중" */
export const orPending = (v: string | null | undefined): string => (v && v.trim() ? v : PENDING);

/** 바닥글 사업자 정보 줄: [이름, 값] 목록 */
export function bizRows(c: Company = COMPANY): [string, string][] {
  return [
    ["상호", orPending(c.name)],
    ["대표", orPending(c.ceo)],
    ["사업자등록번호", orPending(c.bizNo)],
    ["통신판매업 신고", orPending(c.mailOrderNo)],
    ["주소", orPending(c.address)],
    ["이메일", orPending(c.email)],
  ];
}

/** 사업자 정보가 하나라도 채워졌는가 (모두 비었으면 시연·포트폴리오 안내를 함께 보인다) */
export const hasCompanyInfo = (c: Company = COMPANY): boolean => Boolean(c.name || c.ceo || c.bizNo);
