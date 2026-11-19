/**
 * 커뮤니티 목록 (/community, #100). 방문자도 본다 (AC-F4-12). 목업 community.html 시안 A 표 목록.
 * 말머리 탭(AC-F4-13)·정렬·검색·쪽 넘기기. 조건은 화면 상태로만 들고, 서버 데이터는 TanStack Query 로 읽는다.
 * 말머리별 글 수·고정 공지 줄은 서버가 주지 않아 넣지 않았다 (공지는 #103).
 */
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../shared/auth/useMe";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { DEFAULT_PARAMS, useFreePosts, type ListParams } from "../features/community/api";
import { CATEGORIES, CATEGORY_LABEL, authorLabel, loginPath, shortDate } from "../features/community/labels";
import styles from "../features/community/Community.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

const SORTS: { value: ListParams["sort"]; label: string }[] = [
  { value: "latest", label: "최신순" },
  { value: "comments", label: "댓글 많은 순" },
  { value: "views", label: "조회순" },
];

export function CommunityPage() {
  const me = useMe();
  const [params, setParams] = useState<ListParams>(DEFAULT_PARAMS);
  const [draft, setDraft] = useState({ field: DEFAULT_PARAMS.field, q: "" });
  const posts = useFreePosts(params);
  usePageMeta("커뮤니티");
  const today = new Date();
  const writeTo = me.data ? "/community/write" : loginPath("/community/write");
  const pages = posts.data ? Math.max(1, Math.ceil(posts.data.total / posts.data.pageSize)) : 1;

  function search(e: FormEvent) {
    e.preventDefault();
    setParams({ ...params, field: draft.field, q: draft.q, page: 1 });
  }

  return (
    <>
      <PageTop
        title="커뮤니티"
        desc="공연을 준비하는 사용자끼리 묻고 나누는 곳이에요. 전화번호·계좌번호는 적지 말아 주세요."
        actions={
          <>
            {me.data && (
              <ButtonLink to="/community/saved" variant="ghost">
                저장한 글
              </ButtonLink>
            )}
            <ButtonLink to={writeTo} variant="primary">
              글쓰기
            </ButtonLink>
          </>
        }
      />
      <div className={`sd-container ${styles.wrap}`}>
        <div className={styles.tabs} role="tablist" aria-label="말머리">
          {[{ value: "", label: "전체" }, ...CATEGORIES].map((c) => (
            <button
              key={c.value || "all"}
              type="button"
              role="tab"
              aria-selected={params.category === c.value}
              className={styles.tab}
              onClick={() => setParams({ ...params, category: c.value, page: 1 })}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className={styles.toolbar}>
          <p className={styles.count}>{posts.data ? `전체 ${posts.data.total.toLocaleString()}개` : ""}</p>
          <div className={styles.sorts}>
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={styles.sortBtn}
                aria-pressed={params.sort === s.value}
                onClick={() => setParams({ ...params, sort: s.value, page: 1 })}
              >
                {s.label}
              </button>
            ))}
          </div>
          <form className={styles.search} role="search" onSubmit={search}>
            <select
              aria-label="검색 범위"
              className={styles.select}
              value={draft.field}
              onChange={(e) => setDraft({ ...draft, field: e.target.value as ListParams["field"] })}
            >
              <option value="all">제목+내용</option>
              <option value="title">제목</option>
              <option value="author">글쓴이</option>
            </select>
            <input
              aria-label="검색어"
              className={styles.searchInput}
              maxLength={50}
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </form>
        </div>

        <ErrorNotice error={posts.error} />
        {posts.data && posts.data.items.length === 0 && (
          <p className={styles.notice} role="status">
            {params.q ? "찾는 글이 없어요. 다른 말로 찾아보세요." : "아직 글이 없어요. 첫 글을 남겨 보세요."}
          </p>
        )}
        {posts.data && posts.data.items.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.num}>번호</th>
                <th className={styles.cat}>말머리</th>
                <th>제목</th>
                <th className={styles.small}>글쓴이</th>
                <th className={styles.small}>날짜</th>
                <th className={styles.num}>조회</th>
              </tr>
            </thead>
            <tbody>
              {posts.data.items.map((p) => (
                <tr key={p.id}>
                  <td className={`${styles.num} sd-num`}>{p.id}</td>
                  <td className={styles.cat}>[{CATEGORY_LABEL[p.category]}]</td>
                  <td>
                    <Link to={`/community/${p.id}`}>{p.title}</Link>
                    {p.commentCount > 0 && <span className={`${styles.commentCount} sd-num`}>[{p.commentCount}]</span>}
                  </td>
                  <td className={styles.small}>{authorLabel(p.author)}</td>
                  <td className={`${styles.small} sd-num`}>{shortDate(p.createdAt, today)}</td>
                  <td className={`${styles.num} sd-num`}>{p.viewCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {pages > 1 && (
          <nav className={styles.pager} aria-label="쪽">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={styles.pageBtn}
                aria-current={n === params.page ? "page" : undefined}
                onClick={() => setParams({ ...params, page: n })}
              >
                {n}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
