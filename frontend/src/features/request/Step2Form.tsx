/**
 * 요청서 STEP2 필요한 것 (FR-REQ-02·03, 목업 request-2.html).
 * - AC-F2-08: "이미 있어요"면 그 항목의 입력 칸이 사라지고, 그 단계는 모집하지 않는다
 * - AC-F2-09: 원하는 장비 목록은 비어서 시작한다 (미리 들어 있는 장비가 없다)
 * - AC-F2-10: 엔지니어가 필요한데 작업이 0개면 넘어가지 않는다
 */
import { useId, type ReactNode } from "react";
import type { EngineerNeed, EquipmentNeed, PerformanceNeeds, VenueNeed } from "../../shared/api/types";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { Choices } from "./Choices";
import { CONDITIONS, MUST_HAVE, SERVICES, TASKS, VENUE_TYPES } from "./codes";
import type { Errors } from "./validate";
import styles from "./Request.module.css";

interface Props {
  value: PerformanceNeeds;
  onChange: (next: PerformanceNeeds) => void;
  errors: Errors;
  onBack: () => void;
  onNext: () => void;
  /** 게시한 뒤 수정: 필요해요/이미 있어요를 바꿀 수 없다 (#37) */
  lockNeeded?: boolean;
  submitLabel?: string;
  submitting?: boolean;
}

