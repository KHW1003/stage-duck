/**
 * 통합 청구서 (/performances/:id/order). 목업: mockup-v4/pages/invoice.html · FR-PAY-01·02 · AC-F5-03·07 · 묶음 4
 * React: InvoicePage = StepBar + Invoice + PayBox(SideBox) + Escrow. 금액은 서버가 준 숫자를 그대로 보여 준다 (CLAUDE.md 11·12).
 * 결제 마감 시각은 payment_deadline(#52) 전이라 아직 뺐다 (내용 미정).
 */
import { useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useOrder } from "../features/payment/api";
import { usePerformance } from "../features/performance/api";
import { STAGE_NAME, dateLabel } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import type { Order, StageType } from "../shared/api/types";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import { formatWon } from "../shared/ui/MoneyText";
import "./payment.css";

const STAGE_ICON: Record<StageType, KitIconName> = { VENUE: "venue", EQUIPMENT: "speaker", ENGINEER: "engineer" };
export const TEST_PAY = "테스트 결제 — 실제 청구되지 않습니다";

/** "2026-11-13T15:05:00" → "11월 13일 15:05" */
export function whenLabel(iso: string): string {
  const [d, t] = iso.split("T");
  const [, m, day] = d.split("-").map(Number);
  return `${m}월 ${day}일 ${t.slice(0, 5)}`;
}

export function StepBar({ paid }: { paid: boolean }) {
  const steps: [string, KitIconName][] = [["단계별 확정", "pass"], ["청구서 확인·결제", "receipt"], ["섭외 확정", "ticket"]];
  return (
    <ol className="step-bar" aria-label="결제 단계">
      {steps.map(([label, icon], i) => {
        const now = paid ? i === 2 : i === 1;
        const done = paid ? i < 2 : i < 1;
        return (
          <li key={label} className={done ? "is-done" : now ? "is-now" : undefined} aria-current={now ? "step" : undefined}>
            <b>0{i + 1}</b><Ico name={icon} />{label}
          </li>
        );
      })}
    </ol>
  );
}

function InvoiceTable({ order, stages }: { order: Order; stages: { stageType: StageType; status: string }[] }) {
  const lineOf = (t: StageType) => order.lines.find((l) => l.stageType === t);
  return (
    <div className="invoice">
      {stages.map((s) => {
        const line = lineOf(s.stageType);
        return (
          <div className="invoice__row" key={s.stageType}>
            <span className={`invoice__stage${line ? "" : " muted"}`}><span className="ico-box"><Ico name={STAGE_ICON[s.stageType]} /></span>{STAGE_NAME[s.stageType]}</span>
            <div className="invoice__what">
              {line ? (
                <div><b>{line.companyName}</b><small>확정 견적서 기준</small></div>
              ) : (
                <span className="state state--off">건너뜀</span>
              )}
            </div>
            <span className={`invoice__amt${line ? "" : " muted"}`}>{line ? `${formatWon(line.amount)}원` : "-"}</span>
          </div>
        );
      })}
      <div className="invoice__calc">
        <div><span>업체 금액 합계</span><span className="num">{formatWon(order.itemsTotal)}원</span></div>
        <div><span>플랫폼 이용료<small>업체 금액의 5%, 원 미만 버림</small></span><span className="num">{formatWon(order.platformFee)}원</span></div>
      </div>
      <div className="invoice__total"><span>결제할 금액</span><b>{formatWon(order.totalAmount)}원</b></div>
    </div>
  );
}

function Escrow({ order }: { order: Order }) {
  const settled = order.status === "SETTLEMENT_SCHEDULED";
  return (
    <ol className="escrow" aria-label="결제금 상태">
      <li className="is-done"><b>결제</b>{order.paidAt ? whenLabel(order.paidAt) : ""}</li>
      <li className={settled ? "is-done" : "is-now"}><b>보관 중</b>{!settled && <small>공연이 끝날 때까지 STAGE DUCK이 보관해요</small>}</li>
      <li className={settled ? "is-now" : undefined}>
        <b>정산 예정</b>
        {settled ? <small>{order.lines.map((l) => `${l.companyName} ${formatWon(l.amount)}원`).join(" · ")}</small> : "공연 뒤 업체별로"}
      </li>
    </ol>
  );
}

