/**
 * [중복 확인] — 누르는 즉시 이메일·닉네임을 쓸 수 있는지 서버에 묻는다 (POST /auth/check-available).
 * 결과는 확인한 그 값에만 붙는다: 칸을 고치면 result() 가 undefined 가 되어 문구가 사라진다.
 * 쓰는 곳: 사용자 가입(이메일·닉네임), 업체 가입(이메일), 마이페이지(닉네임 — 지금 내 닉네임이면 서버에 묻지 않는다).
 */
import { useState } from "react";
import { ApiError } from "../../shared/api/client";
import { checkAvailable } from "./api";

export type DupField = "email" | "nickname";
export interface DupResult {
  value: string;
  ok: boolean;
  msg: string;
}

const norm = (k: DupField, v: string) => (k === "email" ? v.trim().toLowerCase() : v.trim());

export function useDupCheck() {
  const [res, setRes] = useState<Partial<Record<DupField, DupResult>>>({});
  const [checking, setChecking] = useState<DupField | null>(null);

  async function check(k: DupField, raw: string, mine?: string) {
    const value = norm(k, raw);
    const put = (ok: boolean, msg: string) => setRes((r) => ({ ...r, [k]: { value, ok, msg } }));
    if (!value) return put(false, k === "email" ? "이메일을 적어 주세요." : "닉네임을 적어 주세요.");
    if (mine !== undefined && norm(k, mine) === value) return put(true, k === "email" ? "지금 쓰는 이메일이에요." : "지금 쓰는 닉네임이에요.");
    setChecking(k);
    try {
      const r = await checkAvailable(k, raw.trim());
      put(r.available, r.message);
    } catch (e) {
      put(false, e instanceof ApiError ? (e.body.fieldErrors[0]?.reason ?? e.body.message) : "확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setChecking(null);
    }
  }

  /** 지금 칸 값으로 확인한 결과 (고쳤으면 undefined) */
  const result = (k: DupField, current: string) => (res[k] && res[k]!.value === norm(k, current) ? res[k] : undefined);

  return { check, result, checking };
}
