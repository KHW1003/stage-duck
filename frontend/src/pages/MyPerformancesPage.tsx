/**
 * 내 공연 (/me/performances, #40). 사용자 역할만. 목업 my.html — 공연마다 기본 정보 + 섭외 진행 + 다음 할 일.
 * AC-F5-02: "공연장 확정 → 장비 조율 중 (견적 2건) → 엔지니어 대기"처럼 단계와 다음 할 일이 보인다.
 */
import type { PerformanceSummary } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { useMyPerformances } from "../features/performance/api";
import { dateLabel, hm, nextActionText } from "../features/performance/labels";
import { StageTrack } from "../features/performance/StageTrack";
import styles from "../features/performance/Performance.module.css";

function Item({ p }: { p: PerformanceSummary }) {
  const stage = p.stages.find((s) => s.id === p.nextStageId);
  const titleId = `perf-${p.id}-title`;
  return (
    <article className={styles.item} aria-labelledby={titleId}>
      <div className={styles.itemHead}>
        <div>
          <h3 id={titleId} className={styles.itemTitle}>
            {p.title}
          </h3>
          <p className={`${styles.meta} sd-num`}>
            {dateLabel(p.showDate)} 공연 {hm(p.showStart)}~{hm(p.showEnd)} · 리허설 {hm(p.rehearsalStart)} · {p.sido} {p.sigungu} · 관객 {p.audience}명
          </p>
        </div>
        <ButtonLink to={p.status === "DRAFT" ? `/performances/${p.id}/edit` : `/performances/${p.id}`} size="sm">
          {p.status === "DRAFT" ? "이어서 쓰기" : "공연 보기"}
        </ButtonLink>
      </div>
      <StageTrack stages={p.stages} />
      <p className={styles.notice}>{nextActionText(p.nextAction, stage)}</p>
    </article>
  );
}

function Group({ title, desc, items }: { title: string; desc?: string; items: PerformanceSummary[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>
        {title} <span className="sd-num">{items.length}</span>
        {desc && <small>{desc}</small>}
      </h2>
      {items.map((p) => (
        <Item key={p.id} p={p} />
      ))}
    </section>
  );
}

export function MyPerformancesPage() {
  const mine = useMyPerformances();
  const empty = mine.data && mine.data.active.length + mine.data.draft.length + mine.data.past.length === 0;

  return (
    <>
      <PageTop
        title="내 공연"
        desc="공연마다 섭외가 어디까지 왔는지와 지금 할 일을 확인하세요."
        actions={
          <ButtonLink to="/performances/new" variant="primary">
            요청서 쓰기
          </ButtonLink>
        }
      />
      <div className={`sd-container ${styles.wrap}`}>
        {mine.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        <ErrorNotice error={mine.error} />
        {empty && (
          <div className={styles.notice} role="status">
            <b>아직 준비 중인 공연이 없어요</b>
            <p>요청서를 쓰면 공연장부터 차례로 업체 견적서를 받을 수 있어요.</p>
            <div className={styles.noticeActions}>
              <ButtonLink to="/performances/new" variant="primary">
                요청서 쓰기
              </ButtonLink>
            </div>
          </div>
        )}
        {mine.data && (
          <>
            <Group title="진행 중" items={mine.data.active} />
            <Group title="작성 중" desc="보내지 않은 요청서예요." items={mine.data.draft} />
            <Group title="지난 공연" items={mine.data.past} />
          </>
        )}
      </div>
    </>
  );
}
