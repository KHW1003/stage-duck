/**
 * 공고 상세 (/supplier/postings/:stageId, #41). 승인된 업체만. 목업 p-job.html.
 * AC-F3-03: 앞 단계에서 확정된 공간의 입실 시각·기본 장비·전원(techNote)이 보인다.
 * AC-F2-14: 나에게 안 보이는 공고는 서버가 404 → "볼 수 없는 공고". AC-F5-12: 연락처·실명은 보여 주지 않는다.
 * [견적서 쓰기]는 견적서 작성 화면(다음 PR)으로 이동만 한다.
 */
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ApiError } from "../shared/api/client";
import type { PerformanceNeeds, PostingDetail, PreviousStage, StageType } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { MoneyText } from "../shared/ui/MoneyText";
import { usePosting } from "../features/quote/api";
import {
  conditionLabel,
  conditionValue,
  dateLabel,
  formLabel,
  hm,
  nicknameOf,
  optionLabel,
  servicesLabel,
  STAGE_NAME,
  stageTag,
  tasksLabel,
  userCounts,
  venueTypeLabel,
} from "../features/quote/labels";
import { STAGE_STATUS } from "../features/performance/labels";
import { CONDITIONS, MUST_HAVE, VENUE_TYPES } from "../features/request/codes";
import styles from "../features/quote/Quote.module.css";

const LIST_PATH = "/supplier/postings";
const ORDER: StageType[] = ["VENUE", "EQUIPMENT", "ENGINEER"];

/** 이름 / 값 표 한 덩어리 */
function Info({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={styles.info}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.infoRow}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const orNone = (s: string | null | undefined, none = "적힌 내용 없음") => (s && s.trim() ? s : none);
const money = (v: number | null) => (v === null ? "정하지 않음" : <MoneyText value={v} />);

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

/** 이 단계의 요청 내용 (요청서 STEP2) */
function needRows(type: StageType, needs: PerformanceNeeds): [string, ReactNode][] {
  if (type === "VENUE") {
    const n = needs.venue;
    return [
      ["원하는 공간", n.proposalWanted ? "업체 제안 받기" : orNone(n.types.map((t) => optionLabel(VENUE_TYPES, t)).join(" · "), "정하지 않음")],
      ["수용 인원", n.capacity === null ? "정하지 않음" : `${n.capacity}명`],
      ["희망 입실 · 퇴실", `${n.checkinWish ? hm(n.checkinWish) : "-"} ~ ${n.checkoutWish ? hm(n.checkoutWish) : "-"}`],
      ["꼭 필요한 조건", orNone(n.mustHave.map((m) => optionLabel(MUST_HAVE, m)).join(" · "), "없음")],
      ["공간 예산", money(n.budget)],
      ["메모", orNone(n.note)],
    ];
  }
  if (type === "EQUIPMENT") {
    const n = needs.equipment;
    const items = n.items.map((i) => `${i.name} ${i.qty}`).join(" · ");
    return [
      ["원하는 장비", n.proposalWanted ? `업체 제안 받기${items ? ` (적은 장비: ${items})` : ""}` : orNone(items, "없음")],
      ["필요한 서비스", orNone(servicesLabel(n.services), "없음")],
      ["장비 예산", money(n.budget)],
      ["가지고 있는 장비", orNone(n.owned.map((o) => (o.detail ? `${o.name} (${o.detail})` : o.name)).join(" · "), "없음")],
      ["메모", orNone(n.note)],
    ];
  }
  const n = needs.engineer;
  return [
    ["맡길 작업", orNone(tasksLabel(n.tasks), "없음")],
    ["원하는 조건", orNone(n.conditions.map((c) => optionLabel(CONDITIONS, c)).join(" · "), "없음")],
    ["기타", orNone(n.etc)],
    ["메모", orNone(n.note)],
  ];
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
  return (
    <>
      <PageTop
        title={p.title}
        crumbs={[{ label: "공고 목록", to: LIST_PATH }, { label: "공고 상세" }]}
        desc={
          <>
            <span className="sd-num">
              {stageTag(p)} · {dateLabel(p.showDate)} · 리허설 {hm(p.rehearsalStart)} · 공연 {hm(p.showStart)}~{hm(p.showEnd)} · {p.sido}{" "}
              {p.sigungu} · {formLabel(p.form)} · 관객 {p.audience}명 · 요청서 v{p.performanceVersion}
            </span>
            <br />
            <span className="sd-num">
              {nicknameOf(p)} · {userCounts(p)}
            </span>
          </>
        }
      />
      <div className={`sd-container ${styles.wrap}`}>
        <div className={styles.withAside}>
          <div>
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
                {stageTag(p)} · {STAGE_STATUS[p.status]}
              </p>
              <p className={styles.desc}>다른 업체 견적서는 보이지 않아요. 사용자 연락처는 결제 뒤 최종 담당표에서 공개돼요.</p>
            </div>
            <div className={styles.sideSec}>
              <ButtonLink to={`${LIST_PATH}/${p.stageId}/quote`} variant="primary" block>
                견적서 쓰기
              </ButtonLink>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export function PostingPage() {
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
            <p>마감됐거나, 내 부문·지역의 공고가 아니거나, 아직 내 단계가 열리지 않았어요.</p>
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
