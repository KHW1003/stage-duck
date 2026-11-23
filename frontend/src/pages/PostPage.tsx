/**
 * 소개 글 (/board/:id, #30). 목업 v4 post.html. FR-BOARD-02, AC-F4-04(방문자도 본다).
 * 연락처는 넣지 않는다 (CLAUDE.md 20) — 서버도 돌려주지 않는다.
 * 업체 이름은 업체 프로필(/suppliers/:id, #33)로 간다. [관심 업체 저장]·[견적 요청하기]는 #32 (말머리 부문의 열린 단계), 신고는 #31, 조회수·거래 건수·대표 장비·업체 정보 표는 서버가 주지 않아 넣지 않았다.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePrPost } from "../features/board/api";
import { FavoriteButton, OfferPicker } from "../features/offer/OfferParts";
import { PR_CATEGORY_LABEL, monthDay } from "../features/board/labels";
import { ApiError } from "../shared/api/client";
import type { PrPost } from "../shared/api/types";
import { NotFound } from "../shared/layout/NotFound";
import { ErrorNotice } from "../shared/ui/ErrorText";
import styles from "../features/board/Board.module.css";

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
  const id = Number(useParams().id);
  const post = usePrPost(id);

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
    <div className={`sd-container ${styles.wrap}`}>
      <ol className={styles.crumb} aria-label="현재 위치">
        <li>
          <Link to="/board">업체 찾기</Link>
        </li>
        <li>
          <Link to={`/board?category=${p.category}`}>{label}</Link>
        </li>
      </ol>
      <div className={styles.withAside}>
        <article>
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
            </div>
          </div>
          <Gallery post={p} />
          <div className={styles.postBody}>{p.body}</div>
        </article>
        <aside className={styles.side} aria-label="업체">
          <div className={styles.sideSec}>
            <div className={styles.who}>
              <span className={styles.avatar} aria-hidden="true">
                {p.companyName.replace(/^업체\s*/, "").slice(0, 1)}
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
      </div>
    </div>
  );
}
