/**
 * 공고 상세 (/supplier/postings/:stageId, #41). 승인된 업체만. 목업 p-job.html.
 * AC-F3-03: 앞 단계에서 확정된 공간의 입실 시각·기본 장비·전원(techNote)이 보인다.
 * AC-F2-14: 나에게 안 보이는 공고는 서버가 404 → "볼 수 없는 공고". AC-F5-12: 연락처·실명은 보여 주지 않는다.
 * 11/25: 내 단계가 아직 대기면 요청서는 보이고 [견적서 쓰기]는 잠근 채 안내 문구를 붙인다.
 * [견적서 쓰기]는 견적서 작성 화면(다음 PR)으로 이동만 한다.
 */
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../shared/api/client";
import type { PostingDetail, PreviousStage, StageType } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { usePosting } from "../features/quote/api";
import { conditionLabel, conditionValue, hm, servicesLabel, STAGE_NAME, stageTag, tasksLabel, venueTypeLabel } from "../features/quote/labels";
import { Info, isQuotable, needRows, NOT_YET_MSG, orNone, PostingBrief } from "../features/quote/PostingBrief";
import { STAGE_STATUS } from "../features/performance/labels";
import styles from "../features/quote/Quote.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

const LIST_PATH = "/supplier/postings";
const ORDER: StageType[] = ["VENUE", "EQUIPMENT", "ENGINEER"];

/** AC-F3-03: 앞 단계에서 확정된 내용 (확정 견적서 버전의 스냅샷) */
function Prior({ s }: { s: PreviousStage }) {
  const titleId = `prior-${s.stageType}`;
  const what = s.stageType === "VENUE" ? "공간" : STAGE_NAME[s.stageType];
  const snap = s.venueSnapshot;
  const rows: [string, ReactNode][] = [];
  if (snap) {
    const checkin = s.checkinTime ?? snap.checkinTime;
    const setup = s.setupAvailableTime ?? checkin;
    rows.push(
      ["공간", `${snap.name} (${venueTypeLabel(snap.venueType)}, 최대 ${snap.maxCapacity}명)`],
      ["입실 · 설치 가능", <span className="sd-num">{setup === checkin ? hm(checkin) : `입실 ${hm(checkin)} · 설치 ${hm(setup)}`}</span>],
      ["퇴실 마감", <span className="sd-num">{hm(snap.checkoutTime)}</span>],
      ["기본 장비", snap.equipment.length ? snap.equipment.map((e) => `${e.name} ${e.quantity}`).join(" · ") : "없음"],
      [
        "공간 조건",
        Object.keys(snap.conditions).length
          ? Object.entries(snap.conditions).map(([k, v]) => `${conditionLabel(k)} ${conditionValue(v)}`).join(" · ")
          : "적힌 내용 없음",
      ],
      ["상주 엔지니어", snap.hasResidentEngineer ? "있음" : "없음"],
    );
  }
  if (s.items.length) rows.push(["확정 품목", s.items.map((i) => `${i.name} ${i.qty}`).join(" · ")]);
  rows.push([snap ? "전원 · 기술 메모" : "기술 메모", orNone(s.techNote)]);

  return (
    <section className={styles.sec} aria-labelledby={titleId}>
      <div className={styles.prior}>
        <p id={titleId} className={styles.priorHead}>
          앞 단계에서 확정된 {what}
        </p>
        <Info rows={rows} />
      </div>
    </section>
  );
}

/** 뒤 단계 중 필요한 것 (참고). 엔지니어를 포함해 보내면 사용자가 그 단계를 건너뛸 수 있다 (AC-F2-19) */
function laterNeeds(p: PostingDetail): string[] {
  const later = ORDER.slice(ORDER.indexOf(p.stageType) + 1);
  return later.flatMap((t) => {
    if (t === "EQUIPMENT" && p.needs.equipment.needed) return [`장비도 필요해요: ${orNone(servicesLabel(p.needs.equipment.services), "장비 제안")}`];
    if (t === "ENGINEER" && p.needs.engineer.needed) return [`엔지니어도 필요해요: ${orNone(tasksLabel(p.needs.engineer.tasks), "작업 미정")}`];
    return [];
  });
}

function Detail({ p }: { p: PostingDetail }) {
  const needTitle = `${STAGE_NAME[p.stageType]} 요청`;
  const later = laterNeeds(p);
  const quotable = isQuotable(p);
  return (
    <>
      <PageTop title="공고 상세" crumbs={[{ label: "공고 목록", to: LIST_PATH }, { label: "공고 상세" }]} />
      <div className={`sd-container ${styles.wrap}`}>
        <div className={styles.withAside}>
          <div>
            <PostingBrief p={p} />
            {p.previousStages.map((s) => (
              <Prior key={s.stageType} s={s} />
            ))}
            <section className={styles.sec} aria-labelledby="need-title">
              <h2 id="need-title" className={styles.secTitle}>
                {needTitle}
              </h2>
              <Info rows={needRows(p.stageType, p.needs)} />
            </section>
            {later.length > 0 && (
              <section className={styles.sec} aria-labelledby="later-title">
                <h2 id="later-title" className={styles.secTitle}>
                  다음 단계 (참고)
                </h2>
                {later.map((t) => (
                  <p key={t} className={styles.desc}>
                    {t}
                  </p>
                ))}
              </section>
            )}
          </div>
          <aside className={styles.sideBox} aria-label="견적서">
            <div className={`${styles.sideSec} ${styles.sideGray}`}>
              <p className={styles.sideTitle}>
                {stageTag(p)} · {quotable ? STAGE_STATUS[p.status] : "모집 전"}
              </p>
              <p className={styles.desc}>다른 업체 견적서는 보이지 않아요. 뮤지션 연락처는 결제 뒤 최종 담당표에서 공개돼요.</p>
            </div>
            <div className={styles.sideSec}>
              {quotable ? (
                <ButtonLink to={`${LIST_PATH}/${p.stageId}/quote`} variant="primary" block>
                  견적서 쓰기
                </ButtonLink>
              ) : (
                <>
                  <Button variant="primary" block disabled aria-describedby="quote-not-yet">
                    견적서 쓰기
                  </Button>
                  <p id="quote-not-yet" className={styles.desc}>
                    {NOT_YET_MSG}
                  </p>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export function PostingPage() {
  usePageMeta("공고 상세");
  const stageId = Number(useParams().stageId);
  const posting = usePosting(stageId);
  const hidden = posting.error instanceof ApiError && posting.error.status === 404;

  if (posting.data) return <Detail p={posting.data} />;
  return (
    <>
      <PageTop title="공고 상세" crumbs={[{ label: "공고 목록", to: LIST_PATH }, { label: "공고 상세" }]} />
      <div className={`sd-container ${styles.wrap}`}>
        {posting.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {hidden ? (
          <div className={styles.notice} role="status">
            <b>볼 수 없는 공고예요</b>
            <p>마감됐거나 내 부문의 공고가 아니에요.</p>
            <div className={styles.noticeActions}>
              <ButtonLink to={LIST_PATH}>공고 목록으로</ButtonLink>
            </div>
          </div>
        ) : (
          <ErrorNotice error={posting.error} />
        )}
      </div>
    </>
  );
}
