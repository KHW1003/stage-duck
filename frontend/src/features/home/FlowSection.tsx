/**
 * 메인 이용 방법 (mockup/home.html 4번 구역): 왼쪽 단계 4개, 오른쪽 그 단계 화면 미리보기.
 * 목업 스크립트와 같은 동작: 6초마다 다음 단계, 단계를 누르면 그 단계에서 멈춤(진행 막대 숨김).
 * 움직임 줄이기 설정이면 처음부터 멈춤. 미리보기는 실제 화면 스크린샷 (public/flow/step-N.png, 11/25).
 */
import { useEffect, useState } from "react";
import { FLOW_STEPS } from "./content";
import { cx } from "./cx";
import s from "./home.module.css";

const INTERVAL = 6000;
const prefersReduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 각 단계의 실제 화면 (11/25 해원: 그린 미리보기 대신 실제 스크린샷). 휴대폰 폭 400px × 2배, 시연 데이터로 찍었다 */
const SHOTS = [
  { src: "/flow/step-1.png", alt: "요청서 쓰기 화면: 공연 기본 정보·필요한 것·확인·게시 세 단계로 적는다" },
  { src: "/flow/step-2.png", alt: "내 공연 화면의 받은 견적서 카드: 금액, 가장 낮은 견적과의 차이, 포함 항목, 자동 검사 통과, 채팅 시작" },
  { src: "/flow/step-3.png", alt: "업체와의 채팅 화면: 대관 조건을 맞춘 대화와 업체가 보낸 최종 견적(견적 내역 확인) 카드" },
  { src: "/flow/step-4.png", alt: "통합 청구서의 결제 정보: 업체 금액, 플랫폼 이용료, 총 결제 금액, 테스트 결제, 결제하기" },
];

export function FlowSection() {
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(prefersReduced);

  useEffect(() => {
    if (manual) return;
    const id = window.setInterval(() => setStep((v) => (v + 1) % FLOW_STEPS.length), INTERVAL);
    return () => window.clearInterval(id);
  }, [manual]);

  return (
    <section className={cx(s.flow, manual && s.isManual)} id="flow">
      <div className={s.wrap}>
        <div className={cx(s.secHead, s.secHeadCenter)}>
          <h2 className={s.secTitle}>공연 준비, 이렇게 진행돼요.</h2>
          <p className={s.secDesc}>요청서 한 장으로 시작해서 결제까지, 네 단계면 끝나요.</p>
        </div>
        <div className={s.flowGrid}>
          <div className={s.flowTabs} role="tablist" aria-label="이용 단계">
            {FLOW_STEPS.map((t, i) => (
              <button
                key={t.title}
                id={`flow-tab-${i}`}
                className={cx(s.flowTab, i === step && s.isActive)}
                role="tab"
                aria-selected={i === step}
                aria-controls={`pv${i + 1}`}
                type="button"
                onClick={() => {
                  setManual(true);
                  setStep(i);
                }}
              >
                <span className={s.flowTabNo}>{i + 1}</span>
                <span className={s.flowTabText}>
                  <b>{t.title}</b>
                  <small>{t.desc}</small>
                </span>
                {/* key: 단계가 바뀔 때마다 6초 막대를 처음부터 */}
                <span key={i === step ? `on-${step}` : "off"} className={s.flowTabBar} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={s.flowStage}>
            {SHOTS.map((shot, i) => (
              <div
                key={i}
                className={cx(s.pv, i === step && s.isActive)}
                id={`pv${i + 1}`}
                role="tabpanel"
                aria-labelledby={`flow-tab-${i}`}
                hidden={i !== step}
              >
                <img className={s.pvShot} src={shot.src} alt={shot.alt} width={400} height={640} loading={i === 0 ? "eager" : "lazy"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
