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
import { CancellationPenaltyTable, SERVICE_TERM_GROUPS, TERMS } from "../features/support/terms";
import type { Order, StageType } from "../shared/api/types";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { DeadlineNotice } from "../shared/ui/DeadlineNotice";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import { formatWon } from "../shared/ui/MoneyText";
import { TransactionTermsModal } from "./TransactionTermsModal";
import "./payment.css";

const STAGE_ICON: Record<StageType, KitIconName> = { VENUE: "venue", EQUIPMENT: "speaker", ENGINEER: "engineer" };
export const TEST_PAY = "테스트 결제라 실제로 청구되지 않습니다";

const PAYMENT_AGREEMENTS = {
  rules: {
    title: "취소·환불 및 분쟁 문의",
    confirmation: "확인",
    articles: SERVICE_TERM_GROUPS.cancellation,
  },
  hold: {
    title: "서비스 이용·예약·결제 조건",
    confirmation: "동의",
    articles: SERVICE_TERM_GROUPS.transaction,
  },
} as const;

const AGREEMENT_FIELDS = ["hold", "rules"] as const;
type AgreementField = typeof AGREEMENT_FIELDS[number];

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
      <li className={settled ? "is-done" : "is-now"}><b>보관 중</b>{!settled && <small>공연이 끝날 때까지 STAGE DUCK이 보관합니다</small>}</li>
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
  const [openAgreement, setOpenAgreement] = useState<AgreementField | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const agreement = openAgreement ? PAYMENT_AGREEMENTS[openAgreement] : null;
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
          <p className="muted">불러오는 중입니다.</p>
        ) : (
          <>
            <StepBar paid={paid} />
            <div className="with-aside mt-40">
              <div>
                <section className="sec">
                  <div className="sec-head">
                    <h2><Ico name="receipt" />청구 내역</h2>
                    {paid ? <p><span className="state state--done">결제 완료</span></p> : <p>확정한 업체 금액과 플랫폼 이용료입니다.</p>}
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
                  <div className="sec-head"><h2><Ico name="info" />꼭 확인해 주십시오</h2></div>
                  <ul className="bullets">
                    <li>결제 금액은 공연이 끝날 때까지 STAGE DUCK이 보관하며, 공연 후 업체별로 정산됩니다.</li>
                    <li>결제가 완료되면 업체 연락처가 최종 담당표에 공개됩니다.</li>
                    <li>결제 후에는 내용을 변경하거나 추가 결제를 할 수 없습니다.</li>
                  </ul>
                  <div className="mt-24">
                    <h3>취소 시점별 위약금</h3>
                    <CancellationPenaltyTable />
                    <p className="field__hint mt-8">공연팀 사정으로 취소할 때 적용됩니다. 위약금이 발생하는 구간에는 플랫폼 이용료가 환불되지 않습니다.</p>
                  </div>
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
                    <p className="strong">섭외가 확정되었습니다</p>
                    <p className="small muted mt-4">업체 연락처가 최종 담당표에 공개되었습니다.</p>
                    <Link className="btn btn--primary btn--block mt-16" to={`/performances/${id}/sheet`}>최종 담당표 보기</Link>
                  </div>
                ) : (
                  <>
                    <div className="side-box__sec side-box__sec--gray">
                      <p className="small strong">결제 방법</p>
                      <p className="desc mt-4">테스트 결제 <span className="muted">· 실제 카드·계좌를 사용하지 않습니다</span></p>
                    </div>
                    <div className="side-box__sec">
                      <div className="stack" style={{ "--gap": "8px" } as CSSProperties}>
                        {AGREEMENT_FIELDS.map((key) => {
                          const { title, confirmation } = PAYMENT_AGREEMENTS[key];
                          const inputId = `invoice-agreement-${key}`;
                          return (
                            <div className="check" key={key}>
                              <input
                                id={inputId}
                                type="checkbox"
                                aria-label={`${title} ${confirmation} (필수)`}
                                checked={agreed[key]}
                                onChange={() => setOpenAgreement(key)}
                              />
                              <span>
                                <button
                                  className="invoice-terms-link"
                                  type="button"
                                  aria-haspopup="dialog"
                                  onClick={() => setOpenAgreement(key)}
                                >
                                  {title}
                                </button>{" "}
                                <label htmlFor={inputId}>{confirmation} (필수)</label>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        className="invoice-terms-link small muted mt-8"
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setShowPrivacy(true)}
                      >
                        개인정보 처리방침 보기
                      </button>
                      {agreed.rules && agreed.hold ? (
                        <Link className="btn btn--primary btn--lg btn--block mt-16" to={`/performances/${id}/pay`}>결제하기</Link>
                      ) : (
                        <button type="button" className="btn btn--primary btn--lg btn--block mt-16" disabled>결제하기</button>
                      )}
                      <DeadlineNotice deadline={o.paymentDeadline} what="결제" />
                      <p className="test-pay mt-8"><Ico name="info" sm />{TEST_PAY}</p>
                      <p className="field__hint mt-8">버튼을 두 번 눌러도 한 번만 결제됩니다.</p>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
      {agreement && openAgreement && !paid && (
        <TransactionTermsModal
          title={agreement.title}
          doc={TERMS.service}
          articles={agreement.articles}
          includeAddendum={openAgreement === "rules"}
          onClose={() => setOpenAgreement(null)}
          action={
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                setAgreed((current) => ({ ...current, [openAgreement]: !current[openAgreement] }));
                setOpenAgreement(null);
              }}
            >
              {agreed[openAgreement] ? "동의 해제" : "이 항목에 동의"}
            </button>
          }
        />
      )}
      {showPrivacy && (
        <TransactionTermsModal
          title="개인정보 처리방침"
          doc={TERMS.privacy}
          onClose={() => setShowPrivacy(false)}
        />
      )}
    </>
  );
}
