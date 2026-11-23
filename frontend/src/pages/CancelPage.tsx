/**
 * 공연 취소 (/performances/:id/cancel). 목업: mockup-v4/pages/cancel.html · FR-PAY-03 · AC-F5-08·09 · 묶음 4
 * React: CancelPage = PenaltyScale + CancelEstimateTable + CancelModal. 금액은 서버 cancel-quote 그대로 (CLAUDE.md 11·12).
 * 목업 모달의 "취소 사유" 칸은 저장할 칸(cancellations)이 없어 뺐다 (내용 미정).
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCancel, useCancelQuote } from "../features/payment/api";
import { usePerformance } from "../features/performance/api";
import { dateLabel } from "../features/performance/labels";
import { ApiError } from "../shared/api/client";
import { usePageMeta } from "../features/seo/usePageMeta";
import type { CancelQuote } from "../shared/api/types";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import { KitModal } from "../shared/ui/KitModal";
import { formatWon } from "../shared/ui/MoneyText";
import "./payment.css";

/** 취소 시점별 위약금 눈금 (FR-PAY-03 표). 지금 구간은 서버가 준 phase 로 고른다 */
const SCALE: { phases: CancelQuote["phase"][]; label: string; rate: string }[] = [
  { phases: ["BEFORE_PAYMENT"], label: "결제 전", rate: "0원" },
  { phases: ["GRACE_12H", "D30_PLUS"], label: "결제 후 12시간 · 30일 전", rate: "0원" },
  { phases: ["D29_D15"], label: "29~15일 전", rate: "10%" },
  { phases: ["D14_D8"], label: "14~8일 전", rate: "30%" },
  { phases: ["D7_D2"], label: "7~2일 전", rate: "50%" },
  { phases: ["D1"], label: "D-1", rate: "70%" },
  { phases: ["D0"], label: "공연 당일", rate: "100%" },
];

const won = (n: number) => `${formatWon(n)}원`;