export function InvoicePage() {
  const id = Number(useParams().id);
  const perf = usePerformance(id);
  const order = useOrder(id);
  const [agreed, setAgreed] = useState({ rules: false, hold: false });
  usePageMeta("통합 청구서");

  const p = perf.data;
  const o = order.data;
  const paid = !!o && o.status !== "ISSUED";

  return (
    <>
      <KitPageTop
        title="통합 청구서"
        crumbs={[{ label: "내 공연", to: "/me/performances" }, ...(p ? [{ label: p.title, to: `/performances/${p.id}` }] : []), { label: "통합 청구서" }]}
        meta={p && o ? [p.title, dateLabel(p.showDate), `${whenLabel(o.issuedAt)} 발행`] : undefined}
        actions={o && (o.status === "ISSUED" || o.status === "PAID") ? (
          <Link className="btn btn--sm btn--ghost" to={`/performances/${id}/cancel`}>취소·위약금 안내</Link>
        ) : undefined}
      />
      <main className="container main">
        {order.isError ? (
          <ErrorNotice error={order.error} />
        ) : !o || !p ? (
          <p className="muted">불러오는 중이에요.</p>
        ) : (
          <>
            <StepBar paid={paid} />
            <div className="with-aside mt-40">
              <div>
                <section className="sec">
                  <div className="sec-head">
                    <h2><Ico name="receipt" />청구 내역</h2>
                    {paid ? <p><span className="state state--done">결제 완료</span></p> : <p>확정한 업체 금액과 플랫폼 이용료예요.</p>}
                  </div>
                  <InvoiceTable order={o} stages={p.stages} />
                </section>
                {paid && (
                  <section className="sec">
                    <div className="sec-head"><h2><Ico name="wallet" />결제금 상태</h2></div>
                    <Escrow order={o} />
                  </section>
                )}
                <section className="sec">
                  <div className="sec-head"><h2><Ico name="info" />꼭 확인하세요</h2></div>
                  <ul className="bullets">
                    <li>결제 금액은 공연이 끝날 때까지 STAGE DUCK이 보관하고, 공연 뒤 업체별로 정산 예정이 돼요.</li>
                    <li>결제가 끝나면 업체 연락처가 최종 담당표에 공개돼요.</li>
                    <li>결제 후 12시간 안이나 공연 30일 전 이전에 취소하면 위약금이 없어요. 29일 전부터는 업체 금액의 10~100%가 위약금으로 나가고, 이때 플랫폼 이용료는 환불하지 않아요.</li>
                    <li>결제 뒤에는 내용을 바꾸거나 추가 결제를 할 수 없어요.</li>
                  </ul>
                </section>
              </div>
              <aside className="side-box sticky" aria-label="결제 정보">
                <div className="side-box__sec">
                  <p className="side-box__title">결제 정보</p>
                  <dl className="sum-rows">
                    <div><dt>업체 금액</dt><dd>{formatWon(o.itemsTotal)}원</dd></div>
                    <div><dt>플랫폼 이용료</dt><dd>{formatWon(o.platformFee)}원</dd></div>
                  </dl>
                </div>
                <div className="side-box__sec">
                  <div className="sum-total sum-total--point"><span>총 결제 금액</span><b>{formatWon(o.totalAmount)}<small>원</small></b></div>
                </div>
                {paid ? (
                  <div className="side-box__sec">
                    <p className="strong">섭외가 확정됐어요</p>
                    <p className="small muted mt-4">업체 연락처가 최종 담당표에 공개됐어요.</p>
                  </div>
                ) : (
                  <>
                    <div className="side-box__sec side-box__sec--gray">
                      <p className="small strong">결제 방법</p>
                      <p className="desc mt-4">테스트 결제 <span className="muted">· 실제 카드·계좌를 쓰지 않아요</span></p>
                    </div>
                    <div className="side-box__sec">
                      <div className="stack" style={{ "--gap": "8px" } as CSSProperties}>
                        <label className="check"><input type="checkbox" checked={agreed.rules} onChange={(e) => setAgreed({ ...agreed, rules: e.target.checked })} />취소 수수료·위약금 규정 확인 (필수)</label>
                        <label className="check"><input type="checkbox" checked={agreed.hold} onChange={(e) => setAgreed({ ...agreed, hold: e.target.checked })} />공연이 끝날 때까지 결제 금액 보관에 동의 (필수)</label>
                      </div>
                      {agreed.rules && agreed.hold ? (
                        <Link className="btn btn--primary btn--lg btn--block mt-16" to={`/performances/${id}/pay`}>결제하기</Link>
                      ) : (
                        <button type="button" className="btn btn--primary btn--lg btn--block mt-16" disabled>결제하기</button>
                      )}
                      <p className="test-pay mt-8"><Ico name="info" sm />{TEST_PAY}</p>
                      <p className="field__hint mt-8">버튼을 두 번 눌러도 한 번만 결제돼요.</p>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
