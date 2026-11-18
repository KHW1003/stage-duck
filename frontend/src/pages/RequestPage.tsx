/**
 * 요청서 쓰기 (/performances/new, #36). 사용자 역할만 (App.tsx 의 RequireAuth).
 * STEP1 공연 기본 정보 → STEP2 필요한 것 → 게시 확인 창 → POST /performances + POST /performances/{id}/publish.
 * - 화면 쪽 확인은 보조이고, 서버가 준 fieldErrors 가 있으면 그 문구를 칸 아래에 보여 준다 (STEP1 칸이면 STEP1로 돌아간다)
 * - 작성은 됐는데 게시가 실패하면, 다시 누를 때 받은 id 로 게시만 다시 한다 (요청서가 두 개 생기지 않게)
 * - "임시 저장"·"나중에 쓰기"는 받을 API가 없어 넣지 않았다
 */
import { useState } from "react";
import { ApiError } from "../shared/api/client";
import type { PerformanceForm, PerformanceNeeds, PerformancePublished, PerformanceRequest, StageType } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { useCreatePerformance, usePublishPerformance } from "../features/request/api";
import { FORMS, STAGE_LABEL } from "../features/request/codes";
import { PublishModal } from "../features/request/PublishModal";
import { Step1Form } from "../features/request/Step1Form";
import { Step2Form } from "../features/request/Step2Form";
import { STEP1_FIELDS, earliestShowDate, step1Errors, step2Errors, type Errors, type Step1Form as Form } from "../features/request/validate";
import styles from "../features/request/Request.module.css";

const EMPTY_FORM: Form = {
  title: "", form: "", lineup: [], showDate: "", rehearsalStart: "", showStart: "", showEnd: "",
  audience: "", sido: "", sigungu: "", contactPhone: "",
};

/** AC-F2-09: 장비 목록(items)은 비어서 시작한다 */
const EMPTY_NEEDS: PerformanceNeeds = {
  venue: { needed: true, proposalWanted: false, types: [], capacity: null, budget: null, checkinWish: null, checkoutWish: null, mustHave: [], note: "" },
  equipment: { needed: true, proposalWanted: false, items: [], services: [], budget: null, owned: [], note: "" },
  engineer: { needed: true, tasks: [], conditions: [], etc: "", note: "" },
  ownedVenue: null,
};

const STEPS = [
  { no: "01", label: "공연 기본 정보" },
  { no: "02", label: "필요한 것" },
  { no: "03", label: "확인·게시" },
];
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function toRequest(f: Form, needs: PerformanceNeeds): PerformanceRequest {
  return {
    title: f.title.trim(),
    form: f.form as PerformanceForm,
    lineup: f.lineup.filter((r) => r.part.trim()).map((r) => ({ part: r.part.trim(), count: Number(r.count) || 1 })),
    showDate: f.showDate,
    rehearsalStart: f.rehearsalStart,
    showStart: f.showStart,
    showEnd: f.showEnd,
    audience: Number(f.audience),
    sido: f.sido,
    sigungu: f.sigungu.trim(),
    contactPhone: f.contactPhone.trim() || null,
    needs: {
      ...needs,
      equipment: { ...needs.equipment, items: needs.equipment.items.filter((r) => r.name.trim()), owned: needs.equipment.owned.filter((r) => r.name.trim()) },
    },
  };
}

function serverErrors(error: unknown): Errors {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.body.fieldErrors.map((e) => [e.field, e.reason]));
}

function dateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일(${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

export function RequestPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [needs, setNeeds] = useState<PerformanceNeeds>(EMPTY_NEEDS);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [published, setPublished] = useState<PerformancePublished | null>(null);
  const create = useCreatePerformance();
  const publish = usePublishPerformance();
  const today = new Date();

  function next1() {
    const e = step1Errors(form, today);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      setNeeds((n) => (n.venue.capacity === null ? { ...n, venue: { ...n.venue, capacity: Number(form.audience) } } : n));
      setStep(2);
    }
  }

  function next2() {
    const e = step2Errors(needs);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      create.reset();
      publish.reset();
      setConfirming(true);
    }
  }

  async function onPublish() {
    try {
      const id = createdId ?? (await create.mutateAsync(toRequest(form, needs))).id;
      setCreatedId(id);
      setPublished(await publish.mutateAsync(id));
      setConfirming(false);
    } catch (error) {
      const fields = serverErrors(error);
      if (Object.keys(fields).length === 0) return; // 칸 밖 오류는 확인 창 안에 보인다
      setErrors(fields);
      setConfirming(false);
      setStep(Object.keys(fields).some((f) => STEP1_FIELDS.includes(f)) ? 1 : 2);
    }
  }

  const stages = (["VENUE", "EQUIPMENT", "ENGINEER"] as StageType[]).filter((s) => needs[s === "VENUE" ? "venue" : s === "EQUIPMENT" ? "equipment" : "engineer"].needed);

  return (
    <>
      <PageTop
        title="요청서 쓰기"
        desc="한 번만 적으면 공연장·장비·엔지니어 업체가 모두 같은 내용을 봐요."
        crumbs={[{ label: "내 공연", to: "/me/performances" }, { label: "요청서 쓰기" }]}
      />
      <div className={`sd-container ${styles.wrap}`}>
        <ol className={styles.steps} aria-label="요청서 단계">
          {STEPS.map((s, i) => {
            const now = published ? 2 : confirming ? 2 : step - 1;
            return (
              <li
                key={s.no}
                className={[styles.step, i < now || published ? styles.done : "", i === now && !published ? styles.now : ""].filter(Boolean).join(" ")}
                aria-current={i === now && !published ? "step" : undefined}
              >
                {s.no}
                <b>{s.label}</b>
              </li>
            );
          })}
        </ol>

        {published ? (
          <div className={`${styles.notice} ${styles.passed}`} role="status">
            <b>공고를 올렸어요</b>
            지금은 {STAGE_LABEL[published.stages[0].stageType]} 업체에게만 보여요. 견적서가 오면 알림으로 알려 드려요.
            <div className={styles.actions}>
              <ButtonLink to="/me/performances" variant="primary">
                내 공연으로
              </ButtonLink>
            </div>
          </div>
        ) : step === 1 ? (
          <>
            <h2 className="sd-sr-only">공연 기본 정보</h2>
            <Step1Form value={form} onChange={setForm} errors={errors} minDate={earliestShowDate(today)} onNext={next1} />
          </>
        ) : (
          <>
            <h2 className="sd-sr-only">필요한 것</h2>
            <Step2Form
              value={needs}
              onChange={setNeeds}
              errors={errors}
              onBack={() => {
                setErrors({});
                setStep(1);
              }}
              onNext={next2}
            />
          </>
        )}
      </div>

      {confirming && (
        <PublishModal
          title={form.title.trim()}
          formLabel={FORMS.find((f) => f.value === form.form)?.label ?? ""}
          when={`${dateLabel(form.showDate)} ${form.showStart}~${form.showEnd} · 리허설 ${form.rehearsalStart}`}
          where={`${form.sido} ${form.sigungu.trim()} · ${form.audience}명`}
          stages={stages}
          error={create.error ?? publish.error}
          loading={create.isPending || publish.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={onPublish}
        />
      )}
    </>
  );
}
