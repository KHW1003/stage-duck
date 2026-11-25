/**
 * 자주 묻는 질문 (/faq, /faq?tab=supplier). 목업: mockup-v4/pages/faq.html · FR-CS-03
 * 내용은 features/support/faq.ts (서버 API 없음). 탭 [사용자] [업체], 분류별로 접었다 펼침, 검색은 화면에서 거른다.
 * 검색하면 맞는 질문을 모두 펼쳐 바로 답이 보이게 한다.
 */
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FAQ, searchFaq, type FaqTab } from "../features/support/faq";
import { usePageMeta } from "../features/seo/usePageMeta";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { Ico } from "../shared/ui/Ico";
import "../features/support/support.css";

const TABS: { key: FaqTab; label: string }[] = [
  { key: "user", label: "뮤지션" },
  { key: "supplier", label: "업체" },
];

export function FaqPage() {
  usePageMeta("자주 묻는 질문");
  const [params, setParams] = useSearchParams();
  const tab: FaqTab = params.get("tab") === "supplier" ? "supplier" : "user";
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const groups = searchFaq(FAQ[tab], query);
  const searching = query.trim() !== "";

  const selectTab = (key: FaqTab) => setParams(key === "user" ? {} : { tab: key }, { replace: true });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(draft);
  };

  return (
    <>
      <KitPageTop title="자주 묻는 질문" crumbs={[{ label: "고객지원" }]} narrow />
      <div className="tab-bar">
        <div className="container container--narrow">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`faq-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="faq-panel"
                onClick={() => selectTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <main className="container container--narrow main" style={{ paddingTop: 0 }}>
        <div className="faq">
          <form className="faq__search" role="search" onSubmit={submit}>
            <input
              className="input"
              type="search"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (!e.target.value) setQuery("");
              }}
              placeholder="궁금한 내용을 검색해 보세요"
              aria-label="질문 검색"
            />
            <button className="btn" type="submit">
              <Ico name="search" sm />
              검색
            </button>
          </form>

          <section id="faq-panel" role="tabpanel" aria-labelledby={`faq-tab-${tab}`}>
            {groups.length === 0 ? (
              <div className="empty">
                <Ico name="search" />
                <b>'{query.trim()}'에 맞는 질문이 없어요</b>
                <p>다른 말로 찾거나 1:1 문의로 물어봐 주세요.</p>
              </div>
            ) : (
              groups.map((g, gi) => (
                <div key={`${tab}-${g.title}-${query}`}>
                  <h2>{g.title}</h2>
                  <div className="fold">
                    {g.items.map((it, i) => (
                      <details key={it.q} open={searching || (gi === 0 && i === 0)}>
                        <summary>{it.q}</summary>
                        <div>{it.a}</div>
                      </details>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          <div className="faq__more">
            <span>찾는 답이 없나요?</span>
            <Link className="btn btn--sm btn--primary" to="/inquiries/new">
              1:1 문의하기
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