export function CancelPage() {
  const id = Number(useParams().id);
  const perf = usePerformance(id);
  const quote = useCancelQuote(id);
  const cancel = useCancel(id);
  const [step, setStep] = useState<"review" | "final" | null>(null);
  const [finalQuote, setFinalQuote] = useState<CancelQuote | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewError, setReviewError] = useState<Error | null>(null);
  usePageMeta("공연 취소");

  const p = perf.data;
  const q = quote.data;
  const done = cancel.data;

  function closeConfirmation() {
    setStep(null);
    setReviewError(null);
    cancel.reset();
  }

  async function showFinalConfirmation() {
    setChecking(true);
    setReviewError(null);
    const refreshed = await quote.refetch();
    setChecking(false);
    if (refreshed.isError || !refreshed.data) {
      setReviewError(refreshed.error ?? new Error());
      return;
    }
    cancel.reset();
    setFinalQuote(refreshed.data);
    setStep("final");
  }

  function confirmCancellation() {
    if (!finalQuote || cancel.isPending) return;
    const { phase, ratePercent, paid, penaltyTotal, feeRefunded, refundTotal } = finalQuote;
    cancel.mutate({ phase, ratePercent, paid, penaltyTotal, feeRefunded, refundTotal }, {
      onSuccess: () => setStep(null),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setReviewError(error);
          setStep("review");
        }
      },
    });
  }

  return (
    <>
      <KitPageTop
        title="공연 취소"
        crumbs={[{ label: "통합 청구서", to: `/performances/${id}/order` }, { label: "취소" }]}
        meta={p ? [p.title, dateLabel(p.showDate)] : undefined}
      />
      <main className="container container--narrow main">
        <p className="test-pay"><Ico name="info" sm />테스트 결제라 실제로 청구되지 않습니다. 환불·위약금도 모의로 처리됩니다.</p>
        {done ? (
          <section className="result mt-40" role="status">
            <span className="result__icon"><Ico name="pass" /></span>
            <h2>취소되었습니다</h2>
            <p>{done.paid ? `환불 예정액 ${won(done.refundTotal)}` : "결제한 금액이 없어 환불할 금액이 없습니다."}</p>
            <div className="btns btns--center mt-24"><Link className="btn btn--lg" to="/me/performances">내 공연으로</Link></div>
          </section>
        ) : quote.isError && !q ? (
          <div className="mt-24"><ErrorNotice error={quote.error} /></div>
        ) : !q ? (
          <p className="muted mt-24">불러오는 중입니다.</p>
        ) : (
          <>
            <section className="sec mt-40">
              <div className="sec-head"><h2><Ico name="calendar" />취소 시점별 위약금</h2><p>업체 금액 기준입니다.</p></div>
              <ol className="penalty" aria-label="취소 시점별 위약금">
                {SCALE.map((s) => {
                  const now = s.phases.includes(q.phase);
                  return (
                    <li key={s.label} className={now ? "is-now" : undefined} aria-current={now ? "step" : undefined}>
                      {now ? `${s.label} · 지금` : s.label}<b>{s.rate}</b>
                    </li>
                  );
                })}
              </ol>
            </section>
            <section className="sec">
              <div className="sec-head"><h2><Ico name="receipt" />지금 취소하면</h2></div>
              {q.phase === "BEFORE_PAYMENT" ? (
                <>
                  <table className="info-table"><tbody>
                    <tr><th>취소 위약금</th><td className="num strong">0원 <span className="muted small">· 아직 결제하지 않았습니다</span></td></tr>
                  </tbody></table>
                  <p className="field__hint mt-8">채팅을 시작한 공연을 취소하면 반려 1회로 기록됩니다. 반려가 5회 쌓이면 새 공고는 24시간 후에 올릴 수 있습니다.</p>
                </>
              ) : (
                <table className="info-table"><tbody>
                  <tr><th>결제한 금액</th><td className="num">{won(q.paid)}</td></tr>
                  <tr><th>업체 금액 합계</th><td className="num">{won(q.penaltyBase)}</td></tr>
                  <tr>
                    <th>위약금 ({q.ratePercent}%)</th>
                    <td className="num strong">
                      {won(q.penaltyTotal)}
                      {q.penaltyTotal > 0 && (
                        <span className="muted small"> · {q.penaltyBySupplier.map((s) => `${s.name} ${won(s.amount)}`).join(" · ")} (금액 비율)</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th>플랫폼 이용료</th>
                    <td className="num">{q.feeRefunded ? `${won(q.feeRefunded)} · 환불됩니다` : <>환불되지 않습니다</>}</td>
                  </tr>
                  <tr><th>환불 예정액</th><td className="num"><b className="strong">{won(q.refundTotal)}</b></td></tr>
                </tbody></table>
              )}
            </section>
            <section className="sec">
              <ul className="bullets">
                <li>업체 사정으로 취소되면 플랫폼 이용료까지 전액 환불되며, 해당 단계만 다시 모집할 수 있습니다.</li>
                <li>결제 후 12시간 이내 또는 공연 30일 전까지 취소하면 위약금이 없으며 플랫폼 이용료도 환불됩니다.</li>
                <li>원 단위 나머지는 금액이 가장 큰 업체에 더해집니다.</li>
              </ul>
            </section>
            <div className="btns btns--center mt-40">
              <Link className="btn btn--lg" to={`/performances/${id}/order`}>돌아가기</Link>
              <button className="btn btn--primary btn--lg" type="button" onClick={() => setStep("review")}>취소 요청</button>
            </div>
          </>
        )}
      </main>
      {step === "review" && q && !done && (
        <KitModal
          title="취소 요청"
          busy={checking}
          onClose={closeConfirmation}
          foot={
            <>
              <button className="btn" type="button" onClick={closeConfirmation} disabled={checking}>예약 유지</button>
              <button className="btn btn--primary" type="button" disabled={checking} onClick={showFinalConfirmation}>
                {checking ? "금액 확인 중…" : "다음 · 금액 최종 확인"}
              </button>
            </>
          }
        >
          <p className="modal__lead">이 공연의 예약을 취소하시겠습니까?</p>
          <p>{p ? `${p.title} · ${dateLabel(p.showDate)}` : "취소할 예약과 예상 환불 내역을 확인해 주십시오."}</p>
          <dl className="sum-rows mt-16">
            <div><dt>위약금</dt><dd>{won(q.penaltyTotal)}</dd></div>
            <div><dt>환불 예정액</dt><dd className="strong">{won(q.refundTotal)}</dd></div>
          </dl>
          {reviewError && <div className="mt-16"><ErrorNotice error={reviewError} /></div>}
        </KitModal>
      )}
      {step === "final" && finalQuote && !done && (
        <KitModal
          title="공연 취소 최종 확인"
          busy={cancel.isPending}
          onClose={closeConfirmation}
          foot={
            <>
              <button className="btn" type="button" onClick={closeConfirmation} disabled={cancel.isPending}>예약 유지</button>
              <button className="btn btn--primary" type="button" onClick={confirmCancellation} disabled={cancel.isPending}>
                {cancel.isPending ? "접수 중…" : "공연 취소 확정"}
              </button>
            </>
          }
        >
          <p className="modal__lead">
            {finalQuote.penaltyTotal ? `위약금 ${won(finalQuote.penaltyTotal)}이 발생합니다.` : "위약금은 0원입니다."} 정말 취소하시겠습니까?
          </p>
          <dl className="sum-rows mt-16">
            <div><dt>결제한 금액</dt><dd>{won(finalQuote.paid)}</dd></div>
            <div><dt>위약금 ({finalQuote.ratePercent}%)</dt><dd>{won(finalQuote.penaltyTotal)}</dd></div>
            <div>
              <dt>돌려받지 못하는 플랫폼 이용료</dt>
              <dd>{won(finalQuote.paid - finalQuote.penaltyTotal - finalQuote.refundTotal)}</dd>
            </div>
            <div className="cancel-final-total"><dt>환불 예정액</dt><dd>{won(finalQuote.refundTotal)}</dd></div>
          </dl>
          <p className="field__hint mt-16">
            {finalQuote.paid ? "확정하면 취소가 접수됩니다. 접수된 취소는 되돌릴 수 없습니다." : "결제 전 예약입니다. 확정하면 예약이 취소되며 환불할 금액은 없습니다."}
          </p>
          {cancel.isError && <div className="mt-16"><ErrorNotice error={cancel.error} /></div>}
        </KitModal>
      )}
    </>
  );
}
