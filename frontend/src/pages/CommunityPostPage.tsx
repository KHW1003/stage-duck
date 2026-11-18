/**
 * 커뮤니티 글 보기 (/community/:id, #100). 방문자도 본다 (AC-F4-12). 목업 community-post.html 시안 A.
 * - 방문자가 [도움 돼요]·[저장]을 누르면 로그인 화면으로 간다. 회원용 동작과 댓글·신고·공유는 #101 에서 붙인다
 * - 내 글이면 [수정]·[삭제], 블라인드된 내 글이면 사유를 보여 준다
 * - 사진은 지금 서버가 id만 줘서 장수만 보여 준다 (주소는 1번 files 함수가 생기면)
 */
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMe } from "../shared/auth/useMe";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { useDeleteFreePost, useFreePost } from "../features/community/api";
import { ConfirmDelete } from "../features/community/ConfirmDelete";
import { CATEGORY_LABEL, authorLabel, loginPath, longDate } from "../features/community/labels";
import styles from "../features/community/Community.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

export function CommunityPostPage() {
  const id = Number(useParams().id);
  const me = useMe();
  const post = useFreePost(id);
  usePageMeta(post.data && `[${CATEGORY_LABEL[post.data.category]}] ${post.data.title} · STAGE DUCK 커뮤니티`);
  const remove = useDeleteFreePost();
  const navigate = useNavigate();
  const warned = (useLocation().state as { contactWarning?: boolean } | null)?.contactWarning;
  const [asking, setAsking] = useState(false);

  if (post.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (!post.data) return <ErrorNotice error={post.error} />;
  const p = post.data;
  const back = `/community/${p.id}`;

  return (
    <div className={`sd-container ${styles.wrap}`}>
      <article className={styles.narrow}>
        <header className={styles.postHead}>
          <Link to="/community" className={styles.postCat}>
            커뮤니티 · [{CATEGORY_LABEL[p.category]}]
          </Link>
          <h1 className={styles.postTitle}>{p.title}</h1>
          <p className={styles.postMeta}>
            <span>{authorLabel(p.author)}</span>
            <span className="sd-num">{longDate(p.createdAt)}</span>
            <span className="sd-num">조회 {p.viewCount.toLocaleString()}</span>
            <span className="sd-num">댓글 {p.commentCount}</span>
          </p>
        </header>

        {p.status === "BLINDED" && (
          <p className={`${styles.notice} ${styles.warn}`} role="alert">
            이 글은 블라인드돼서 다른 사람에게 보이지 않아요. 사유: {p.blindReason}
          </p>
        )}
        {warned && (
          <p className={`${styles.notice} ${styles.warn}`} role="status">
            글에 전화번호나 계좌번호로 보이는 내용이 있어요. 연락처를 주고받으면 신고될 수 있어요.
          </p>
        )}

        <div className={styles.postBody}>{p.body}</div>
        {p.photoIds.length > 0 && <p className={styles.tbd}>사진 {p.photoIds.length}장 (사진 보기는 곧 열려요)</p>}

        <div className={styles.reacts}>
          {me.data ? (
            <span className={styles.count}>도움 돼요 {p.helpfulCount}</span>
          ) : (
            <>
              <ButtonLink to={loginPath(back)} size="sm" variant="line">
                도움 돼요 {p.helpfulCount}
              </ButtonLink>
              <ButtonLink to={loginPath(back)} size="sm" variant="line">
                저장
              </ButtonLink>
            </>
          )}
          {p.isMine && (
            <span className={styles.mineActions}>
              <ButtonLink to={`/community/${p.id}/edit`} size="sm" variant="ghost">
                수정
              </ButtonLink>
              <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
                삭제
              </Button>
            </span>
          )}
        </div>

        <p className={styles.tbd}>댓글은 곧 열려요 (#101).</p>

        <ul className={styles.near}>
          {p.nextId && (
            <li>
              <span>다음 글</span>
              <Link to={`/community/${p.nextId}`}>다음 글 보기</Link>
            </li>
          )}
          {p.prevId && (
            <li>
              <span>이전 글</span>
              <Link to={`/community/${p.prevId}`}>이전 글 보기</Link>
            </li>
          )}
        </ul>
        <div className={styles.actions}>
          <ButtonLink to="/community" variant="line">
            목록
          </ButtonLink>
        </div>
      </article>

      {asking && (
        <ConfirmDelete
          loading={remove.isPending}
          error={remove.error}
          onCancel={() => setAsking(false)}
          onConfirm={() => remove.mutate(p.id, { onSuccess: () => navigate("/community") })}
        />
      )}
    </div>
  );
}