/** 숫자 칸: 비우면 null */
const num = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function Step2Form({ value, onChange, errors, onBack, onNext, lockNeeded = false, submitLabel = "확인하고 게시하기", submitting = false }: Props) {
  const venue = (patch: Partial<VenueNeed>) => onChange({ ...value, venue: { ...value.venue, ...patch } });
  const equipment = (patch: Partial<EquipmentNeed>) => onChange({ ...value, equipment: { ...value.equipment, ...patch } });
  const engineer = (patch: Partial<EngineerNeed>) => onChange({ ...value, engineer: { ...value.engineer, ...patch } });
  const { items, owned } = value.equipment;

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <p className={styles.notice}>
        이미 있는 것은 "이미 있어요"로 바꿔 주세요. 그 단계는 모집하지 않아요. 공연장 → 장비 → 엔지니어 순서로 차례로 구해요.
      </p>
      {errors.needs && (
        <p className={styles.fieldError} role="alert">
          {errors.needs}
        </p>
      )}

      <NeedSection no="01" title="공연장" desc="먼저 공연장을 정하고, 그다음 장비·엔지니어를 구해요." needed={value.venue.needed} locked={lockNeeded} onNeeded={(needed) => venue({ needed })}>
        <Choices legend="공간 유형" options={VENUE_TYPES} value={value.venue.types} onChange={(types) => venue({ types })} hint="고르지 않으면 상관없음으로 보여요." />
        <div className={styles.row2}>
          <Field label="필요 수용 인원 (명)">
            {(c) => <Input {...c} numeric inputMode="numeric" value={value.venue.capacity ?? ""} onChange={(e) => venue({ capacity: num(e.target.value) })} />}
          </Field>
          <Field label="대관 예산 (원)" optional>
            {(c) => <Input {...c} numeric inputMode="numeric" value={value.venue.budget ?? ""} onChange={(e) => venue({ budget: num(e.target.value) })} />}
          </Field>
        </div>
        <div className={styles.row2}>
          <Field label="입실 희망" optional>
            {(c) => <Input {...c} type="time" step={60} value={value.venue.checkinWish ?? ""} onChange={(e) => venue({ checkinWish: e.target.value || null })} />}
          </Field>
          <Field label="퇴실 희망" optional>
            {(c) => <Input {...c} type="time" step={60} value={value.venue.checkoutWish ?? ""} onChange={(e) => venue({ checkoutWish: e.target.value || null })} />}
          </Field>
        </div>
        <label className={styles.chip}>
          <input type="checkbox" checked={value.venue.proposalWanted} onChange={(e) => venue({ proposalWanted: e.target.checked })} />
          입실·퇴실은 업체 제안 받기
        </label>
        <Choices legend="꼭 필요한 조건" options={MUST_HAVE} value={value.venue.mustHave} onChange={(mustHave) => venue({ mustHave })} />
        <Note value={value.venue.note} onChange={(note) => venue({ note })} error={errors["needs.venue.note"]} />
      </NeedSection>

      <NeedSection no="02" title="장비" desc={'장비를 잘 모르면 "업체 제안 받기"로 두세요.'} needed={value.equipment.needed} locked={lockNeeded} onNeeded={(needed) => equipment({ needed })}>
        <div>
          <p className={styles.legend}>원하는 장비</p>
          <label className={styles.chip}>
            <input type="checkbox" checked={value.equipment.proposalWanted} onChange={(e) => equipment({ proposalWanted: e.target.checked })} />
            업체 제안 받기 (공연에 맞게 업체가 구성을 제안해요)
          </label>
          <div className={styles.rows}>
            {items.length === 0 && <p className={styles.empty}>미리 들어 있는 장비는 없어요.</p>}
            {items.map((row, i) => (
              <div key={i} className={styles.listRow}>
                <Field label={`장비 이름 ${i + 1}`}>
                  {(c) => <Input {...c} placeholder="예: 보컬 마이크" value={row.name} onChange={(e) => equipment({ items: items.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />}
                </Field>
                <Field label={`수량 ${i + 1}`}>
                  {(c) => <Input {...c} numeric inputMode="numeric" value={row.qty} onChange={(e) => equipment({ items: items.map((r, j) => (j === i ? { ...r, qty: num(e.target.value) ?? 0 } : r)) })} />}
                </Field>
                <Button variant="ghost" onClick={() => equipment({ items: items.filter((_, j) => j !== i) })}>
                  빼기
                </Button>
              </div>
            ))}
          </div>
          <Button variant="line" size="sm" onClick={() => equipment({ items: [...items, { name: "", qty: 1 }] })}>
            장비 추가
          </Button>
        </div>
        <Choices legend="필요한 서비스" options={SERVICES} value={value.equipment.services} onChange={(services) => equipment({ services })} />
        <Field label="장비 예산 (원)" optional>
          {(c) => <Input {...c} numeric inputMode="numeric" value={value.equipment.budget ?? ""} onChange={(e) => equipment({ budget: num(e.target.value) })} />}
        </Field>
        <div>
          <p className={styles.legend}>
            가지고 있는 장비 <span className={styles.hint}>자세히 적을수록 업체가 빠뜨리지 않아요.</span>
          </p>
          <div className={styles.rows}>
            {owned.map((row, i) => (
              <div key={i} className={styles.listRow}>
                <Field label={`가진 장비 ${i + 1}`}>
                  {(c) => <Input {...c} placeholder="예: 드럼 세트" value={row.name} onChange={(e) => equipment({ owned: owned.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />}
                </Field>
                <Field label={`자세히 ${i + 1}`}>
                  {(c) => <Input {...c} placeholder="예: 심벌 포함" value={row.detail} onChange={(e) => equipment({ owned: owned.map((r, j) => (j === i ? { ...r, detail: e.target.value } : r)) })} />}
                </Field>
                <Button variant="ghost" onClick={() => equipment({ owned: owned.filter((_, j) => j !== i) })}>
                  빼기
                </Button>
              </div>
            ))}
          </div>
          <Button variant="line" size="sm" onClick={() => equipment({ owned: [...owned, { name: "", detail: "" }] })}>
            가진 장비 추가
          </Button>
        </div>
        <Note value={value.equipment.note} onChange={(note) => equipment({ note })} error={errors["needs.equipment.note"]} />
      </NeedSection>

      <NeedSection no="03" title="엔지니어" desc="해 줘야 할 작업을 하나 이상 골라 주세요." needed={value.engineer.needed} locked={lockNeeded} onNeeded={(needed) => engineer({ needed })}>
        <Choices legend="작업" required options={TASKS} value={value.engineer.tasks} onChange={(tasks) => engineer({ tasks })} error={errors["needs.engineer.tasks"]} />
        <Field label="기타 작업 (직접 입력)" optional>
          {(c) => <Input {...c} value={value.engineer.etc} onChange={(e) => engineer({ etc: e.target.value })} />}
        </Field>
        <Choices legend="원하는 조건" options={CONDITIONS} value={value.engineer.conditions} onChange={(conditions) => engineer({ conditions })} />
        <Note value={value.engineer.note} onChange={(note) => engineer({ note })} error={errors["needs.engineer.note"]} />
      </NeedSection>

      <p className={styles.hint}>게시하면 첫 단계 업체에게만 공고가 보여요. 그 단계를 확정하고 [다음 단계로]를 누르면 다음 업체에게 열려요.</p>
      <div className={styles.actions}>
        <Button variant="ghost" size="lg" onClick={onBack}>
          이전
        </Button>
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface NeedProps {
  no: string;
  title: string;
  desc: string;
  needed: boolean;
  locked: boolean;
  onNeeded: (needed: boolean) => void;
  children: ReactNode;
}

/** 항목 하나: 머리줄 [필요해요 / 이미 있어요] + 필요할 때만 입력 칸 */
function NeedSection({ no, title, desc, needed, locked, onNeeded, children }: NeedProps) {
  const id = useId();
  return (
    <section className={styles.need} aria-labelledby={`${id}-title`}>
      <div className={styles.needHead}>
        <span className={styles.needNo}>{no}</span>
        <div className={styles.needTitle}>
          <b id={`${id}-title`}>{title}</b>
          <small>{desc}</small>
        </div>
        <fieldset className={styles.toggle} disabled={locked}>
          <legend className="sd-sr-only">{title} 필요 여부</legend>
          <label>
            <input type="radio" name={`${id}-needed`} checked={needed} onChange={() => onNeeded(true)} />
            필요해요
          </label>
          <label>
            <input type="radio" name={`${id}-needed`} checked={!needed} onChange={() => onNeeded(false)} />
            이미 있어요
          </label>
        </fieldset>
      </div>
      {needed ? <div className={styles.needBody}>{children}</div> : <p className={styles.needOff}>이미 있어요 — 이 단계는 모집하지 않아요.</p>}
    </section>
  );
}

function Note({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  return (
    <div>
      <label className={styles.legend} htmlFor={id}>
        추가 요청 <span className={styles.hint}>(선택, 500자까지)</span>
      </label>
      <textarea id={id} className={styles.textarea} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  );
}
