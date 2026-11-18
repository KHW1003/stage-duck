/**
 * 내 공연 상세 (/performances/:id, #40). 목업 performance.html — 기본 정보 + 섭외 진행 + 다음 할 일 + [요청서 수정]·[공고 내리기].
 * 다음 할 일이 OPEN_NEXT 면 [다음 단계로] 패널(목업 next.html)이 붙는다 (AC-F3-02·04).
 * 단계별 견적서 비교·최종 견적 남은 시간은 3·4번 API가 나온 뒤 붙인다 (내용 미정).
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { usePerformance, useWithdraw } from "../features/performance/api";
import { ConfirmModal } from "../features/performance/ConfirmModal";
import { dateLabel, hm, nextActionText } from "../features/performance/labels";
import { NextStagePanel } from "../features/performance/NextStagePanel";
import { StageTrack } from "../features/performance/StageTrack";
import styles from "../features/performance/Performance.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

const EDITABLE = ["DRAFT", "PUBLISHED", "ASSIGNING", "AWAITING_PAYMENT"];
const POSTED = ["PUBLISHED", "ASSIGNING"];

export function PerformancePage() {
  const id = Number(useParams().id);
  const perf = usePerformance(id);
  usePageMeta(perf.data?.title);
  const withdraw = useWithdraw();
  const [askWithdraw, setAskWithdraw] = useState(false);

  if (perf.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (!perf.data) return <ErrorNotice error={perf.error} />;
  const p = perf.data;
  const stage = p.stages.find((s) => s.id === p.nextStageId);

  return (
    <>
      <PageTop
        title={p.title}
        desc={`${dateLabel(p.showDate)} 공연 ${hm(p.showStart)}~${hm(p.showEnd)} · 리허설 ${hm(p.rehearsalStart)} · ${p.sido} ${p.sigungu} · 관객 ${p.audience}명 · 요청서 v${p.currentVersion}`}
        crumbs={[{ label: "내 공연", to: "/me/performances" }, { label: p.title }]}
        actions={
          <>
            {EDITABLE.includes(p.status) && (
              <ButtonLink to={`/performances/${p.id}/edit`} size="sm">
                요청서 수정
              </ButtonLink>
            )}
            {POSTED.includes(p.status) && (
              <Button size="sm" variant="ghost" onClick={() => setAskWithdraw(true)}>
                공고 내리기
              </Button>
            )}
          </>
        }
      />
      <div className={`sd-container ${styles.wrap}`}>
        <section aria-label="섭외 진행">
          <StageTrack stages={p.stages} />
          <div className={`${styles.notice} ${styles.trackNotice}`} role="status">
            {nextActionText(p.nextAction, stage)}
            {p.nextAction === "OPEN_NEXT" && <NextStagePanel performance={p} />}
            {p.nextAction === "PAY" && (
              <div className={styles.noticeActions}>
                <ButtonLink to={`/performances/${p.id}/order`} variant="primary">
                  통합 결제하기
                </ButtonLink>
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>단계별 견적서</h2>
          <p className={styles.tbd}>내용 미정 — 받은 견적서·최종 견적·비교는 견적서·비교 화면(#41·#48)이 나오면 여기에 붙어요.</p>
        </section>
      </div>

      {askWithdraw && (
        <ConfirmModal
          title="공고를 내릴까요?"
          confirmLabel="내리기"
          danger
          loading={withdraw.isPending}
          error={withdraw.error}
          onCancel={() => setAskWithdraw(false)}
          onConfirm={() => withdraw.mutate(p.id, { onSuccess: () => setAskWithdraw(false) })}
        >
          <p>내리면 업체에게 공고가 더 이상 보이지 않아요. 채팅 중인 업체가 있으면 반려로 셀 수 있어요.</p>
        </ConfirmModal>
      )}
    </>
  );
}
