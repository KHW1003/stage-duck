/**
 * 요청서 쓰기 (/performances/new, #36). 사용자 역할만 (App.tsx 의 RequireAuth).
 * STEP1 공연 기본 정보 → STEP2 필요한 것 → 게시 확인 창 → POST /performances + POST /performances/{id}/publish.
 * - 화면 쪽 확인은 보조이고, 서버가 준 fieldErrors 가 있으면 그 문구를 칸 아래에 보여 준다 (STEP1 칸이면 STEP1로 돌아간다)
 * - 작성은 됐는데 게시가 실패하면, 다시 누를 때 받은 id 로 게시만 다시 한다 (요청서가 두 개 생기지 않게)
 * - "임시 저장"·"나중에 쓰기"는 받을 API가 없어 넣지 않았다
 * - 수정 모드(edit, /performances/:id/edit, #40): 현재 값을 채우고 PUT 으로 새 버전. 게시 뒤에는 필요해요/이미 있어요를 잠그고
 *   [수정 저장]만, 작성 중이면 저장 후 게시. 전화번호는 다시 적을 때만 보낸다 (응답에 번호가 없어서, CLAUDE.md 20)
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../shared/api/client";
import type { PerformanceDetail, PerformanceForm, PerformanceNeeds, PerformancePublished, PerformanceRequest, StageType } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { useUpdatePerformance } from "../features/performance/api";
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

function toForm(d: PerformanceDetail): Form {
  return {
    title: d.title, form: d.form, lineup: d.lineup.map((r) => ({ part: r.part, count: String(r.count) })),
    showDate: d.showDate, rehearsalStart: d.rehearsalStart.slice(0, 5), showStart: d.showStart.slice(0, 5),
    showEnd: d.showEnd.slice(0, 5), audience: String(d.audience), sido: d.sido, sigungu: d.sigungu, contactPhone: "",
  };
}

/** keepPhone: 수정에서 전화번호 칸을 비워 두면 보내지 않는다 → 서버가 저장된 번호를 그대로 둔다 */
function toRequest(f: Form, needs: PerformanceNeeds, keepPhone = false): PerformanceRequest {
  const body: PerformanceRequest = {
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
  if (keepPhone && !f.contactPhone.trim()) delete body.contactPhone;
  return body;
}

function serverErrors(error: unknown): Errors {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.body.fieldErrors.map((e) => [e.field, e.reason]));
}

function dateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일(${WEEKDAY[new Date(y, m - 1, d).getDay()]})`;
}

export function RequestPage({ edit }: { edit?: PerformanceDetail }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Form>(edit ? toForm(edit) : EMPTY_FORM);
  const [needs, setNeeds] = useState<PerformanceNeeds>(edit ? edit.needs : EMPTY_NEEDS);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(edit?.id ?? null);
  const [published, setPublished] = useState<PerformancePublished | null>(null);
  const create = useCreatePerformance();
  const publish = usePublishPerformance();
  const update = useUpdatePerformance();
  const navigate = useNavigate();
  const today = new Date();
  const liveEdit = !!edit && edit.status !== "DRAFT"; // 게시한 요청서 수정

  function showServerErrors(error: unknown): boolean {
    const fields = serverErrors(error);
    if (Object.keys(fields).length === 0) return false;
    setErrors(fields);
    setConfirming(false);
    setStep(Object.keys(fields).some((f) => STEP1_FIELDS.includes(f)) ? 1 : 2);
    return true;
  }

  async function saveEdit() {
    try {
      await update.mutateAsync({ id: edit!.id, body: toRequest(form, needs, true) });
      navigate(`/performances/${edit!.id}`);
    } catch (error) {
      showServerErrors(error);
    }
  }

  function next1() {
    const e = step1Errors(form, today, edit?.showDate);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      setNeeds((n) => (n.venue.capacity === null ? { ...n, venue: { ...n.venue, capacity: Number(form.audience) } } : n));
      setStep(2);
    }
  }

  function next2() {
    const e = step2Errors(needs);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (liveEdit) {
      void saveEdit();
      return;
    }
    create.reset();
    publish.reset();
    update.reset();
    setConfirming(true);
  }

  async function onPublish() {
    try {
      if (edit) await update.mutateAsync({ id: edit.id, body: toRequest(form, needs, true) }); // 작성 중이던 요청서: 저장 후 게시
      const id = createdId ?? (await create.mutateAsync(toRequest(form, needs))).id;
      setCreatedId(id);
      setPublished(await publish.mutateAsync(id));
      setConfirming(false);
    } catch (error) {
      showServerErrors(error); // 칸 밖 오류는 확인 창 안에 보인다
    }
  }

  const stages = (["VENUE", "EQUIPMENT", "ENGINEER"] as StageType[]).filter((s) => needs[s === "VENUE" ? "venue" : s === "EQUIPMENT" ? "equipment" : "engineer"].needed);

  return (
    <>
      <PageTop
        title={edit ? "요청서 수정" : "요청서 쓰기"}
        desc={liveEdit ? "고치면 새 버전이 생기고, 견적서를 보낸 업체에게 바뀐 항목이 보여요. 확정한 단계는 업체가 다시 확인해요." : "한 번만 적으면 공연장·장비·엔지니어 업체가 모두 같은 내용을 봐요."}
        crumbs={[{ label: "내 공연", to: "/me/performances" }, { label: edit ? "요청서 수정" : "요청서 쓰기" }]}
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
            <Step1Form
              value={form}
              onChange={setForm}
              errors={errors}
              minDate={earliestShowDate(today)}
              onNext={next1}
              phoneHint={edit?.hasContactPhone ? "저장된 번호가 있어요. 바꿀 때만 적어 주세요. 결제 전에는 업체에게 보이지 않아요." : undefined}
            />
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
              lockNeeded={liveEdit}
              submitLabel={liveEdit ? "수정 저장" : "확인하고 게시하기"}
              submitting={update.isPending}
            />
            {liveEdit && <ErrorNotice error={Object.keys(serverErrors(update.error)).length ? null : update.error} />}
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
          error={update.error ?? create.error ?? publish.error}
          loading={update.isPending || create.isPending || publish.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={onPublish}
        />
      )}
    </>
  );
}
