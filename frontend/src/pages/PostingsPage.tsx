/**
 * 공고 목록 (/supplier/postings, #41). 승인된 업체만. 목업 p-jobs.html 의 "공고" 탭.
 * AC-F2-11·12: 서버가 내 부문 × 지금 열린 단계 공고만 준다 (심사 중·정지면 빈 목록). 화면은 거르지 않는다.
 * AC-F4-07: 사용자 닉네임 옆에 이용·반려 횟수. AC-F5-12: 연락처·실명은 보여 주지 않는다.
 */
import { useSearchParams } from "react-router-dom";
import type { PostingSummary } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Select } from "../shared/ui/Select";
import { SIDO } from "../features/request/codes";
import { usePostings } from "../features/quote/api";
import { dateLabel, nicknameOf, stageTag, userCounts } from "../features/quote/labels";
import styles from "../features/quote/Quote.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

const SIDO_OPTIONS = [{ value: "", label: "전체 지역" }, ...SIDO.map((s) => ({ value: s, label: s }))];

function Row({ p }: { p: PostingSummary }) {
  return (
    <tr>
      <td className="sd-num">
        <b>{dateLabel(p.showDate)}</b>
      </td>
      <td>
        <span className={styles.title}>{p.title}</span>
        <span className={styles.tag}>{stageTag(p)}</span>
        <small>
          {p.sido} {p.sigungu}
        </small>
      </td>
      <td>
        <span>{nicknameOf(p)}</span>
        <small className="sd-num">{userCounts(p)}</small>
      </td>
      <td className={styles.actionCell}>
        <ButtonLink to={`/supplier/postings/${p.stageId}`} size="sm" variant="primary">
          상세
        </ButtonLink>
      </td>
    </tr>
  );
}

export function PostingsPage() {
  usePageMeta("공고 목록");
  const [qs, setQs] = useSearchParams();
  const sido = qs.get("sido") ?? "";
  const postings = usePostings(sido);

  const changeSido = (v: string) => setQs(v ? { sido: v } : {}, { replace: true });

  return (
    <>
      <PageTop title="공고 목록" desc="내 부문에서 지금 업체를 찾고 있는 공고예요. 공연일이 가까운 순으로 보여요." />
      <div className={`sd-container ${styles.wrap}`}>
        <div className={styles.toolbar}>
          <Select size="sm" aria-label="지역" value={sido} options={SIDO_OPTIONS} onChange={changeSido} />
        </div>
        {postings.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        <ErrorNotice error={postings.error} />
        {postings.data && postings.data.length === 0 && (
          <div className={styles.notice} role="status">
            <b>지금 볼 수 있는 공고가 없어요</b>
            <p>앞 단계가 확정돼 내 부문의 단계가 열리면 공고가 보여요.</p>
          </div>
        )}
        {postings.data && postings.data.length > 0 && (
          <div className={styles.tableBox}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">공연 날짜</th>
                  <th scope="col">공고</th>
                  <th scope="col">사용자</th>
                  <th scope="col">
                    <span className="sd-sr-only">상세 보기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {postings.data.map((p) => (
                  <Row key={p.stageId} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul className={styles.bullets}>
          <li>앞 단계가 아직 확정되지 않은 공고는 보이지 않아요. 단계가 열리면 알림이 가요.</li>
          <li>심사 중이거나 정지된 업체는 공고를 볼 수 없어요.</li>
          <li>사용자 연락처는 결제 뒤 최종 담당표에서 공개돼요.</li>
        </ul>
      </div>
    </>
  );
}
