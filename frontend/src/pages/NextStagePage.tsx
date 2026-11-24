/**
 * [다음 단계로] (/performances/:id/next). 목업: mockup-v4/pages/next.html · FR-CHAT-04 · FR-ASSIGN-03 · AC-F3-02·04·05
 * 결과(방금 확정한 단계) + 단계 칸 + 다음에 할 일 고르기. 공연 상태로 세 경우 중 하나를 그린다:
 * - 다음 할 일이 OPEN_NEXT (단계를 확정했고 다음 단계가 남음): [모집 시작] / [이미 있어요 · 건너뛰기] 고르기 + 전부 구했어요
 * - 다음 할 일이 PAY (모든 단계를 정함): 단계별 정리 + [통합 결제하기] / DONE (결제 끝): [청구서 보기] · [최종 담당표 보기]
 * - 그 밖: 공연 상세로 돌려보낸다
 * 버튼은 Idempotency-Key 를 넘기고 응답이 올 때까지 끈다 (같은 시도를 다시 보내면 같은 키).
 * 업체 이름·금액은 확정 견적서 함수(3·4번 묶음)가 생기면 결과 줄과 정리 표에 더한다.
 */
import { useRef, useState, type CSSProperties } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAdvance, useDeclareAllSecured, usePerformance } from "../features/performance/api";
import { STAGE_NAME } from "../features/performance/labels";
import { SkipSuggest } from "../features/performance/SkipSuggest";
import { usePageMeta } from "../features/seo/usePageMeta";
import { ApiError } from "../shared/api/client";
import type { PerformanceDetail, StageSummary, StageType } from "../shared/api/types";
import { NotFound } from "../shared/layout/NotFound";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import { KitModal } from "../shared/ui/KitModal";
import "./next-stage.css";

const ICON: Record<StageType, KitIconName> = { VENUE: "venue", EQUIPMENT: "speaker", ENGINEER: "engineer" };
const OBJ: Record<StageType, string> = { VENUE: "공연장을", EQUIPMENT: "장비를", ENGINEER: "엔지니어를" };
const SUBJ: Record<StageType, string> = { VENUE: "공연장은", EQUIPMENT: "장비는", ENGINEER: "엔지니어는" };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function trackInfo(s: StageSummary, upcoming: StageSummary | undefined): string {
  if (s.status === "CONFIRMED") return "확정";
  if (s.status === "SKIPPED") return "건너뜀";
  if (s.id === upcoming?.id) return "다음 차례";
  return "대기";
}

export function Track({ stages, upcoming }: { stages: StageSummary[]; upcoming?: StageSummary }) {
  return (
    <ol className="track" style={{ "--steps": stages.length } as CSSProperties}>
      {stages.map((s, i) => (
        <li key={s.id} className={s.status === "CONFIRMED" ? "is-done" : s.status === "SKIPPED" ? "is-skip" : undefined}>
          <span className="track__bar" />
          <span className="track__ico">
            <Ico name={ICON[s.stageType]} />
          </span>
          <p className="track__no">STEP {String(i + 1).padStart(2, "0")}</p>
          <p className="track__name">{STAGE_NAME[s.stageType]}</p>
          <p className="track__info">{trackInfo(s, upcoming)}</p>
        </li>
      ))}
    </ol>
  );
}

