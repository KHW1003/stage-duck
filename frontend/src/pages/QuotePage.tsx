/**
 * 견적서 쓰기 (/supplier/postings/:stageId/quote, #41). 승인된 업체만. 목업 p-quote.html (업체 테마).
 * - AC-F2-15: 보내면 완료 안내 + [채팅방으로]·[다른 견적서 쓰기]·[공고 목록으로]
 * - AC-F2-20: [견적서 고치기]는 /supplier/quotes/<보낸 quoteId>/edit (새 버전 v2)
 * - AC-F2-16: [다른 견적서 쓰기]는 ?new=<보낸 quoteId> 로 빈 양식을 새로 연다 (label 을 바꿔 하나 더)
 * - 응답 checks[]의 경고·충돌·확인 필요를 완료 화면에 글자와 함께 보여 준다 (StatusBadge)
 * - 409 STAGE_NOT_OPEN: 보낼 수 없는 공고 안내 + [공고 목록으로]
 * [채팅방으로]는 지금 화면 주소에 ?chat=<roomId> 를 붙인다. 떠 있는 채팅 위젯 연결은 다음 PR.
 */
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../shared/api/client";
import type { PostingDetail, QuoteIn, QuoteSentOut } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { StatusBadge } from "../shared/StatusBadge";
import { ButtonLink } from "../shared/ui/Button";
import { DoneView, type DoneAction } from "../shared/ui/DoneView";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { MoneyText } from "../shared/ui/MoneyText";
import { usePosting, useSendQuote } from "../features/quote/api";
import { isQuotable, PostingBrief } from "../features/quote/PostingBrief";
import { QuoteForm } from "../features/quote/QuoteForm";
import { useSupplierTermsReview } from "../features/supplier/termsReview";
import { SupplierTermsFlow } from "./SupplierTermsReview";
import styles from "../features/quote/Quote.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

const LIST_PATH = "/supplier/postings";

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className={styles.notice} role="status">
      <b>{title}</b>
      <p>{desc}</p>
      <div className={styles.noticeActions}>
        <ButtonLink to={LIST_PATH}>공고 목록으로</ButtonLink>
      </div>
    </div>
  );
}

/** 보낸 뒤 완료 안내 */
function Sent({ p, body, result, again }: { p: PostingDetail; body: QuoteIn; result: QuoteSentOut; again: string }) {
  const base = `${LIST_PATH}/${p.stageId}/quote`;
  const actions: DoneAction[] = [];
  if (result.chatRoomId !== null) {
    const qs = new URLSearchParams(again ? { new: again } : {});
    qs.set("chat", String(result.chatRoomId));
    actions.push({ label: "채팅방으로", to: `${base}?${qs}`, primary: true });
  }
  actions.push({ label: "다른 견적서 쓰기", to: `${base}?new=${result.quoteId}`, primary: result.chatRoomId === null });
  actions.push({ label: "견적서 고치기", to: `/supplier/quotes/${result.quoteId}/edit` });
  actions.push({ label: "공고 목록으로", to: LIST_PATH });

  const fullSpec = body.includes.equipment && body.includes.engineer;
  const notPass = result.checks.filter((c) => c.result !== "PASS");

  return (
    <div className={`sd-container ${styles.wrap}`}>
      <DoneView
        title="견적서를 보냈어요"
        desc="뮤지션의 내 공연에 도착했어요. 뮤지션이 채팅을 시작하면 이야기를 나눌 수 있어요."
        rows={[
          ["공고", p.title],
          ["견적서 이름", body.label],
          ["합계", <MoneyText value={body.totalAmount} />, true],
          ["버전", `v${result.version}`],
          ...(fullSpec ? [["표시", <span className={styles.tag}>풀스펙</span>] as [string, JSX.Element]] : []),
        ]}
        actions={actions}
      />
      {result.checks.length > 0 && (
        <section className={`${styles.sec} ${styles.doneWrap}`} aria-labelledby="quote-checks">
          <h2 id="quote-checks" className={styles.secTitle}>
            자동 검사 결과
          </h2>
          {notPass.length === 0 ? (
            <p className={styles.desc}>경고나 충돌이 없어요.</p>
          ) : (
            <ul className={styles.checkList} aria-label="자동 검사 결과">
              {notPass.map((c) => (
                <li key={c.id}>
                  <StatusBadge result={c.result} />
                  <span>{c.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Writer({ stageId, again }: { stageId: number; again: string }) {
  const posting = usePosting(stageId);
  const send = useSendQuote(stageId);
  const review = useSupplierTermsReview();
  const [draftToSend, setDraftToSend] = useState<QuoteIn | null>(null);

  function sendQuote(body: QuoteIn) {
    send.mutate(body, {
      onError: (error) => {
        if (error instanceof ApiError && error.body.code === "SUPPLIER_TERMS_REVIEW_REQUIRED") {
          setDraftToSend(body);
        }
      },
    });
  }

  function submit(body: QuoteIn) {
    if (review.data?.reviewed) sendQuote(body);
    else setDraftToSend(body);
  }
  const p = posting.data;
  const crumbs = [{ label: "공고 목록", to: LIST_PATH }, { label: "공고 상세", to: `${LIST_PATH}/${stageId}` }, { label: "견적서" }];

  if (p && send.data && send.variables) return <Sent p={p} body={send.variables} result={send.data} again={again} />;

  const notOpen = send.error instanceof ApiError && send.error.body.code === "STAGE_NOT_OPEN";
  const hidden = posting.error instanceof ApiError && posting.error.status === 404;

  return (
    <>
      <PageTop title="견적서 쓰기" crumbs={crumbs} />
      <div className={`sd-container ${styles.wrap}`}>
        {posting.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {hidden && <Notice title="볼 수 없는 공고예요" desc="마감됐거나 내 부문의 공고가 아니에요." />}
        {!hidden && <ErrorNotice error={posting.error} />}
        {notOpen && <Notice title="지금은 견적서를 보낼 수 없는 공고예요" desc={(send.error as ApiError).body.message} />}
        {p && <PostingBrief p={p} withNeeds />}
        {p && !notOpen && isQuotable(p) && <QuoteForm posting={p} sending={send.isPending} error={send.error} onSubmit={submit} />}
        {p && !isQuotable(p) && (
          // 모집 전: 양식은 보이되 잠근다 (안내 문구는 위 카드)
          <fieldset className={styles.locked} disabled aria-label="견적서 양식 (모집 전이라 잠겨 있어요)">
            <QuoteForm posting={p} sending={false} error={null} onSubmit={() => undefined} />
          </fieldset>
        )}
      </div>
      {draftToSend && (
        <SupplierTermsFlow
          completeLabel="확인하고 견적 보내기"
          onClose={() => setDraftToSend(null)}
          onComplete={() => {
            setDraftToSend(null);
            sendQuote(draftToSend);
          }}
        />
      )}
    </>
  );
}

export function QuotePage() {
  usePageMeta("견적서 쓰기");
  const stageId = Number(useParams().stageId);
  const again = useSearchParams()[0].get("new") ?? "";
  // [다른 견적서 쓰기]로 ?new= 가 바뀌면 양식·보낸 결과를 새로 시작한다 (?chat= 은 그대로 둔다)
  return <Writer key={stageId + ":" + again} stageId={stageId} again={again} />;
}
