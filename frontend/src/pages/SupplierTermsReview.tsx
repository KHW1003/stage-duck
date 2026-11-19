import { useCallback, useState, type ReactNode } from "react";
import { useConfirmSupplierTermsReview, useSupplierTermsReview } from "../features/supplier/termsReview";
import { SUPPLIER_TERM_GROUPS, TERMS } from "../features/support/terms";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { TransactionTermsModal } from "./TransactionTermsModal";
import "./supplier-terms-review.css";

const DOCUMENTS = [
  { title: "입점·견적·이행 및 정산", doc: TERMS.supplier, articles: SUPPLIER_TERM_GROUPS.transaction },
  { title: "업체 취소 및 이용 규칙", doc: TERMS.supplier, articles: SUPPLIER_TERM_GROUPS.cancellation, includeAddendum: true },
  { title: "개인정보 처리방침", doc: TERMS.privacy },
] as const;

interface FlowProps {
  onClose: () => void;
  onComplete: () => void;
  completeLabel?: string;
}

export function SupplierTermsFlow({ onClose, onComplete, completeLabel = "약관 확인 완료" }: FlowProps) {
  const [index, setIndex] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const confirm = useConfirmSupplierTermsReview();
  const markEnd = useCallback(() => setAtEnd(true), []);
  const last = index === DOCUMENTS.length - 1;
  const reviewDocument = DOCUMENTS[index];

  function advance() {
    if (!atEnd || confirm.isPending) return;
    if (last) {
      confirm.mutate(undefined, { onSuccess: onComplete });
    } else {
      setAtEnd(false);
      setIndex(index + 1);
    }
  }

  return (
    <TransactionTermsModal
      key={index}
      {...reviewDocument}
      onClose={onClose}
      busy={confirm.isPending}
      onEndReached={markEnd}
      intro={<p className="supplier-terms-step">필수 확인 {index + 1}/{DOCUMENTS.length} · 본문 끝까지 내려 주세요.</p>}
      action={
        <>
          {confirm.isError && <ErrorNotice error={confirm.error} />}
          <button className="btn btn--primary" type="button" disabled={!atEnd || confirm.isPending} onClick={advance}>
            {confirm.isPending ? "저장 중…" : last ? completeLabel : "확인하고 다음"}
          </button>
        </>
      }
    />
  );
}

export function SupplierTermsPanel({ actions }: { actions?: ReactNode }) {
  const review = useSupplierTermsReview();
  const [openFlow, setOpenFlow] = useState(false);
  const [openDocument, setOpenDocument] = useState<typeof DOCUMENTS[number] | null>(null);

  return (
    <section className="supplier-terms-panel" aria-label="업체 거래 약관">
      <div className="supplier-terms-panel__head">
        <div>
          <h2>업체 거래 약관</h2>
          <p>{review.data?.reviewed ? "확인을 완료했어요. 아래에서 언제든 다시 볼 수 있어요." : "현장 준비를 시작하려면 아래 약관 세 가지를 먼저 확인해 주세요."}</p>
        </div>
        <div className="btns">
          {review.data?.reviewed ? actions : (
            <button className="btn btn--primary" type="button" onClick={() => setOpenFlow(true)} aria-haspopup="dialog">
              약관 확인 시작
            </button>
          )}
        </div>
      </div>
      <ul className="supplier-terms-panel__documents">
        {DOCUMENTS.map((document) => (
          <li key={document.title}>
            <button className="btn btn--line btn--sm" type="button" onClick={() => setOpenDocument(document)} aria-haspopup="dialog">
              {document.title} 보기
            </button>
          </li>
        ))}
      </ul>
      {openFlow && <SupplierTermsFlow onClose={() => setOpenFlow(false)} onComplete={() => setOpenFlow(false)} />}
      {openDocument && <TransactionTermsModal {...openDocument} onClose={() => setOpenDocument(null)} />}
    </section>
  );
}
