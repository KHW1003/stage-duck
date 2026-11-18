/**
 * 메인 이용 방법 (mockup/home.html 4번 구역): 왼쪽 단계 4개, 오른쪽 그 단계 화면 미리보기.
 * 목업 스크립트와 같은 동작: 6초마다 다음 단계, 단계를 누르면 그 단계에서 멈춤(진행 막대 숨김).
 * 움직임 줄이기 설정이면 처음부터 멈춤. 미리보기는 그림이라 버튼처럼 보여도 누를 수 없다 (목업 span).
 */
import { useEffect, useState } from "react";
import { FLOW_STEPS } from "./content";
import { cx } from "./cx";
import { HomeIcon } from "./icons";
import s from "./home.module.css";

const INTERVAL = 6000;
const prefersReduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Pass({ children }: { children: string }) {
  return (
    <span className={cx(s.status, s.statusPass)}>
      <HomeIcon name="pass" />
      {children}
    </span>
  );
}

function Toast({ icon, title, desc }: { icon: "megaphone" | "pass"; title: string; desc: string }) {
  return (
    <div className={s.toast}>
      <span className={s.toastIcon}>
        <HomeIcon name={icon} />
      </span>
      <div>
        <b>{title}</b>
        <small>{desc}</small>
      </div>
    </div>
  );
}

function RequestPreview() {
  return (
    <>
      <div className={s.ui}>
        <div className={s.uiHead}>
          <b>공연 요청서</b>
          <span className={s.muted}>STEP 1 / 2</span>
        </div>
        <div className={s.uiFields}>
          {[
            ["지역", "광주 동구"],
            ["공연 날짜", "11월 28일(토)"],
            ["예상 관객", "80명"],
            ["장르", "밴드 (5인)"],
          ].map(([k, v]) => (
            <div key={k} className={s.f}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <p className={s.uiLabel}>필요한 서비스</p>
        <div className={s.chips}>
          {["공연장", "장비", "엔지니어"].map((c) => (
            <span key={c} className={cx(s.chip, s.chipOn)}>
              {c}
            </span>
          ))}
        </div>
        <div className={s.uiFoot}>
          <span className={s.muted}>임시 저장됨 · 14:02</span>
          <span className={cx(s.btn, s.btnSm, s.btnPrimary)}>다음 단계</span>
        </div>
      </div>
      <Toast icon="megaphone" title="공고가 올라갔어요" desc="공연장 업체에게 먼저 보여요" />
    </>
  );
}

function ComparePreview() {
  return (
    <div className={s.ui}>
      <div className={s.uiHead}>
        <b>장비 견적서 2장</b>
        <span className={s.muted}>같은 기준으로 자동 검사</span>
      </div>
      <table className={s.cmp}>
        <thead>
          <tr>
            <th>업체</th>
            <th>총액</th>
            <th>포함</th>
            <th>검사</th>
          </tr>
        </thead>
        <tbody>
          <tr className={s.isBest}>
            <td>
              <b>업체 D</b>
              <small>엔지니어 포함</small>
            </td>
            <td className={s.num}>1,350,000원</td>
            <td>스피커·믹서·모니터 4·설치</td>
            <td>
              <Pass>통과</Pass>
            </td>
          </tr>
          <tr>
            <td>
              <b>업체 E</b>
            </td>
            <td className={s.num}>980,000원</td>
            <td>스피커·믹서·설치</td>
            <td>
              <span className={cx(s.status, s.statusWarn)}>확인 필요 1</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div className={s.uiFoot}>
        <span className={s.muted}>가격은 부가세 포함</span>
        <span className={cx(s.btn, s.btnSm, s.btnPrimary)}>업체 D와 채팅</span>
      </div>
    </div>
  );
}

function ConfirmPreview() {
  return (
    <div className={s.ui}>
      <div className={s.uiHead}>
        <b>업체 D</b>
        <span className={s.muted}>장비 · 엔지니어 포함</span>
      </div>
      <div className={cx(s.bubble, s.bubbleThem)}>설치 인원을 한 명 더 붙이면 15:45에 끝나요. 리허설 17:00 전에 마칠게요.</div>
      <div className={cx(s.bubble, s.bubbleMe)}>좋아요. 철수는 21:00부터 해 주세요.</div>
      <div className={s.confirm}>
        <p className={s.confirmLabel}>견적 내역 확인</p>
        <ul>
          {[
            ["스피커·믹서·마이크·모니터", "900,000원"],
            ["설치·철수 · 설치 인원 +1", "300,000원"],
            ["현장 엔지니어 1명", "150,000원"],
          ].map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </li>
          ))}
        </ul>
        <div className={s.confirmTotal}>
          <span>합계 (견적서 v2)</span>
          <b>1,350,000원</b>
        </div>
        <div className={s.confirmBtns}>
          <span className={cx(s.btn, s.btnSm, s.btnGhost)}>다시 조율</span>
          <span className={cx(s.btn, s.btnSm, s.btnPrimary)}>컨펌</span>
        </div>
      </div>
    </div>
  );
}

function BillPreview() {
  return (
    <>
      <div className={s.ui}>
        <div className={s.uiHead}>
          <b>통합 청구서</b>
          <span className={cx(s.badge, s.badgeBlue)}>안전 결제</span>
        </div>
        <ul className={s.bill}>
          <li>
            <span>공연장 · 업체 C · 공간 C</span>
            <b>500,000원</b>
          </li>
          <li>
            <span>장비 · 업체 D (엔지니어 포함)</span>
            <b>1,350,000원</b>
          </li>
          <li>
            <span>엔지니어 · 건너뜀</span>
            <b>-</b>
          </li>
          <li className={s.billFee}>
            <span>플랫폼 이용료 (5%)</span>
            <b>92,500원</b>
          </li>
        </ul>
        <div className={s.billTotal}>
          <span>결제할 금액</span>
          <b>1,942,500원</b>
        </div>
        <p className={s.uiHint}>결제 금액은 공연이 끝날 때까지 STAGE DUCK이 보관해요.</p>
        <div className={s.uiFoot}>
          <span className={s.muted}>테스트 결제 — 실제 청구되지 않습니다</span>
          <span className={cx(s.btn, s.btnSm, s.btnPrimary)}>결제하기</span>
        </div>
      </div>
      <Toast icon="pass" title="결제가 완료됐어요" desc="업체 연락처가 최종 담당표에 공개돼요" />
    </>
  );
}

const PREVIEWS = [RequestPreview, ComparePreview, ConfirmPreview, BillPreview];

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
            {PREVIEWS.map((Preview, i) => (
              <div
                key={i}
                className={cx(s.pv, i === step && s.isActive)}
                id={`pv${i + 1}`}
                role="tabpanel"
                aria-labelledby={`flow-tab-${i}`}
                hidden={i !== step}
              >
                <Preview />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
