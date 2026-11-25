/**
 * 소개 글 (/board/:id, #30). 목업 v4 post.html. FR-BOARD-02, AC-F4-04(방문자도 본다).
 * 연락처는 넣지 않는다 (CLAUDE.md 20) — 서버도 돌려주지 않는다.
 * 업체 이름은 업체 프로필(/suppliers/:id, #33)로 간다. [관심 업체 저장]·[견적 요청하기]는 #32 (말머리 부문의 열린 단계), 조회수·거래 건수·대표 장비·업체 정보 표는 서버가 주지 않아 넣지 않았다.
 * AC-F4-03 (#31): 저장 응답의 contactWarning 이 참이면 안내를 띄운다 (글쓰기 화면이 state 로 넘긴다). [신고]는 로그인한 사람에게만.
 */
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { usePrPost } from "../features/board/api";
import { FavoriteButton, OfferPicker } from "../features/offer/OfferParts";
import { PR_CATEGORY_LABEL, monthDay } from "../features/board/labels";
import { ReportDialog } from "../features/board/ReportDialog";
import { ApiError } from "../shared/api/client";
import type { PrPost } from "../shared/api/types";
import { useMe } from "../shared/auth/useMe";
import { NotFound } from "../shared/layout/NotFound";
import { ErrorNotice } from "../shared/ui/ErrorText";
import styles from "../features/board/Board.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";
import { AdSlot } from "../shared/ui/AdSlot";

function Gallery({ post }: { post: PrPost }) {
  const [current, setCurrent] = useState(0);
  if (post.photos.length === 0) return null;
  const photo = post.photos[Math.min(current, post.photos.length - 1)];
  return (
    <div className={styles.gallery}>
      <div className={styles.mainPhoto}>
        <img className={styles.photo} src={photo.url} alt={`${post.companyName} 소개 사진 ${current + 1}`} />
        {post.photos.length > 1 && (
          <span className={`${styles.photoCount} sd-num`}>
            <b>{current + 1}</b> / {post.photos.length}
          </span>
        )}
      </div>
      {post.photos.length > 1 && (
        <div className={styles.thumbs}>
          {post.photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={styles.thumbBtn}
              aria-label={`사진 ${i + 1}`}
              aria-current={i === current ? "true" : undefined}
              onClick={() => setCurrent(i)}
            >
              <img src={p.thumbUrl} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PostPage() {
  usePageMeta("소개 글");
  const id = Number(useParams().id);
  const post = usePrPost(id);
  const me = useMe();
  const state = useLocation().state as { contactWarning?: boolean } | null;
  const [reporting, setReporting] = useState(false);

  if (!Number.isInteger(id) || (post.error instanceof ApiError && post.error.status === 404)) return <NotFound />;
  if (post.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (post.isError) {
    return (
      <div className={`sd-container ${styles.wrap}`}>
        <ErrorNotice error={post.error} />
      </div>
    );
  }

  const p = post.data;
  const label = PR_CATEGORY_LABEL[p.category];
  return (
    <div className={`sd-container ${styles.wrap} ${styles.detail}`}>
      <ol className={styles.crumb} aria-label="현재 위치">
        <li>
          <Link to="/board">업체 찾기</Link>
        </li>
        <li>
          <Link to={`/board?category=${p.category}`}>{label}</Link>
        </li>
      </ol>
      <div className={styles.withAside}>
        <article className={styles.detailCard}>
          {/* 왼쪽 여백의 세로 광고 (시연용 더미, 여백이 모자라면 숨김). 오른쪽은 업체 칸 아래 네모 광고 */}
          <div className={`${styles.adRail} ${styles.adLeft}`}>
            <AdSlot kind="sky" seed={p.id} className={styles.adSticky} />
          </div>
          <div className={styles.postHead}>
            <h1>
              <span className={styles.prefix}>{label}</span>
              {p.title}
            </h1>
            <div className={styles.meta}>
              <span>
                <Link to={`/suppliers/${p.supplierId}`}>{p.companyName}</Link>
              </span>
              <span>{p.sido}</span>
              {p.priceRange && <span>{p.priceRange}</span>}
              <span>{monthDay(p.bumpedAt)} 끌어올림</span>
              {me.data && (
                <span>
                  <button className="link" type="button" onClick={() => setReporting(true)}>
                    신고
                  </button>
                </span>
              )}
            </div>
          </div>
          {state?.contactWarning && (
            <div className="notice notice--warn mb-16" role="status">
              <p>외부 연락처로 보이는 글자가 있어요. 전화번호·계좌번호·외부 링크는 쓸 수 없어요. 신고되면 블라인드되고 경고가 기록돼요.</p>
            </div>
          )}
          <Gallery post={p} />
          <div className={styles.postBody}>{p.body}</div>
        </article>
        <div className={styles.sideCol}>
        <aside className={styles.side} aria-label="업체">
          <div className={styles.sideSec}>
            <div className={styles.who}>
              <span
                className={styles.avatar}
                aria-hidden="true"
                style={p.supplierImageUrl ? { backgroundImage: `url('${p.supplierImageUrl}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
              >
                {p.supplierImageUrl ? null : p.companyName.replace(/^업체\s*/, "").slice(0, 1)}
              </span>
              <div>
                <b>
                  <Link to={`/suppliers/${p.supplierId}`}>{p.companyName}</Link>
                </b>
                <small>{label.slice(1, -1)} · {p.sido}</small>
              </div>
            </div>
            <FavoriteButton supplierId={p.supplierId} next={`/board/${p.id}`} className="btn btn--sm btn--block mt-12" />
          </div>
          <div className={styles.sideSec} aria-label="견적 요청하기" role="group">
            <p className={styles.sideTitle}>이 업체에 견적 요청하기</p>
            <OfferPicker supplierId={p.supplierId} companyName={p.companyName} stageTypes={[p.category]} next={`/board/${p.id}`} />
          </div>
          <div className={`${styles.sideSec} ${styles.sideGray}`}>
            <p>게시글에는 전화번호·계좌번호·외부 링크를 쓸 수 없어요. 연락처는 결제 뒤 최종 담당표에서 공개돼요.</p>
          </div>
        </aside>
          <AdSlot kind="rect" seed={p.id + 2} className={styles.sideAd} />
        </div>
      </div>
      {reporting && <ReportDialog postId={p.id} onClose={() => setReporting(false)} />}
    </div>
  );
}
