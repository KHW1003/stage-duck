/**
 * 견적서 고치기 (/supplier/quotes/:quoteId/edit, #41). 승인된 업체만. 목업 p-quote.html 양식을 그대로 쓴다.
 * - AC-F2-20: 현재 버전 값으로 채운 양식을 고쳐 보내면 새 버전이 생기고, 이전 버전은 이력에 남는다
 * - 견적서 이름(label)은 읽기 전용이고 보내지 않는다 (QuoteUpdateIn)
 * - 409 VERSION_CONFLICT: 서버 문구 + [새로 불러오기] (api-contract.md 1장 버전 충돌)
 * - 409 INVALID_STATE: 서버 문구 그대로 + [공고 목록으로] (보낸 상태가 아니면 고칠 수 없다)
 * - 남의 견적서는 서버가 404 → 볼 수 없다는 안내
 */
import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../shared/api/client";
import type { PostingDetail, QuoteOut, QuoteSentOut } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { DoneView } from "../shared/ui/DoneView";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { MoneyText } from "../shared/ui/MoneyText";
import { usePosting, useQuote, useUpdateQuote } from "../features/quote/api";
import { dateLabel, hm, stageTag } from "../features/quote/labels";
import { QuoteForm, type QuoteBodyIn } from "../features/quote/QuoteForm";
import { useSupplierTermsReview } from "../features/supplier/termsReview";
import { SupplierTermsFlow } from "./SupplierTermsReview";
import styles from "../features/quote/Quote.module.css";

const LIST_PATH = "/supplier/postings";

function Notice({ title, desc, children }: { title?: string; desc: string; children?: ReactNode }) {
  return (
    <div className={styles.notice} role="status">
      {title && <b>{title}</b>}
      <p>{desc}</p>
      <div className={styles.noticeActions}>{children ?? <ButtonLink to={LIST_PATH}>공고 목록으로</ButtonLink>}</div>
    </div>
  );
}

/** AC-F2-20: 버전마다 합계를 남겨 보여 준다 (이전 버전은 지워지지 않는다) */
function History({ quote }: { quote: QuoteOut }) {
  const rows = [...quote.versions].sort((a, b) => a.version - b.version);
  return (
    <section className={styles.sec} aria-labelledby="quote-history">
      <h2 id="quote-history" className={styles.secTitle}>
        버전 이력
      </h2>
      <ul className={styles.history} aria-labelledby="quote-history">
        {rows.map((v) => (
          <li key={v.version}>
            <span className="sd-num">v{v.version}</span>
            <MoneyText value={v.totalAmount} />
            {v.version === quote.currentVersion && <span className={styles.tag}>현재</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Updated({ p, quote, result }: { p: PostingDetail; quote: QuoteOut; result: QuoteSentOut }) {
  return (
    <div className={`sd-container ${styles.wrap}`}>
      <DoneView
        title={`v${result.version}로 고쳤어요`}
        desc="사용자 견적함의 견적서가 새 버전으로 바뀌었어요. 이전 버전은 이력에 남아요."
        rows={[
          ["공고", p.title],
          ["견적서 이름", quote.label],
          ["버전", `v${result.version}`],
        ]}
        actions={[
          { label: "공고 보기", to: `${LIST_PATH}/${p.stageId}`, primary: true },
          { label: "공고 목록으로", to: LIST_PATH },
        ]}
      />
    </div>
  );
}

function Editor({ quote, reload }: { quote: QuoteOut; reload: () => void }) {
  const posting = usePosting(quote.stageId);
  const update = useUpdateQuote(quote.quoteId);
  const review = useSupplierTermsReview();
  const [draftToSend, setDraftToSend] = useState<QuoteBodyIn | null>(null);

  function sendUpdate(body: QuoteBodyIn) {
    update.mutate({ ...body, version: quote.currentVersion }, {
      onError: (error) => {
        if (error instanceof ApiError && error.body.code === "SUPPLIER_TERMS_REVIEW_REQUIRED") {
          setDraftToSend(body);
        }
      },
    });
  }

  function submit(body: QuoteBodyIn) {
    if (review.data?.reviewed) sendUpdate(body);
    else setDraftToSend(body);
  }
  const p = posting.data;
  const code = update.error instanceof ApiError ? update.error.body.code : undefined;
  const conflict = code === "VERSION_CONFLICT";
  const closed = code === "INVALID_STATE";

  if (p && update.data) return <Updated p={p} quote={quote} result={update.data} />;

  return (
    <>
      <PageTop
        title={`견적서 고치기 · ${quote.label}`}
        crumbs={[{ label: "공고 목록", to: LIST_PATH }, { label: "공고 상세", to: `${LIST_PATH}/${quote.stageId}` }, { label: "견적서 고치기" }]}
        desc={
          p && (
            <span className="sd-num">
              {p.title} · {stageTag(p)} · {dateLabel(p.showDate)} · 리허설 {hm(p.rehearsalStart)} · 공연 {hm(p.showStart)}~{hm(p.showEnd)} · 지금 v
              {quote.currentVersion}
            </span>
          )
        }
      />
      <div className={`sd-container ${styles.wrap}`}>
        <ErrorNotice error={posting.error} />
        {closed && <Notice desc={(update.error as ApiError).body.message} />}
        {conflict && (
          <Notice desc={(update.error as ApiError).body.message}>
            <Button
              variant="primary"
              onClick={() => {
                update.reset();
                reload();
              }}
            >
              새로 불러오기
            </Button>
          </Notice>
        )}
        {p && !closed && (
          <QuoteForm
            // 새 버전을 불러오면 양식을 그 값으로 다시 채운다
            key={quote.currentVersion}
            mode="edit"
            posting={p}
            label={quote.label}
            current={quote.current}
            sending={update.isPending}
            error={conflict ? null : update.error}
            onSubmit={submit}
          />
        )}
        <History quote={quote} />
      </div>
      {draftToSend && (
        <SupplierTermsFlow
          completeLabel="확인하고 수정 견적 보내기"
          onClose={() => setDraftToSend(null)}
          onComplete={() => {
            setDraftToSend(null);
            sendUpdate(draftToSend);
          }}
        />
      )}
    </>
  );
}

export function QuoteEditPage() {
  const quoteId = Number(useParams().quoteId);
  const quote = useQuote(quoteId);
  const hidden = quote.error instanceof ApiError && quote.error.status === 404;

  if (quote.data) return <Editor quote={quote.data} reload={() => void quote.refetch()} />;

  return (
    <>
      <PageTop title="견적서 고치기" crumbs={[{ label: "공고 목록", to: LIST_PATH }, { label: "견적서 고치기" }]} />
      <div className={`sd-container ${styles.wrap}`}>
        {quote.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {hidden && <Notice title="볼 수 없는 견적서예요" desc="내가 보낸 견적서가 아니거나, 없는 견적서예요." />}
        {!hidden && <ErrorNotice error={quote.error} />}
      </div>
    </>
  );
}
