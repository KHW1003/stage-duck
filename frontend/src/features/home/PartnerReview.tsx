/**
 * 업체 메인 — 심사 중 (mockup/partner.html 2번 st-review). 내 입점 신청(GET /supplier/application)을 보여 준다.
 * 반려(REJECTED)면 사유와 함께 [신청 내용 고치기]를 앞에 둔다.
 */
import { Link } from "react-router-dom";
import type { SupplierApplication } from "../../shared/api/types";
import { CATEGORIES, TYPES } from "../supplier/ApplicationForm";
import { cx } from "./cx";
import { HomeIcon } from "./icons";
import s from "./home.module.css";

/** "11월 12일 14:20" */
export function appliedLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PartnerReview({ app }: { app: SupplierApplication | null }) {
  const rejected = app?.reviewStatus === "REJECTED";
  const info = app
    ? [
        ["상호", app.companyName],
        ["부문", app.categories.map((c) => CATEGORIES.find((x) => x.value === c)?.label ?? c).join(" · ")],
        ["활동 지역", "서비스 등록 때 정해요"],
        ["사업자 유형", TYPES.find((t) => t.value === app.businessType)?.label ?? app.businessType],
      ]
    : [];
  return (
    <section className={s.pReview}>
      <div className={s.wrap}>
        <div className={s.pReviewCard}>
          <span className={cx(s.pIcon, s.pIconLg)} aria-hidden="true">
            <HomeIcon name="clock" />
          </span>
          <h1>{rejected ? "입점 신청을 다시 확인해 주세요" : "입점 심사 중이에요"}</h1>
          <p className={s.pReviewDesc}>
            {rejected ? (
              <>반려 사유: {app?.rejectReason ?? "-"}</>
            ) : (
              <>
                관리자가 사업자 정보를 확인하고 있어요. 승인되면 사이트 알림으로 알려 드려요.
                <br />
                심사 중에는 공고 목록이 보이지 않고 견적서를 보낼 수 없어요.
              </>
            )}
          </p>
          <ol className={s.pTrack}>
            <li className={s.isDone}>
              <span>
                <HomeIcon name="check" />
              </span>
              <b>신청 접수</b>
              <small>{app ? appliedLabel(app.appliedAt) : "-"}</small>
            </li>
            <li className={s.isNow}>
              <span>2</span>
              <b>관리자 확인</b>
              <small>{rejected ? "보완 필요" : "진행 중"}</small>
            </li>
            <li>
              <span>3</span>
              <b>서비스 등록</b>
              <small>승인 뒤</small>
            </li>
          </ol>
          {info.length > 0 && (
            <dl className={s.pReviewInfo}>
              {info.map(([dt, dd]) => (
                <div key={dt}>
                  <dt>{dt}</dt>
                  <dd>{dd}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className={s.pReviewBtns}>
            <Link className={cx(s.btn, s.btnGhost)} to="/supplier/onboarding">
              심사 상태 보기
            </Link>
            <Link className={cx(s.btn, s.btnPrimary)} to="/supplier/onboarding">
              신청 내용 고치기
            </Link>
          </div>
          <p className={s.pReviewHelp}>
            급하게 확인이 필요하면 <Link to="/inquiries/new">1:1 문의</Link>를 남겨 주세요.
          </p>
        </div>
      </div>
    </section>
  );
}
