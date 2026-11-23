/**
 * 채팅방의 최종 견적 카드 (CONFIRM_REQUEST, refId = 카드 번호)와 확정 완료 카드 (CONFIRMED). #43, AC-F3-09~14.
 * - 사용자: [내역서 보기](열면 열람 기록) · [다시 조율] · [확정하기] — 내역서를 열기 전에는 [확정하기]가 눌리지 않는다 (AC-F3-10)
 * - 견적서를 고쳤으면 "새 견적이 있어요"(AC-F3-09), 48시간 지나면 "만료"(AC-F3-12)
 * - 확정 완료 카드: 마지막 필요 단계면 [통합 결제하기], 아니면 [다음 단계로] (AC-F3-14)
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { STAGE_LABEL } from "../request/codes";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { leftText, useAcceptCard, useConfirmCard, useRenegotiate, type ConfirmCardOut, type ConfirmStatus } from "./api";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const STATUS_TEXT: Record<Exclude<ConfirmStatus, "PENDING">, string> = {
  CONFIRMED: "확정했어요",
  RENEGOTIATE: "다시 조율하기로 했어요",
  EXPIRED: "기한이 지났어요. 업체가 새 최종 견적을 보낼 수 있어요.",
  INVALIDATED: "새 견적이 있어요. 업체에게 새 최종 견적을 요청해 주세요.",
};

/** 만료 시각이 지났는지. 화면을 열어 둔 채 시각이 지나도 그 순간 다시 그린다 (AC-F3-12) */
function useTimeUp(expiresAt: string | null): boolean {
  const at = expiresAt ? new Date(expiresAt).getTime() : null;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const ms = at - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => rerender((n) => n + 1), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [at]);
  return at !== null && at <= Date.now();
}

export function sheetLink(c: ConfirmCardOut) {
  return `/quotes/by-version/${c.quoteVersionId}?confirm=${c.id}`;
}

export function ConfirmRequestCard({ id, role, partner, onLeave }: { id: number; role: "USER" | "SUPPLIER"; partner: string; onLeave: () => void }) {
  const card = useConfirmCard(id);
  const accept = useAcceptCard(id);
  const renegotiate = useRenegotiate(id);
  const c = card.data;
  const timeUp = useTimeUp(c?.status === "PENDING" ? c.expiresAt : null);
  if (!c) return <span className="room__sys">최종 견적이 도착했어요</span>;
  const pending = c.status === "PENDING";
  const user = role === "USER";
  const hintId = `confirm-hint-${id}`;
  // 서버가 아직 PENDING 이어도 만료 시각이 지났으면 만료로 보이고 버튼을 끈다 (AC-F3-12, 서버도 422 로 막는다)
  const shown: ConfirmStatus = pending && timeUp ? "EXPIRED" : c.status;
  const open = shown === "PENDING";

  return (
    <div className="c-card c-card--confirm" data-status={c.status}>
      <div className="c-card__head">
        <span>최종 견적</span>
        <span className={open ? "state state--on" : "state"}>{open ? leftText(c.expiresAt) : shown === "CONFIRMED" ? "확정" : shown === "INVALIDATED" ? "새 견적 있음" : shown === "EXPIRED" ? "만료" : "다시 조율"}</span>
      </div>
      <div className="c-card__body">
        <p className="c-card__meta">
          {user ? `${partner}가 최종 견적을 보냈어요` : "최종 견적을 보냈어요"} · {STAGE_LABEL[c.stageType]}
        </p>
        <p className="c-card__amount">
          {c.label} · v{c.version} · <b>{won(c.totalAmount)}</b>
        </p>
        {shown !== "PENDING" && <p className="c-card__note">{STATUS_TEXT[shown]}</p>}
        {open && user && !c.viewedAt && (
          <p className="c-card__note" id={hintId}>
            내역서를 먼저 열어 확인해 주세요.
          </p>
        )}
        {open && !user && <p className="c-card__note">사용자가 내역서를 확인하고 확정하면 알려 드려요.</p>}
        {(accept.error || renegotiate.error) && <ErrorNotice error={accept.error ?? renegotiate.error} />}
      </div>
      <div className="c-card__foot">
        <Link to={user ? sheetLink(c) : `/quotes/by-version/${c.quoteVersionId}`} onClick={onLeave}>
          내역서 보기
        </Link>
        {pending && user && (
          <>
            <button type="button" disabled={timeUp || renegotiate.isPending} onClick={() => renegotiate.mutate()}>
              다시 조율
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={timeUp || !c.viewedAt || accept.isPending}
              aria-describedby={open && !c.viewedAt ? hintId : undefined}
              onClick={() => accept.mutate()}
            >
              확정하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 확정 완료 카드 (CONFIRMED, refId = 카드 번호). 사용자에게만 다음 할 일 버튼 */
export function ConfirmedCard({ id, role, onLeave }: { id: number; role: "USER" | "SUPPLIER"; onLeave: () => void }) {
  const card = useConfirmCard(id);
  const c = card.data;
  if (!c) return <span className="room__sys">확정했어요</span>;
  return (
    <div className="c-card c-card--done">
      <div className="c-card__head">
        <span>확정 완료</span>
      </div>
      <div className="c-card__body">
        <p className="c-card__meta">
          {STAGE_LABEL[c.stageType]} 단계를 {role === "USER" ? "이 업체로 확정했어요" : "우리 업체로 확정했어요"}
        </p>
        <p className="c-card__amount">
          {c.label} · v{c.version} · <b>{won(c.totalAmount)}</b>
        </p>
        {role === "SUPPLIER" && <p className="c-card__note">결제가 끝나면 최종 담당표에서 연락처가 공개돼요.</p>}
      </div>
      {role === "USER" && (
        <div className="c-card__foot">
          {c.checkoutAvailable ? (
            <Link className="is-primary" to={`/performances/${c.performanceId}/order`} onClick={onLeave}>
              통합 결제하기
            </Link>
          ) : (
            <Link className="is-primary" to={`/performances/${c.performanceId}/next`} onClick={onLeave}>
              다음 단계로{c.nextStageType ? ` (${STAGE_LABEL[c.nextStageType]})` : ""}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
