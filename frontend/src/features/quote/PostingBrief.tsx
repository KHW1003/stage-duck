/**
 * 요청서 기본 정보 카드 (11/25 해원: 견적서 쓸 때 요청서 기본 정보를 크고 한눈에).
 * 공고 상세·견적서 쓰기 화면이 같이 쓴다. 연락처·실명은 넣지 않는다 (AC-F5-12).
 * 내 단계가 아직 대기(WAITING)면 "모집 전" 표시와 안내 문구를 함께 보여 준다.
 */
import type { ReactNode } from "react";
import type { PerformanceNeeds, PostingDetail, PostingSummary, StageType } from "../../shared/api/types";
import { MoneyText } from "../../shared/ui/MoneyText";
import { CONDITIONS, MUST_HAVE, VENUE_TYPES } from "../request/codes";
import { STAGE_STATUS } from "../performance/labels";
import { dateLabel, formLabel, hm, nicknameOf, optionLabel, servicesLabel, STAGE_NAME, stageTag, tasksLabel, userCounts } from "./labels";
import styles from "./Quote.module.css";

/** 지금 견적서를 보낼 수 있는 단계인가 (모집·조율 중). 대기 단계는 요청서만 읽는다 */
export const isQuotable = (p: Pick<PostingSummary, "status">) => p.status === "OPEN" || p.status === "NEGOTIATING";

/** 견적서를 아직 못 보내는 이유 (대기 단계) */
export const NOT_YET_MSG = "앞 단계가 확정되면 이 단계 모집이 열려요. 그때 견적서를 보낼 수 있고, 열리면 알림이 가요. 지금은 요청서만 미리 볼 수 있어요.";

/** 이름 / 값 표 한 덩어리 */
export function Info({ rows }: { rows: [string, ReactNode][] }) {
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

export const orNone = (s: string | null | undefined, none = "적힌 내용 없음") => (s && s.trim() ? s : none);
const money = (v: number | null) => (v === null ? "정하지 않음" : <MoneyText value={v} />);

/** 이 단계의 요청 내용 (요청서 STEP2) */
export function needRows(type: StageType, needs: PerformanceNeeds): [string, ReactNode][] {
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

/** 큰 요약 카드: 공연 이름 + 날짜·시간·장소·관객·형태·주최 */
export function PostingBrief({ p, withNeeds = false }: { p: PostingDetail; withNeeds?: boolean }) {
  const quotable = isQuotable(p);
  const tiles: [string, ReactNode, ReactNode?][] = [
    ["공연 날짜", dateLabel(p.showDate)],
    ["공연 시간", `${hm(p.showStart)} ~ ${hm(p.showEnd)}`, `리허설 ${hm(p.rehearsalStart)}`],
    ["지역", `${p.sido} ${p.sigungu}`],
    ["관객", `${p.audience}명`, formLabel(p.form)],
  ];
  return (
    <section className={styles.brief} aria-labelledby="brief-title">
      <div className={styles.briefHead}>
        <span className={styles.briefStage}>{stageTag(p)}</span>
        <span className={quotable ? styles.briefOpen : styles.briefWait}>{quotable ? STAGE_STATUS[p.status] : "모집 전"}</span>
        <span className={`sd-num ${styles.briefVer}`}>요청서 v{p.performanceVersion}</span>
      </div>
      <h2 id="brief-title" className={styles.briefTitle}>
        {p.title}
      </h2>
      <p className={`sd-num ${styles.briefWho}`}>
        {nicknameOf(p)} · {userCounts(p)}
      </p>
      <dl className={styles.briefGrid}>
        {tiles.map(([k, v, sub]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="sd-num">
              {v}
              {sub && <small>{sub}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {!quotable && (
        <p className={styles.briefNotice} role="status">
          <b>아직 {STAGE_NAME[p.stageType]} 단계 모집 전이에요.</b> {NOT_YET_MSG}
        </p>
      )}
      {withNeeds && (
        <div className={styles.briefNeeds}>
          <p className={styles.briefNeedsTitle}>{STAGE_NAME[p.stageType]} 요청 내용</p>
          <Info rows={needRows(p.stageType, p.needs)} />
        </div>
      )}
    </section>
  );
}
