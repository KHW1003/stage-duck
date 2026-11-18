/**
 * 업체 메인 — 입점 안내 (방문자). 목업 mockup/partner.html 1번 (st-guest):
 * 히어로(사진 + 새 공고 카드) → 왜 입점하나 → 입점 3단계·돈 → 업체 FAQ → 마지막 안내.
 */
import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { PARTNER_FAQ } from "./content";
import { cx } from "./cx";
import { FaqSection } from "./FaqSection";
import { HomeIcon, type HomeIconName } from "./icons";
import s from "./home.module.css";

const SIGNUP = "/signup/supplier";

const WHY: { icon: HomeIconName; title: string; desc: string }[] = [
  { icon: "filter", title: "내 부문 공고만 도착", desc: "공연장·장비·엔지니어 중 내 부문과 활동 지역, 지금 열린 단계에 맞는 공고만 보여요." },
  { icon: "card", title: "결제금 보관 후 정산", desc: "사용자가 결제한 금액은 STAGE DUCK이 보관하고, 공연이 끝나면 업체에 정산돼요." },
  { icon: "house", title: "업체 찾기로 홍보", desc: "장비 목록과 현장 사진으로 업체를 소개하면, 사용자가 오퍼를 먼저 보낼 수 있어요." },
];

const STEPS = [
  { no: "1", title: "계정", desc: "이메일로 업체 계정을 만들어요" },
  { no: "2", title: "사업자 정보", desc: "사업자 유형과 등록번호, 사업자등록증" },
  { no: null, title: "관리자 확인", desc: "승인되면 알림으로 알려 드려요" },
  { no: "3", title: "서비스 등록", desc: "제공하는 장비·공간·인력과 활동 지역" },
];

const FEES = [
  { label: "업체가 내는 돈", value: "없어요", desc: "입점비·월 이용료 없음 · 플랫폼 이용료는 사용자가 내요" },
  { label: "정산", value: "공연이 끝난 뒤", desc: "견적서 금액 그대로 · 정산 일정은 팀이 정해요" },
  { label: "사용자가 취소하면", value: "시점별 위약금", desc: "업체 금액 비율대로 나눠 받아요" },
];

const STATS = [
  { dt: "공고", dd: "내 부문·지역만 와요" },
  { dt: "입점비", dd: "없어요" },
  { dt: "정산", dd: "공연이 끝난 뒤" },
];

export function PartnerGuest() {
  return (
    <>
      <section className={s.hero}>
        <div className={cx(s.wrap, s.heroGrid)}>
          <div className={s.heroCopy}>
            <p className={s.eyebrow}>
              STAGE DUCK <b>파트너</b>
            </p>
            <h1>
              공연이 필요한 곳에
              <br />
              우리 장비와 기술을.
            </h1>
            <p className={s.heroDesc}>
              공연장·장비·엔지니어 업체라면 입점하세요.
              <br />내 부문과 활동 지역에 맞는 공고가 바로 도착해요.
            </p>
            <div className={s.heroActions}>
              <Link className={cx(s.btn, s.btnPrimary)} to={SIGNUP}>
                입점 신청하기
              </Link>
              <a className={cx(s.btn, s.btnGhost)} href="#join">
                입점 절차 보기
              </a>
            </div>
            <Link className={s.heroSub} to="/login">
              이미 가입했어요 · 로그인 <span aria-hidden="true">→</span>
            </Link>
            <dl className={s.heroStats}>
              {STATS.map((st) => (
                <div key={st.dt}>
                  <dt>{st.dt}</dt>
                  <dd>{st.dd}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className={s.pVisual} style={{ "--img": "url('/photos/photo-1598488035139-bdbb2231ce04.jpg')" } as CSSProperties}>
            <div className={s.pVisualCard}>
              <p className={s.pVisualLabel}>새 공고가 도착했어요</p>
              <div className={s.jobMini}>
                <b>11월 28일(토) · 광주 · 밴드 80명</b>
                <small>장비 단계 · 앞 단계에서 공간 C로 정해졌어요 (입실 15:00)</small>
                <span className={cx(s.btn, s.btnSm, s.btnPrimary)}>견적서 쓰기</span>
              </div>
            </div>
            <div className={cx(s.toast, s.pVisualToast)}>
              <span className={s.toastIcon}>
                <HomeIcon name="pass" />
              </span>
              <div>
                <b>가을밤밴드님이 컨펌했어요</b>
                <small>1,350,000원 · 공연이 끝난 뒤 정산</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.pWhy}>
        <div className={s.wrap}>
          <div className={cx(s.secHead, s.secHeadCenter)}>
            <h2 className={s.secTitle}>영업은 줄이고, 공연에 집중하세요.</h2>
            <p className={s.secDesc}>STAGE DUCK이 공고를 모으고, 결제와 정산을 챙겨요.</p>
          </div>
          <div className={s.pWhyGrid}>
            {WHY.map((w) => (
              <article key={w.title} className={s.pWhyCard}>
                <span className={s.pIcon} aria-hidden="true">
                  <HomeIcon name={w.icon} />
                </span>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={s.pJoin} id="join">
        <div className={s.wrap}>
          <div className={s.secHead}>
            <div>
              <h2 className={s.secTitle}>입점은 3단계예요.</h2>
              <p className={s.secDesc}>사업자 정보를 내면 관리자가 확인하고, 승인되면 서비스를 등록해 공고를 볼 수 있어요.</p>
            </div>
            <Link className={s.more} to={SIGNUP}>
              입점 신청 화면 <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ol className={s.pSteps}>
            {STEPS.map((st) => (
              <li key={st.title} className={st.no ? undefined : s.isEnd}>
                <span className={s.pStepsNo}>{st.no ?? <HomeIcon name="clock" />}</span>
                <b>{st.title}</b>
                <small>{st.desc}</small>
              </li>
            ))}
          </ol>
          <div className={s.pFee}>
            {FEES.map((f) => (
              <div key={f.label} className={s.pFeeItem}>
                <span>{f.label}</span>
                <b>{f.value}</b>
                <small>{f.desc}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqSection title="업체 자주 묻는 질문" desc="입점 상담은 1:1 문의로 남겨 주세요." ask="입점 상담하기" items={PARTNER_FAQ} />

      <section className={s.pCta}>
        <div className={s.wrap}>
          <div className={s.pCtaBox}>
            <div>
              <h2>지금 입점하고 첫 공고를 받아 보세요</h2>
              <p>계정과 사업자 정보만 있으면 신청할 수 있어요.</p>
            </div>
            <Link className={cx(s.btn, s.btnPrimary)} to={SIGNUP}>
              입점 신청하기
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
