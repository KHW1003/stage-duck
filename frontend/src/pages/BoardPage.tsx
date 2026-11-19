/**
 * 업체 찾기 목록 (/board, #30). 목업 v4 board.html. FR-BOARD-01, AC-F4-04(방문자도 본다)·AC-F4-09(말머리 필터).
 * 조건(말머리·시·도·쪽)은 주소에 둔다 — 링크로 나눠도, 뒤로 가기를 해도 같은 목록이 보인다.
 * 목업의 탭별 글 수·"거래 많은 순"·조회수·거래 건수는 서버가 주지 않아 넣지 않았다.
 */
import { Link, useSearchParams } from "react-router-dom";
import { SIDO } from "../features/request/codes";
import { boardQuery, usePrPosts, type BoardParams } from "../features/board/api";
import { PR_CATEGORIES, PR_CATEGORY_LABEL, isPrCategory, monthDay } from "../features/board/labels";
import type { PrPostItem } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { Button } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Select } from "../shared/ui/Select";
import styles from "../features/board/Board.module.css";

const SIDO_OPTIONS = [{ value: "", label: "전체 지역" }, ...SIDO.map((s) => ({ value: s, label: s }))];

function readParams(qs: URLSearchParams): BoardParams {
  const category = qs.get("category") ?? "";
  const page = Number(qs.get("page"));
  return {
    category: isPrCategory(category) ? category : "",
    sido: qs.get("sido") ?? "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function PostCard({ post }: { post: PrPostItem }) {
  return (
    <Link className={styles.card} to={`/board/${post.id}`}>
      {post.thumbUrl ? (
        <img className={styles.photo} src={post.thumbUrl} alt="" />
      ) : (
        <span className={styles.photo} aria-hidden="true" />
      )}
      <p className={styles.cardMeta}>
        {post.companyName} · {post.sido}
      </p>
      <p className={styles.cardTitle}>
        <span className={styles.prefix}>{PR_CATEGORY_LABEL[post.category]}</span>
        {post.title}
      </p>
      <div className={styles.specs}>
        {post.priceRange && <span>{post.priceRange}</span>}
        <span>{monthDay(post.bumpedAt)} 끌어올림</span>
      </div>
    </Link>
  );
}

export function BoardPage() {
  const [qs, setQs] = useSearchParams();
  const params = readParams(qs);
  const posts = usePrPosts(params);
  const pages = posts.data ? Math.max(1, Math.ceil(posts.data.total / posts.data.size)) : 1;
  const categoryLabel = params.category ? PR_CATEGORY_LABEL[params.category] : "전체";

  function go(next: Partial<BoardParams>) {
    setQs(new URLSearchParams(boardQuery({ ...params, page: 1, ...next })));
  }

  return (
    <>
      <PageTop
        title="업체 찾기"
        crumbs={[{ label: "업체 찾기" }]}
        desc="승인된 업체가 부문마다 글을 하나씩 올려요. 마음에 드는 업체는 저장해 두고, 그 단계가 열리면 견적을 요청해요."
      />
      <div className={styles.tabBar}>
        <div className="sd-container">
          <div className={styles.tabs} role="tablist" aria-label="말머리">
            {[{ value: "" as const, label: "전체" }, ...PR_CATEGORIES].map((c) => (
              <button
                key={c.value || "all"}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={params.category === c.value}
                onClick={() => go({ category: c.value })}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sd-container">
        <div className={styles.bar}>
          <Select size="sm" aria-label="지역" value={params.sido} options={SIDO_OPTIONS} onChange={(sido) => go({ sido })} />
          {posts.data && (
            <p className={styles.count}>
              {params.sido || "전체 지역"} · {categoryLabel} <b className="sd-num">{posts.data.total.toLocaleString()}개</b>
            </p>
          )}
        </div>

        <ErrorNotice error={posts.error} />
        {posts.data && posts.data.items.length === 0 && (
          <div className={styles.empty} role="status">
            <b>이 지역에 올라온 소개 글이 없어요</b>
            <p>지역이나 말머리를 바꿔 보세요.</p>
            <Button onClick={() => go({ sido: "", category: "" })}>전체 지역 보기</Button>
          </div>
        )}
        {posts.data && posts.data.items.length > 0 && (
          <div className={styles.grid}>
            {posts.data.items.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className={styles.pager} aria-label="쪽">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={styles.pageBtn}
                aria-current={n === params.page ? "page" : undefined}
                onClick={() => go({ page: n })}
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
