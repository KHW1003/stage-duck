/**
 * 메인·업체 메인 자주 묻는 질문 (mockup .faq). 펼치기는 브라우저 <details> 그대로 (키보드·읽어 주기 기본 동작).
 * 첫 질문만 처음에 펼쳐 둔다 (목업 open).
 */
import { Link } from "react-router-dom";
import type { Qna } from "./content";
import { cx } from "./cx";
import s from "./home.module.css";

interface Props {
  title: string;
  desc: string;
  ask: string;
  items: Qna[];
  id?: string;
}

export function FaqSection({ title, desc, ask, items, id }: Props) {
  return (
    <section className={s.faq} id={id}>
      <div className={cx(s.wrap, s.faqGrid)}>
        <div>
          <h2 className={s.secTitle}>{title}</h2>
          <p className={s.secDesc}>{desc}</p>
          <Link className={cx(s.btn, s.btnGhost, s.btnSm, s.faqAsk)} to="/inquiries/new">
            {ask}
          </Link>
        </div>
        <div className={s.faqList}>
          {items.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
