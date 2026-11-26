/** 커뮤니티 작성자: 프로필 그림(사진 → 오리 → 첫 글자) + 이름 (11/26 오리 프로필). 목록·글·댓글이 같이 쓴다. */
import type { FreePostSummary } from "../../shared/api/types";
import { ProfileAvatar } from "../../shared/ui/ProfileAvatar";
import { authorLabel } from "./labels";
import styles from "./Community.module.css";

export function Author({
  author,
  big = false,
}: {
  author: FreePostSummary["author"];
  big?: boolean;
}) {
  return (
    <span className={styles.author}>
      <ProfileAvatar
        className={big ? "avatar avatar--sm" : `avatar ${styles.authorPic}`}
        name={author.name}
        src={author.avatarUrl}
        duck={author.duck}
        size={big ? 36 : 26}
      />
      {/* 목록에서는 칸보다 길면 … 로 줄인다 (Community.module.css .writer). title 로 전체 이름 */}
      <span className={styles.authorName} title={authorLabel(author)}>
        {authorLabel(author)}
      </span>
    </span>
  );
}
