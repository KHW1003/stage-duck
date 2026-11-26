/** 내가 저장한 커뮤니티 글 (/community/saved, #101, AC-F4-17 "저장 글 모아 보기"). 사용자·업체만 */
import { Link } from "react-router-dom";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { useMyBookmarks } from "../features/community/api";
import { Author } from "../features/community/Author";
import { CATEGORY_LABEL, shortDate } from "../features/community/labels";
import styles from "../features/community/Community.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

export function CommunitySavedPage() {
  usePageMeta("저장한 글");
  const saved = useMyBookmarks();
  const today = new Date();

  return (
    <>
      <PageTop title="저장한 글" crumbs={[{ label: "커뮤니티", to: "/community" }, { label: "저장한 글" }]} />
      <div className={`sd-container ${styles.wrap}`}>
        <div className={styles.narrow}>
          {saved.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
          <ErrorNotice error={saved.error} />
          {saved.data && saved.data.items.length === 0 && (
            <div className={styles.notice} role="status">
              아직 저장한 글이 없어요. 글 보기에서 [저장]을 누르면 여기에 모여요.
              <div className={styles.actions}>
                <ButtonLink to="/community" variant="line">
                  커뮤니티 보기
                </ButtonLink>
              </div>
            </div>
          )}
          {saved.data && saved.data.items.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.cat}>말머리</th>
                  <th>제목</th>
                  <th className={styles.writer}>글쓴이</th>
                  <th className={styles.date}>날짜</th>
                </tr>
              </thead>
              <tbody>
                {saved.data.items.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.cat}>[{CATEGORY_LABEL[p.category]}]</td>
                    <td>
                      <Link to={`/community/${p.id}`}>{p.title}</Link>
                    </td>
                    <td className={styles.writer}>
                      <Author author={p.author} />
                    </td>
                    <td className={`${styles.date} sd-num`}>{shortDate(p.createdAt, today)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
