/**
 * 약관·정책 (/terms/:type — service · supplier · privacy). 목업: mockup-v4/pages/terms.html · FR-CS-05 · D-49
 * 세 문서를 탭으로 한 화면에. 탭은 주소가 바뀌는 링크라 가입 화면 [보기]·바닥글이 해당 탭을 바로 연다.
 * 내용은 features/support/terms.tsx (시연용 요약본). 버전·시행일을 함께 보인다.
 */
import { Link, Navigate, useParams } from "react-router-dom";
import { TERMS, TERMS_TABS, isTermsType } from "../features/support/terms";
import { usePageMeta } from "../features/seo/usePageMeta";
import { Ico } from "../shared/ui/Ico";
import { TermsDocumentBody } from "../features/support/TermsDocumentBody";

export function TermsPage() {
  const { type } = useParams();
  const tab = TERMS_TABS.find((t) => t.type === type);
  usePageMeta(tab?.label ?? "약관·정책");
  if (!isTermsType(type)) return <Navigate to="/terms/service" replace />;
  const doc = TERMS[type];

  return (
    <div className="tm-page">
      <div className="page-top">
        <div className="container container--narrow page-top__inner">
          <div>
            <ol className="page-top__crumb" aria-label="현재 위치">
              <li>약관·정책</li>
            </ol>
            <h1>약관·정책</h1>
          </div>
        </div>
      </div>
      <div className="tab-bar tm-center-tabs">
        <div className="container container--narrow">
          <nav className="tabs" aria-label="약관 종류">
            {TERMS_TABS.map((t) => (
              <Link key={t.type} to={`/terms/${t.type}`} replace aria-current={t.type === type ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="container container--narrow main" style={{ paddingTop: 0 }}>
        <div className="tm">
          <div className="notice notice--line mt-24">
            <Ico name="info" />
            <div>포트폴리오 시연용 요약본이에요. 실제 서비스 약관이 아니며, STAGE DUCK은 실제 사업자가 아니에요.</div>
          </div>
          <section aria-labelledby="tm-title">
            <div className="tm-head">
              <div>
                <h2 id="tm-title">{doc.title}</h2>
                <p className="tm-meta">
                  시행일 {doc.effective} · 버전 {doc.version}
                </p>
              </div>
              <label className="tm-ver">
                <span className="tm-sr">이전 버전 보기</span>
                <select className="select select--sm" defaultValue="current">
                  <option value="current">{doc.versionLabel}</option>
                </select>
              </label>
            </div>
            <div className="tm-scroll" tabIndex={0} aria-label={`${tab?.label} 전문`} key={type}>
              <TermsDocumentBody doc={doc} />
            </div>
            <div className="tm-below">
              <span>상자 안을 스크롤해서 끝까지 읽을 수 있어요.</span>
              <button type="button" className="btn btn--line btn--sm" onClick={() => window.print()}>
                인쇄하기
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
