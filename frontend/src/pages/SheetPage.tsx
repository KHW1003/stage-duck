/**
 * 최종 담당표 (/performances/:id/sheet). 목업: mockup-v4/pages/sheet.html · FR-PAY-04 · AC-F5-11·12 · 묶음 4
 * React: SheetPage = PageTop + Timeline + ScopeTable + Contacts. 사용자와 확정 업체가 같은 화면을 본다.
 * 연락처는 서버가 결제 뒤에만 준다 — 결제 전이면 안내만 보여 준다. 목업의 마이페이지 왼쪽 메뉴는 공통 레이아웃(1번) 몫이라 뺐다.
 */
import { Link, useParams } from "react-router-dom";
import { useSheet } from "../features/payment/api";
import { STAGE_NAME, dateLabel } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { CancellationPenaltyTable } from "../features/support/terms";
import { useMe } from "../shared/auth/useMe";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import { formatWon } from "../shared/ui/MoneyText";
import { whenLabel } from "./InvoicePage";
import { SupplierTermsPanel } from "./SupplierTermsReview";

/** 일정 제목에 맞는 아이콘 (보기용) */
function scheduleIcon(title: string): KitIconName {
  if (title.includes("입실")) return "door";
  if (title.includes("설치")) return "tool";
  if (title.includes("리허설")) return "mic";
  if (title.includes("공연 시작")) return "music";
  if (title.includes("철수")) return "truck";
  return "out";
}

export function SheetPage() {
  const id = Number(useParams().id);
  const sheet = useSheet(id);
  const isSupplier = useMe().data?.role === "SUPPLIER";
  usePageMeta("최종 담당표");
  const s = sheet.data;

  return (
    <>
      <KitPageTop
        title="최종 담당표"
        crumbs={[
          isSupplier ? { label: "내 예약", to: "/supplier/reservations" } : { label: "내 공연", to: "/me/performances" },
          { label: "최종 담당표" },
        ]}
      />
      <main className="container main">
        {sheet.isError ? (
          <ErrorNotice error={sheet.error} />
        ) : !s ? (
          <p className="muted">불러오는 중입니다.</p>
        ) : (
          <>
            <div className="sec-head">
              <div>
                <h2>{s.title}</h2>
                <p>
                  {[dateLabel(s.showDate), `${s.sido} ${s.sigungu}`, `관객 ${s.audience}명`, s.paidAt ? `결제 ${whenLabel(s.paidAt)}` : "결제 전"].join(" · ")}
                </p>
              </div>
              <button className="btn btn--sm" type="button" onClick={() => window.print()}><Ico name="print" sm />인쇄</button>
            </div>
            {isSupplier && (
              <SupplierTermsPanel
                actions={<Link className="btn btn--primary" to={"/supplier/tech/" + id}>현장 준비 확인</Link>}
              />
            )}
            <div className="with-aside mt-24">
              <div>
                <section className="sec">
                  <div className="sec-head"><h2><Ico name="clock" />당일 일정</h2></div>
                  <ol className="timeline" aria-label="당일 일정">
                    {s.schedule.map((i) => (
                      <li key={`${i.time}-${i.title}`}>
                        <span className="timeline__t">{i.time}</span>
                        <span className="timeline__dot"><span className="ico-box"><Ico name={scheduleIcon(i.title)} /></span></span>
                        <div className="timeline__body"><b>{i.title}</b><small>{i.who}</small></div>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="sec">
                  <div className="sec-head">
                    <h2><Ico name="list" />담당 범위</h2>
                    <p>확정 당시의 조건을 그대로 보관합니다. 업체가 이후에 정보를 바꿔도 이 표는 변경되지 않습니다.</p>
                  </div>
                  <div className="table-box">
                    <table className="table table--fit">
                      <thead><tr><th>단계</th><th>업체</th><th>맡는 일</th><th>금액</th></tr></thead>
                      <tbody>
                        {s.lines.map((l) => (
                          <tr key={l.stageType} className={l.companyName ? undefined : "is-off"}>
                            <td className="strong">{STAGE_NAME[l.stageType]}</td>
                            <td>{l.companyName ?? (l.status === "SKIPPED" ? "건너뜀" : "미확정")}</td>
                            <td className="l">{l.scope || "-"}</td>
                            <td className="r">{l.amount !== null ? `${formatWon(l.amount)}원` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                {isSupplier && (
                  <section className="sec">
                    <div className="sec-head"><h2>공연팀 취소 시 위약금</h2></div>
                    <CancellationPenaltyTable />
                    <p className="field__hint mt-8">공연팀 사정으로 취소하면 위약금은 확정 업체의 금액 비율에 따라 나누어 정산합니다.</p>
                  </section>
                )}
              </div>
              <aside aria-label="연락처">
                <div className="sec-head"><h2><Ico name="users" />연락처</h2></div>
                {s.paid ? (
                  <ul className="contacts">
                    {s.contacts.map((c) => (
                      <li key={`${c.role}-${c.name}`}>
                        <p className="contacts__role">{c.role === "USER" ? "사용자" : c.role}</p>
                        <p className="contacts__name">{c.name}</p>
                        <dl>
                          {c.realName && (<><dt>이름</dt><dd>{c.realName}</dd></>)}
                          <dt>전화</dt><dd>{c.phone}</dd>
                          <dt>이메일</dt><dd>{c.email}</dd>
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="notice">결제가 완료되면 서로의 연락처가 여기에 표시됩니다.</p>
                )}
                <p className="field__hint mt-12">이 공연에서 확정된 업체와 사용자만 볼 수 있습니다.</p>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
