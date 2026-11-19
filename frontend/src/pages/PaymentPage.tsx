/**
 * 테스트 결제 (/performances/:id/pay). 목업: mockup-v4/pages/pay.html · FR-PAY-02 · AC-F5-05·06 · 묶음 4
 * React: PaymentPage = StepBar + PayMethod + PayProgress + PayResult. 금액은 청구서가 준 값을 그대로 보내고, 서버가 다시 맞춰 본다.
 * Idempotency-Key 는 화면을 열 때 하나 만들어 다시 눌러도 같은 키를 보낸다 — 두 번 눌러도 한 번만 결제 (AC-F5-06).
 */
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useOrder, usePay } from "../features/payment/api";
import { usePerformance } from "../features/performance/api";
import { STAGE_NAME, dateLabel } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice, errorMessageOf } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import { formatWon } from "../shared/ui/MoneyText";
import { StepBar, TEST_PAY } from "./InvoicePage";
import "./payment.css";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function PaymentPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const perf = usePerformance(id);
  const order = useOrder(id);
  const pay = usePay(id);
  const key = useRef(newKey());
  const [method, setMethod] = useState<"CARD" | "TRANSFER">("CARD");
  usePageMeta("테스트 결제");

  const p = perf.data;
  const o = order.data;
  const failed = pay.isError || pay.data?.status === "FAILED";

  const submit = () => {
    if (!o || pay.isPending) return;
    pay.mutate(
      { orderId: o.id, amount: o.totalAmount, idempotencyKey: key.current },
      { onSuccess: (r) => r.status === "SUCCEEDED" && navigate(`/performances/${id}/order`) },
    );
  };
  const retry = () => {
    key.current = newKey();
    pay.reset();
  };

  return (
    <>
      <KitPageTop
        title="테스트 결제"
        crumbs={[{ label: "내 공연", to: "/me/performances" }, { label: "통합 청구서", to: `/performances/${id}/order` }, { label: "테스트 결제" }]}
        meta={p ? [p.title, dateLabel(p.showDate)] : undefined}
      />
      <main className="container main">
        {order.isError ? (
          <ErrorNotice error={order.error} />
        ) : !o ? (
          <p className="muted">불러오는 중입니다.</p>
        ) : o.status !== "ISSUED" ? (
          <p className="notice">이미 결제한 청구서입니다. <Link className="link" to={`/performances/${id}/order`}>청구서 보기</Link></p>
        ) : (
          <>
            <StepBar paid={false} />
            <div className="pay-wrap mt-40">
              <div className="pay-amt"><span className="strong">결제할 금액</span><b>{formatWon(o.totalAmount)}원</b></div>
              <dl className="sum-rows mt-12">
                <div>
                  <dt>업체 금액 ({o.lines.map((l) => `${STAGE_NAME[l.stageType]} ${formatWon(l.amount)}`).join(" + ")})</dt>
                  <dd>{formatWon(o.itemsTotal)}원</dd>
                </div>
                <div><dt>플랫폼 이용료 (5%)</dt><dd>{formatWon(o.platformFee)}원</dd></div>
              </dl>

              {pay.isPending ? (
                <section className="result mt-40" aria-live="polite">
                  <div className="pay-wait"><span className="spin" role="img" aria-label="처리 중" /></div>
                  <h2>결제를 확인하고 있습니다</h2>
                  <p>창을 닫거나 새로 고쳐도 결제는 한 번만 진행됩니다.</p>
                </section>
              ) : failed ? (
                <section className="result mt-40" role="alert">
                  <span className="result__icon result__icon--bad"><Ico name="x" /></span>
                  <h2>결제가 완료되지 않았습니다</h2>
                  <p>{pay.isError ? errorMessageOf(pay.error) : "테스트 결제 승인이 거절되었습니다. 섭외는 확정되지 않았으며 결제 금액은 청구되지 않았습니다."}</p>
                  <div className="btns btns--center mt-24">
                    <Link className="btn btn--lg" to={`/performances/${id}/order`}>청구서로</Link>
                    <button type="button" className="btn btn--primary btn--lg" onClick={retry}>다시 결제</button>
                  </div>
                </section>
              ) : (
                <section className="sec mt-40">
                  <div className="sec-head"><h2><Ico name="wallet" />결제 수단</h2></div>
                  <div className="choice choice--col" role="radiogroup" aria-label="결제 수단">
                    <label className="choice__item">
                      <input type="radio" name="pm" checked={method === "CARD"} onChange={() => setMethod("CARD")} />
                      <span className="choice__mark" /><span><b>테스트 카드</b><small>실제 카드 정보를 받지 않습니다. 누르면 바로 승인됩니다.</small></span>
                    </label>
                    <label className="choice__item">
                      <input type="radio" name="pm" checked={method === "TRANSFER"} onChange={() => setMethod("TRANSFER")} />
                      <span className="choice__mark" /><span><b>테스트 계좌이체</b><small>실제 계좌를 사용하지 않습니다.</small></span>
                    </label>
                  </div>
                  <p className="test-pay mt-16"><Ico name="info" sm />{TEST_PAY}</p>
                  <div className="btns btns--fill mt-16">
                    <Link className="btn btn--lg" to={`/performances/${id}/order`}>청구서로</Link>
                    <button type="button" className="btn btn--primary btn--lg" onClick={submit} disabled={pay.isPending}>
                      {formatWon(o.totalAmount)}원 결제
                    </button>
                  </div>
                  <p className="field__hint mt-8">결제 직전에 청구서 금액을 서버에서 다시 확인합니다.</p>
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}
