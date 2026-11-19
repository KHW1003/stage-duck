import type { Article } from "./terms";
import "./support.css";

export function TermsArticleBody({ article }: { article: Article }) {
  return (
    <>
      {article.p && <div className="tm-p">{article.p}</div>}
      {article.ol && (
        <ol className="tm-ol">
          {article.ol.map((item, i) => (
            <li key={i}>
              <span className="tm-num">{"①②③④⑤⑥⑦⑧⑨"[i]}</span>
              <div>{item}</div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
