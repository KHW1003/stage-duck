/**
 * 받은 견적 요청 (/supplier/offers, 승인 업체). 이슈 #32, api-contract.md 4.4.
 * - 사용자가 이 업체를 골라 보낸 견적 요청. 사용자는 닉네임만 (연락처·실명 없음, CLAUDE.md 20)
 * - 답 기다리는 중 + 그 단계가 열려 있으면 [견적서 쓰기] (보내면 요청은 "견적서 보냄", 사용자 비교 화면에 "내가 요청한 업체")
 * - [거절하기]: 사유를 골라 거절 (답하기 전만)
 * - 48시간이 지나면 "기한 지남"
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { DECLINE_LABEL, useDeclineOffer, useReceivedOffers, type DeclineReason, type OfferStatus, type ReceivedOffer } from "../features/offer/api";
import { dateLabel } from "../features/performance/labels";
import { STAGE_LABEL } from "../features/request/codes";
import { usePageMeta } from "../features/seo/usePageMeta";
import { ApiError } from "../shared/api/client";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import { KitModal } from "../shared/ui/KitModal";
import "../features/offer/offer.css";

const SUPPLIER_STATUS: Record<OfferStatus, string> = { PENDING: "답변 전", QUOTED: "견적서 보냄", DECLINED: "거절함", EXPIRED: "기한 지남" };

function left(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "기한 지남";
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.floor(ms / 60000))}분 남음`;
}

function DeclineModal({ offer, onClose }: { offer: ReceivedOffer; onClose: () => void }) {
  const decline = useDeclineOffer();
  const [reason, setReason] = useState<DeclineReason>("SCHEDULE");
  return (
    <KitModal
      title="견적 요청 거절"
      onClose={onClose}
      busy={decline.isPending}
      foot={
        <>
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={decline.isPending}
            onClick={() => decline.mutate({ offerId: offer.offerId, reason }, { onSuccess: onClose })}
          >
            거절하기
          </button>
        </>
      }
    >
      <p className="modal__lead">{offer.title} 견적 요청을 거절할까요?</p>
      <fieldset className="field mt-12 offer-reasons">
        <legend className="field__label">사유</legend>
        {(Object.keys(DECLINE_LABEL) as DeclineReason[]).map((r) => (
          <label key={r} className="check">
            <input type="radio" name="decline-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
            {DECLINE_LABEL[r]}
          </label>
        ))}
      </fieldset>
      <p className="field__hint mt-8">사용자에게는 사유만 보여요.</p>
      {decline.error && (
        <div className="mt-12">
          <ErrorNotice error={decline.error} />
        </div>
      )}
    </KitModal>
  );
}

export function SupplierOffersPage() {
  usePageMeta("받은 견적 요청");
  const offers = useReceivedOffers();
  const [declining, setDeclining] = useState<ReceivedOffer | null>(null);
  const notApproved = offers.error instanceof ApiError && offers.error.status === 403;

  return (
    <>
      <KitPageTop title="받은 견적 요청" crumbs={[{ label: "공고 목록", to: "/supplier/postings" }, { label: "받은 견적 요청" }]} desc="사용자가 우리 업체를 골라 보낸 요청이에요. 48시간 안에 견적서를 보내거나 거절해 주세요." />
      <main className="container main">
        {offers.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {offers.isError && !notApproved && <ErrorNotice error={offers.error} />}
        {notApproved && <ErrorNotice error={offers.error} />}
        {offers.data?.length === 0 && (
          <div className="empty">
            <Ico name="mail" />
            <b>받은 견적 요청이 없어요</b>
            <p>업체 찾기에 소개 글을 올려 두면 사용자가 먼저 견적을 요청할 수 있어요.</p>
            <Link className="btn btn--sm mt-12" to="/supplier/posts">
              내 소개 글
            </Link>
          </div>
        )}
        {!!offers.data?.length && (
          <ul className="offer-list" aria-label="받은 견적 요청 목록">
            {offers.data.map((o) => {
              const waiting = o.status === "PENDING";
              return (
                <li key={o.offerId}>
                  <div className="grow">
                    <b>{o.title}</b>
                    <small>
                      {STAGE_LABEL[o.stageType]} 단계 · {dateLabel(o.showDate)} · {o.sido} {o.sigungu} · 관객 {o.audience}명 · {o.nickname}
                    </small>
                    {o.message && <small>“{o.message}”</small>}
                    {o.status === "DECLINED" && o.declineReason && <small>사유: {DECLINE_LABEL[o.declineReason]}</small>}
                  </div>
                  <span className={waiting ? "state state--on" : "state"}>{waiting ? left(o.expiresAt) : SUPPLIER_STATUS[o.status]}</span>
                  {waiting && o.stageOpen && (
                    <Link className="btn btn--sm btn--primary" to={`/supplier/postings/${o.stageId}/quote`}>
                      견적서 쓰기
                    </Link>
                  )}
                  {waiting && (
                    <button className="btn btn--sm btn--ghost" type="button" onClick={() => setDeclining(o)}>
                      거절하기
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {declining && <DeclineModal offer={declining} onClose={() => setDeclining(null)} />}
    </>
  );
}
