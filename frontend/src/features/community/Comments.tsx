/**
 * 커뮤니티 댓글·답글 (#101, AC-F4-14·17, FR-COMM-03). 목업 community-post.html 댓글 부분.
 * - 답글은 한 단계: 댓글에만 [답글]이 있고, 답글에는 없다 (서버도 400)
 * - 삭제·블라인드는 자리만 남긴다. 블라인드된 내 댓글은 본문·사유를 나만 본다
 * - 방문자는 댓글을 읽기만 하고, 쓰기·도움 돼요는 로그인으로 보낸다 (AC-F4-12)
 */
import { useState, type FormEvent } from "react";
import type { FreeComment, FreePost } from "../../shared/api/types";
import { Button, ButtonLink } from "../../shared/ui/Button";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { useAddComment, useDeleteComment, useHelpful } from "./api";
import { authorLabel, loginPath, longDate } from "./labels";
import { ConfirmDelete } from "./ConfirmDelete";
import { ReportModal } from "./ReportModal";
import styles from "./Community.module.css";

const COMMENT_MAX = 500;

function Form({ postId, parentId, onDone }: { postId: number; parentId: number | null; onDone?: () => void }) {
  const add = useAddComment(postId);
  const [body, setBody] = useState("");
  const [warned, setWarned] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    add.mutate(
      { body: body.trim(), parentId },
      {
        onSuccess: (saved) => {
          setBody("");
          setWarned(saved.contactWarning);
          onDone?.();
        },
      },
    );
  }

  return (
    <form className={styles.commentForm} onSubmit={submit}>
      <label className="sd-sr-only" htmlFor={`cf-${parentId ?? "top"}`}>
        {parentId ? "답글" : "댓글"}
      </label>
      <textarea
        id={`cf-${parentId ?? "top"}`}
        className={styles.commentInput}
        maxLength={COMMENT_MAX}
        placeholder={parentId ? "답글을 적어 주세요" : "댓글을 적어 주세요. 전화번호·계좌번호는 적지 말아 주세요."}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.commentFormBar}>
        <span className={`${styles.count} sd-num`}>
          {body.length} / {COMMENT_MAX}
        </span>
        <Button type="submit" size="sm" variant="primary" loading={add.isPending} disabled={!body.trim()}>
          등록
        </Button>
      </div>
      <ErrorNotice error={add.error} />
      {warned && <p className={`${styles.notice} ${styles.warn}`}>댓글에 전화번호나 계좌번호로 보이는 내용이 있어요. 연락처를 주고받으면 신고될 수 있어요.</p>}
    </form>
  );
}

function Item({ c, post, member, reply }: { c: FreeComment; post: FreePost; member: boolean; reply: boolean }) {
  const helpful = useHelpful();
  const remove = useDeleteComment();
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const back = `/community/${post.id}`;
  const text =
    c.body ?? (c.status === "DELETED" ? "삭제된 댓글이에요." : "블라인드된 댓글이에요.");

  return (
    <li className={reply ? styles.reply : styles.comment}>
      <p className={styles.commentHead}>
        <b>{authorLabel(c.author)}</b>
        {c.isPostAuthor && <span className={styles.badge}>글쓴이</span>}
        <span className={`${styles.count} sd-num`}>{longDate(c.createdAt)}</span>
      </p>
      <p className={c.body ? styles.commentBody : styles.commentGone}>{text}</p>
      {c.status === "BLINDED" && c.isMine && <p className={styles.fieldError}>블라인드된 댓글이에요. 사유: {c.blindReason}</p>}

      {c.status === "ACTIVE" && (
        <div className={styles.commentActions}>
          {!reply && member && (
            <Button size="sm" variant="ghost" onClick={() => setReplying((v) => !v)}>
              답글
            </Button>
          )}
          {member ? (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={c.myHelpful}
              loading={helpful.isPending}
              onClick={() => helpful.mutate({ targetType: "COMMENT", targetId: c.id, on: !c.myHelpful })}
            >
              도움 돼요 {c.helpfulCount}
            </Button>
          ) : (
            <ButtonLink to={loginPath(back)} size="sm" variant="ghost">
              도움 돼요 {c.helpfulCount}
            </ButtonLink>
          )}
          {c.isMine && (
            <Button size="sm" variant="ghost" onClick={() => setAskDelete(true)}>
              삭제
            </Button>
          )}
          {member && !c.isMine && (
            <Button size="sm" variant="ghost" onClick={() => setReporting(true)}>
              신고
            </Button>
          )}
        </div>
      )}
      <ErrorNotice error={helpful.error} />
      {askDelete && (
        <ConfirmDelete
          title={reply ? "답글을 지울까요?" : "댓글을 지울까요?"}
          desc={'지운 자리에는 "삭제된 댓글이에요."만 남아요.'}
          loading={remove.isPending}
          error={remove.error}
          onCancel={() => setAskDelete(false)}
          onConfirm={() => remove.mutate(c.id, { onSuccess: () => setAskDelete(false) })}
        />
      )}

      {replying && <Form postId={post.id} parentId={c.id} onDone={() => setReplying(false)} />}
      {c.replies.length > 0 && (
        <ul className={styles.replies}>
          {c.replies.map((r) => (
            <Item key={r.id} c={r} post={post} member={member} reply />
          ))}
        </ul>
      )}
      {reporting && <ReportModal targetType="FREE_COMMENT" targetId={c.id} onClose={() => setReporting(false)} />}
    </li>
  );
}

export function Comments({ post, member }: { post: FreePost; member: boolean }) {
  return (
    <section className={styles.comments} aria-labelledby="comments-title">
      <h2 id="comments-title" className={styles.commentsTitle}>
        댓글 <span className="sd-num">{post.commentCount}</span>
      </h2>
      {post.comments.length > 0 && (
        <ul className={styles.commentList}>
          {post.comments.map((c) => (
            <Item key={c.id} c={c} post={post} member={member} reply={false} />
          ))}
        </ul>
      )}
      {member ? (
        <Form postId={post.id} parentId={null} />
      ) : (
        <ButtonLink to={loginPath(`/community/${post.id}`)} variant="line">
          로그인하고 댓글 쓰기
        </ButtonLink>
      )}
    </section>
  );
}
