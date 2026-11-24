/**
 * 공지사항 목록 (/notices) · 글 보기 (/notices/:id). 목업: mockup-v4/pages/notices.html · FR-CS-02 · AC-F5-21
 * 관리자가 SQLAdmin 에서 쓴다. 고정 글이 맨 위 (서버가 정렬). 누구나 본다.
 */
import { Link, useParams, useSearchParams } from "react-router-dom";
import { NOTICE_CATEGORY, bodyBlocks, longDate, shortDate, useNotice, useNotices } from "../features/support/api";
import { usePageMeta } from "../features/seo/usePageMeta";
import { ApiError } from "../shared/api/client";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { Ico } from "../shared/ui/Ico";
import "../features/support/support.css";

const CRUMB = { label: "고객지원" };

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <nav className="pagination" aria-label="쪽">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) =>
        p === page ? (
          <span key={p} aria-current="page">
            {p}
          </span>
        ) : (
          <a
            key={p}
            href={`?page=${p}`}
            onClick={(e) => {
              e.preventDefault();
              onPage(p);
            }}
          >
            {p}
          </a>
        ),
      )}
    </nav>
  );
}

export function NoticeListPage() {
  usePageMeta("공지사항");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const { data, isPending, isError } = useNotices(page);
  const goPage = (p: number) => {
    setParams(p > 1 ? { page: String(p) } : {});
    document.scrollingElement?.scrollTo?.({ top: 0 });
  };

  return (
    <>
      <KitPageTop title="공지사항" crumbs={[CRUMB]} narrow />
      <main className="container container--narrow main">
        {isPending ? (
          <p className="field__hint">공지를 불러오는 중이에요.</p>
        ) : isError ? (
          <div className="empty">
            <Ico name="warn" />
            <b>공지를 불러오지 못했어요</b>
            <p>잠시 뒤 다시 열어 주세요.</p>
          </div>
        ) : data.items.length === 0 ? (
          <div className="empty">
            <Ico name="bell" />
            <b>아직 공지가 없어요</b>
          </div>
        ) : (
          <>
            <div className="table-box">
              <table className="table nt-table">
                <thead>
                  <tr>
                    <th>분류</th>
                    <th>제목</th>
                    <th>게시일</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((n) => (
                    <tr key={n.id} className={n.isPinned ? "is-pin" : undefined}>
                      <td>{n.isPinned ? <span className="tag tag--fill">고정</span> : <span className="tag">{NOTICE_CATEGORY[n.category]}</span>}</td>
                      <td className="l">
                        <Link to={`/notices/${n.id}`}>{n.isPinned ? <b>{n.title}</b> : n.title}</Link>
                      </td>
                      <td>{shortDate(n.publishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onPage={goPage} />
          </>
        )}
      </main>
    </>
  );
}

export function NoticeDetailPage() {
  const id = Number(useParams().id);
  const { data, isPending, error } = useNotice(id);
  usePageMeta(data ? `${data.title} · STAGE DUCK 공지` : "공지사항");
  const crumbs = [CRUMB, { label: "공지사항", to: "/notices" }];

  if (isPending || !data) {
    const missing = !Number.isInteger(id) || (error instanceof ApiError && error.status === 404);
    return (
      <>
        <KitPageTop title={missing ? "공지를 찾을 수 없어요" : "공지사항"} crumbs={crumbs} narrow />
        <main className="container container--narrow main">
          {missing ? (
            <div className="empty">
              <Ico name="search" />
              <b>지워졌거나 없는 공지예요</b>
              <Link className="btn btn--sm" to="/notices">
                목록
              </Link>
            </div>
          ) : error ? (
            <div className="empty">
              <Ico name="warn" />
              <b>공지를 불러오지 못했어요</b>
              <p>잠시 뒤 다시 열어 주세요.</p>
            </div>
          ) : (
            <p className="field__hint">공지를 불러오는 중이에요.</p>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <div className="page-top">
        <div className="container container--narrow page-top__inner">
          <div>
            <ol className="page-top__crumb" aria-label="현재 위치">
              <li>고객지원</li>
              <li>
                <Link to="/notices">공지사항</Link>
              </li>
            </ol>
          </div>
        </div>
      </div>
      <main className="container container--narrow main">
        <article className="nt-view">
          <span className="tag">{NOTICE_CATEGORY[data.category]}</span>
          <h1>{data.title}</h1>
          <p className="nt-view__meta">운영팀 · {longDate(data.publishedAt)}</p>
          <div className="nt-view__body">
            {bodyBlocks(data.body).map((b, i) =>
              b.kind === "p" ? (
                <p key={i}>{b.text}</p>
              ) : (
                <ul key={i}>
                  {b.items.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              ),
            )}
          </div>
          {(data.prev || data.next) && (
            <nav className="nt-nav" aria-label="이전·다음 글">
              {data.prev && (
                <Link to={`/notices/${data.prev.id}`}>
                  <span>이전 글</span>
                  <span>{data.prev.title}</span>
                  <small>{shortDate(data.prev.publishedAt)}</small>
                </Link>
              )}
              {data.next && (
                <Link to={`/notices/${data.next.id}`}>
                  <span>다음 글</span>
                  <span>{data.next.title}</span>
                  <small>{shortDate(data.next.publishedAt)}</small>
                </Link>
              )}
            </nav>
          )}
          <div className="btns btns--center mt-24">
            <Link className="btn" to="/notices">
              목록
            </Link>
          </div>
        </article>
      </main>
    </>
  );
}
