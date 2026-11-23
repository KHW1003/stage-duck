/**
 * 화면 아래 오류 알림. 칸 아래나 화면 위에 오류를 보일 자리가 없는 짧은 동작(관심 업체 저장, 채팅방 고정 등)이 실패했을 때.
 * - 쓰는 법: useMutation({ ..., meta: { errorToast: true } }) — App 의 MutationCache 가 실패하면 여기로 보낸다.
 *   직접 부를 때는 showErrorToast(error).
 * - 문구는 서버가 준 message 그대로 (CLAUDE.md 6.2). 4초 뒤 사라지고, [닫기]로 바로 닫을 수 있다.
 */
import { useEffect, useState } from "react";
import { errorMessageOf } from "./ErrorText";
import { Ico } from "./Ico";
import s from "./ErrorToast.module.css";

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function showErrorToast(error: unknown) {
  const msg = errorMessageOf(error);
  listeners.forEach((l) => l(msg));
}

export function ErrorToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const l: Listener = (m) => setMsg(m);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 4000);
    return () => window.clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div className={s.toast} role="alert">
      <Ico name="warn" sm />
      <p>{msg}</p>
      <button type="button" className={s.close} aria-label="알림 닫기" onClick={() => setMsg(null)}>
        <Ico name="x" sm />
      </button>
    </div>
  );
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { errorToast?: boolean };
  }
}