function Choose({ perf, done, next }: { perf: PerformanceDetail; done: StageSummary; next: StageSummary }) {
  const navigate = useNavigate();
  const advance = useAdvance();
  const declare = useDeclareAllSecured();
  const [choice, setChoice] = useState<"OPEN_NEXT" | "SKIP_NEXT">("OPEN_NEXT");
  const [modal, setModal] = useState<"skip" | "all" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const keys = useRef({ OPEN_NEXT: newKey(), SKIP_NEXT: newKey() });
  const name = STAGE_NAME[next.stageType];
  const remaining = perf.stages.filter((s) => s.seq > done.seq).map((s) => STAGE_NAME[s.stageType]);
  const err = (advance.error ?? declare.error) instanceof ApiError ? ((advance.error ?? declare.error) as ApiError).body.message : null;

  const send = (action: "OPEN_NEXT" | "SKIP_NEXT") =>
    advance.mutate(
      { stageId: done.id, action, idempotencyKey: keys.current[action] },
      {
        onSuccess: () => {
          keys.current[action] = newKey();
          setModal(null);
          setAgreed(false);
          if (action === "OPEN_NEXT") navigate(`/performances/${perf.id}`);
        },
      },
    );
  const close = () => {
    setModal(null);
    setAgreed(false);
  };

  return (
    <section className="sec mt-40">
      <div className="sec-head">
        <h2>
          <Ico name="arrow" />
          다음은 {name}예요
        </h2>
      </div>
      <SkipSuggest performance={perf} next={next} />
      <div className="choice choice--col" role="radiogroup" aria-label="다음에 할 일">
        <label className="choice__item">
          <input type="radio" name="next" checked={choice === "OPEN_NEXT"} onChange={() => setChoice("OPEN_NEXT")} />
          <span className="choice__mark" />
          <span>
            <b>{name} 업체 모집 시작</b>
            <small>{name} 업체에게 공고와 앞 단계에서 정한 정보(입실 시각, 기본 장비, 전원)가 보여요.</small>
          </span>
        </label>
        <label className="choice__item">
          <input type="radio" name="next" checked={choice === "SKIP_NEXT"} onChange={() => setChoice("SKIP_NEXT")} />
          <span className="choice__mark" />
          <span>
            <b>{SUBJ[next.stageType]} 이미 있어요 · 건너뛰기</b>
            <small>책임 고지에 동의하면 바로 다음 단계로 가요.</small>
          </span>
        </label>
      </div>
      {err && !modal && (
        <div className="notice notice--conflict mt-16" role="alert">
          <Ico name="warn" />
          <div>{err}</div>
        </div>
      )}
      <div className="btns btns--center mt-40">
        <button className="btn btn--lg next__sub" type="button" onClick={() => setModal("all")}>
          전부 구했어요
        </button>
        <button
          className="btn btn--primary btn--lg next__main"
          type="button"
          disabled={advance.isPending}
          onClick={() => (choice === "OPEN_NEXT" ? send("OPEN_NEXT") : setModal("skip"))}
        >
          {choice === "OPEN_NEXT" ? `${name} 업체 모집 시작` : "건너뛰기"}
        </button>
      </div>

      {modal === "skip" && (
        <KitModal
          title="건너뛰기 확인"
          onClose={close}
          busy={advance.isPending}
          foot={
            <>
              <button className="btn" type="button" onClick={close}>
                모집할래요
              </button>
              <button className="btn btn--primary" type="button" disabled={!agreed || advance.isPending} onClick={() => send("SKIP_NEXT")}>
                건너뛰기
              </button>
            </>
          }
        >
          <p className="modal__lead">{name} 단계를 건너뛸까요?</p>
          <div className="notice notice--warn mt-16">
            <Ico name="warn" />
            <div>건너뛰면 {name} 업체를 따로 모집하지 않아요. 건너뛴 부분의 일정·장비·인력은 직접 준비해야 하고, 동의한 시각이 남아요.</div>
          </div>
          <label className="check mt-16">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />위 내용을 확인했고 동의해요
          </label>
          {err && (
            <p className="field__error mt-8" role="alert">
              <Ico name="warn" sm />
              {err}
            </p>
          )}
        </KitModal>
      )}
      {modal === "all" && (
        <KitModal
          title="전부 구했어요"
          onClose={close}
          busy={declare.isPending}
          foot={
            <>
              <button className="btn" type="button" onClick={close}>
                취소
              </button>
              <button className="btn btn--primary" type="button" disabled={!agreed || declare.isPending} onClick={() => declare.mutate(perf.id, { onSuccess: close })}>
                모두 건너뛰기
              </button>
            </>
          }
        >
          <p className="modal__lead">남은 단계를 모두 건너뛸까요?</p>
          <p>{remaining.join("·")} 단계가 모두 건너뜀이 되고 바로 결제로 가요.</p>
          <div className="notice notice--warn mt-16">
            <Ico name="warn" />
            <div>건너뛴 단계의 장비·인력은 직접 준비해야 해요. STAGE DUCK은 그 부분을 확인하지 않아요.</div>
          </div>
          <label className="check mt-16">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />위 내용을 확인했어요
          </label>
        </KitModal>
      )}
    </section>
  );
}

