import { Fragment } from "react";
import type { Article, TermsDoc } from "./terms";
import { TermsArticleBody } from "./TermsArticleBody";

export function TermsArticle({ article }: { article: Article }) {
  return (
    <article className="tm-art" id={article.id}>
      <h3>{article.title}</h3>
      <TermsArticleBody article={article} />
    </article>
  );
}

export function TermsAddendum({ text }: { text: string }) {
  return (
    <section className="tm-add">
      <h3>부칙</h3>
      <p>{text}</p>
    </section>
  );
}

export function TermsDocumentBody({ doc }: { doc: TermsDoc }) {
  return (
    <>
      {doc.chapters.map((c, i) => (
        <Fragment key={c.title ?? i}>
          {c.title && <h3 className="tm-chap">{c.title}</h3>}
          {c.articles.map((a) => (
            <TermsArticle key={a.id} article={a} />
          ))}
        </Fragment>
      ))}
      <TermsAddendum text={doc.addendum} />
    </>
  );
}
