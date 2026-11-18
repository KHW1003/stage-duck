/**
 * 요청서 STEP1 공연 기본 정보 (FR-REQ-01, 목업 request-1.html). AC-F2-04·05·06: 틀리면 넘어가지 않고 칸 아래에 이유.
 */
import type { ChangeEvent } from "react";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { FORMS, SIDO } from "./codes";
import type { Errors, Step1Form as Form } from "./validate";
import styles from "./Request.module.css";

interface Props {
  value: Form;
  onChange: (next: Form) => void;
  errors: Errors;
  minDate: string;
  onNext: () => void;
  /** 수정에서 저장된 번호가 있을 때 도움말 */
  phoneHint?: string;
}

type TextKey = "title" | "showDate" | "rehearsalStart" | "showStart" | "showEnd" | "audience" | "sigungu" | "contactPhone";

export function Step1Form({ value, onChange, errors, minDate, onNext, phoneHint }: Props) {
  const text = (key: TextKey) => ({
    value: value[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value }),
  });
  const setLineup = (lineup: Form["lineup"]) => onChange({ ...value, lineup });

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>공연</h2>
        <Field label="공연명" required error={errors.title}>
          {(c) => <Input {...c} maxLength={100} {...text("title")} />}
        </Field>
        <div>
          <fieldset className={styles.choices}>
            <legend className={styles.legend}>
              공연 형태<span className={styles.req} aria-hidden="true">*</span>
            </legend>
            {FORMS.map((f) => (
              <label key={f.value} className={styles.chip}>
                <input
                  type="radio"
                  name="form"
                  value={f.value}
                  checked={value.form === f.value}
                  onChange={() => onChange({ ...value, form: f.value })}
                />
                {f.label}
              </label>
            ))}
          </fieldset>
          {errors.form && <p className={styles.fieldError}>{errors.form}</p>}
        </div>
        <div>
          <p className={styles.legend}>
            편성 <span className={styles.hint}>(선택) 업체가 장비 구성을 정할 때 봐요.</span>
          </p>
          <div className={styles.rows}>
            {value.lineup.map((row, i) => (
              <div key={i} className={styles.listRow}>
                <Field label={`파트 ${i + 1}`}>
                  {(c) => (
                    <Input
                      {...c}
                      placeholder="예: 보컬"
                      value={row.part}
                      onChange={(e) => setLineup(value.lineup.map((r, j) => (j === i ? { ...r, part: e.target.value } : r)))}
                    />
                  )}
                </Field>
                <Field label={`인원 ${i + 1}`}>
                  {(c) => (
                    <Input
                      {...c}
                      numeric
                      inputMode="numeric"
                      value={row.count}
                      onChange={(e) => setLineup(value.lineup.map((r, j) => (j === i ? { ...r, count: e.target.value } : r)))}
                    />
                  )}
                </Field>
                <Button variant="ghost" onClick={() => setLineup(value.lineup.filter((_, j) => j !== i))}>
                  빼기
                </Button>
              </div>
            ))}
          </div>
          <Button variant="line" size="sm" onClick={() => setLineup([...value.lineup, { part: "", count: "1" }])}>
            편성 추가
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>날짜와 시간</h2>
        <p className={styles.sectionDesc}>공연 14일 전까지만 요청할 수 있어요.</p>
        <Field label="공연 날짜" required error={errors.showDate}>
          {(c) => <Input {...c} type="date" min={minDate} {...text("showDate")} />}
        </Field>
        <div className={styles.row3}>
          <Field label="리허설 시작" required hint="리허설 시작 전에 장비 설치가 끝나야 해요. 철수는 공연이 끝난 뒤에 해요." error={errors.rehearsalStart}>
            {(c) => <Input {...c} type="time" step={60} {...text("rehearsalStart")} />}
          </Field>
          <Field label="공연 시작" required error={errors.showStart}>
            {(c) => <Input {...c} type="time" step={60} {...text("showStart")} />}
          </Field>
          <Field label="공연 종료" required error={errors.showEnd}>
            {(c) => <Input {...c} type="time" step={60} {...text("showEnd")} />}
          </Field>
        </div>
        <Field label="예상 관객 (명)" required hint="1명부터 500명까지 적을 수 있어요." error={errors.audience}>
          {(c) => <Input {...c} numeric inputMode="numeric" {...text("audience")} />}
        </Field>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>지역과 연락처</h2>
        <div className={styles.row2}>
          <Field label="시·도" required error={errors.sido}>
            {(c) => (
              <select {...c} className={styles.select} value={value.sido} onChange={(e) => onChange({ ...value, sido: e.target.value })}>
                <option value="">골라 주세요</option>
                {SIDO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="시·군·구" required error={errors.sigungu}>
            {(c) => <Input {...c} placeholder="예: 동구" {...text("sigungu")} />}
          </Field>
        </div>
        <Field
          label="대표 전화번호"
          optional
          hint={phoneHint ?? "안 남기시면 채팅으로 연락이 가요. 결제 전에는 업체에게 보이지 않아요."}
          error={errors.contactPhone}
        >
          {(c) => <Input {...c} inputMode="tel" {...text("contactPhone")} />}
        </Field>
      </section>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="lg">
          다음 단계
        </Button>
      </div>
    </form>
  );
}
