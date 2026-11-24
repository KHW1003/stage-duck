import { useEffect, useRef, type ReactNode } from "react";
import { TermsAddendum, TermsArticle, TermsDocumentBody } from "../features/support/TermsDocumentBody";
import type { Article, TermsDoc } from "../features/support/terms";
import { KitModal } from "../shared/ui/KitModal";
import "./payment.css";

interface Props {
  title: string;
  doc: TermsDoc;
  articles?: readonly Article[];
  includeAddendum?: boolean;
  onClose: () => void;
  action?: ReactNode;
  intro?: ReactNode;
  busy?: boolean;
  onEndReached?: () => void;
}

export function TransactionTermsModal({ title, doc, articles, includeAddendum, onClose, action, intro, busy, onEndReached }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onEndReached || !end.current) return;
    if (typeof IntersectionObserver === "undefined") {
      onEndReached();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        onEndReached();
        observer.disconnect();
      }
    }, { root: end.current.closest(".modal__body"), threshold: 1 });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [onEndReached]);

  return (
    <div className="transaction-terms-dialog">
      <KitModal
        title={title}
        onClose={onClose}
        busy={busy}
        focusableBody={Boolean(onEndReached)}
        foot={
          <>
            <button className="btn btn--line" type="button" onClick={onClose} disabled={busy}>본문 닫기</button>
            {action}
          </>
        }
      >
        {intro}
        <p className="tm-meta">{doc.title} · 시행일 {doc.effective} · 버전 {doc.version}</p>
        {articles ? (
          <>
            {articles.map((article) => <TermsArticle key={article.id} article={article} />)}
            {includeAddendum && <TermsAddendum text={doc.addendum} />}
          </>
        ) : <TermsDocumentBody doc={doc} />}
        {onEndReached && <div ref={end} className="transaction-terms-end" aria-hidden="true" />}
      </KitModal>
    </div>
  );
}