function AllSet({ perf }: { perf: PerformanceDetail }) {
  const paid = perf.nextAction === "DONE";
  return (
    <section className="sec mt-40">
      <div className="invoice">
        {perf.stages.map((s) => (
          <div key={s.id} className="invoice__row">
            <span className={s.status === "SKIPPED" ? "invoice__stage muted" : "invoice__stage"}>
              <span className="ico-box">
                <Ico name={ICON[s.stageType]} />
              </span>
              {STAGE_NAME[s.stageType]}
            </span>
            <div className="invoice__what">{s.status === "SKIPPED" ? <span className="state state--off">건너뜀</span> : <b>확정</b>}</div>
            <span className="invoice__amt muted">-</span>
          </div>
        ))}
        <div className="invoice__total">
          <span>
            {paid ? "결제한 금액" : "결제할 금액"} <small className="muted next__fee">플랫폼 이용료 포함</small>
          </span>
          <b>통합 청구서에서 확인</b>
        </div>
      </div>
      <div className="btns btns--center mt-40">
        <Link className="btn btn--lg next__sub" to={`/performances/${perf.id}`}>
          내 공연으로
        </Link>
        {paid && (
          <Link className="btn btn--lg next__sub" to={`/performances/${perf.id}/sheet`}>
            최종 담당표 보기
          </Link>
        )}
        <Link className="btn btn--primary btn--lg next__main" to={`/performances/${perf.id}/order`}>
          {paid ? "청구서 보기" : "통합 결제하기"}
        </Link>
      </div>
    </section>
  );
}

export function NextStagePage() {
  usePageMeta("다음 단계로");
  const id = Number(useParams().id);
  const perf = usePerformance(id);
  if (!Number.isInteger(id) || (perf.error instanceof ApiError && perf.error.status === 404)) return <NotFound />;
  if (!perf.data) return <p className="sd-sr-only">불러오는 중이에요</p>;
  const p = perf.data;
  const stages = [...p.stages].sort((a, b) => a.seq - b.seq);
  const allSet = p.nextAction === "PAY" || p.nextAction === "DONE";
  const doneIdx = stages.findIndex((s) => s.id === p.nextStageId);
  const done = stages[doneIdx];
  const next = stages[doneIdx + 1];
  if (!allSet && !(p.nextAction === "OPEN_NEXT" && done && next)) return <Navigate to={`/performances/${p.id}`} replace />;

  return (
    <main className="container container--narrow main">
      <div className="result">
        <span className="result__icon">
          <Ico name="check" />
        </span>
        <h1>{p.nextAction === "DONE" ? "테스트 결제가 끝났어요" : allSet ? "모든 단계를 정했어요" : `${OBJ[done.stageType]} 확정했어요`}</h1>
        <p>{p.nextAction === "DONE" ? "청구서와 최종 담당표를 확인해 주세요. 실제 청구되지 않습니다." : allSet ? "통합 청구서로 한 번에 결제하면 섭외가 끝나요." : `${p.title} · 다음은 ${STAGE_NAME[next.stageType]} 단계예요.`}</p>
      </div>
      <Track stages={stages} upcoming={allSet ? undefined : next} />
      {allSet ? <AllSet perf={p} /> : <Choose perf={p} done={done} next={next} />}
    </main>
  );
}
