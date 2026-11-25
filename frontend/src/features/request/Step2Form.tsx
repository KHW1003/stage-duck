/**
 * 요청서 STEP2 필요한 것 (FR-REQ-02·03, 목업 v4 request-2.html). 항목마다 머리줄(아이콘 · 이름 · 필요해요/이미 있어요) + 아래 입력 표.
 * - AC-F2-08: "이미 있어요"면 그 항목의 입력 칸이 사라지고, 그 단계는 모집하지 않는다
 * - AC-F2-09: 원하는 장비 목록은 비어서 시작한다 (미리 들어 있는 장비가 없다)
 * - AC-F2-10: 엔지니어가 필요한데 작업이 0개면 넘어가지 않는다
 */
import { useId, type ReactNode } from "react";
import type { EngineerNeed, EquipmentNeed, PerformanceNeeds, VenueNeed } from "../../shared/api/types";
import type { KitIconName } from "../../shared/ui/kitIcons";
import { Ico } from "../../shared/ui/Ico";
import { TimeSelect } from "../../shared/ui/TimeSelect";
import { CONDITIONS, MUST_HAVE, SERVICES, TASKS, VENUE_TYPES } from "./codes";
import { Checks, Err, Hint, Row } from "./FormRow";
import type { Errors } from "./validate";
import "./request-v4.css";

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
const num = (v: string): number | null => (v.replace(/,/g, "").trim() === "" || Number.isNaN(Number(v.replace(/,/g, ""))) ? null : Number(v.replace(/,/g, "")));

export function Step2Form({ value, onChange, errors, onBack, onNext, lockNeeded = false, submitLabel = "확인하고 게시하기", submitting = false }: Props) {
  const id = useId();
  const f = (k: string) => `${id}-${k}`;
  const venue = (patch: Partial<VenueNeed>) => onChange({ ...value, venue: { ...value.venue, ...patch } });
  const equipment = (patch: Partial<EquipmentNeed>) => onChange({ ...value, equipment: { ...value.equipment, ...patch } });
  const engineer = (patch: Partial<EngineerNeed>) => onChange({ ...value, engineer: { ...value.engineer, ...patch } });
  const { items, owned } = value.equipment;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <p className="muted mt-24">이미 있는 것은 "이미 있어요"로 바꿔 주세요. 그 단계는 모집하지 않아요. 공연장 → 장비 → 엔지니어 순서로 차례로 구해요.</p>
      <Err msg={errors.needs} />

      <NeedSection icon="venue" title="공연장" desc="먼저 공연장을 정하고, 그다음 장비·엔지니어를 구해요." needed={value.venue.needed} locked={lockNeeded} onNeeded={(needed) => venue({ needed })} first>
        <Row label="공간 유형">
          <Checks legend="공간 유형" options={VENUE_TYPES} value={value.venue.types} onChange={(types) => venue({ types })} />
          <Hint>고르지 않으면 상관없음으로 보여요.</Hint>
        </Row>
        <Row label="필요 수용 인원" htmlFor={f("cap")}>
          <span className="unit" style={{ maxWidth: 200 }}>
            <input id={f("cap")} className="input input--num" inputMode="numeric" value={value.venue.capacity ?? ""} onChange={(e) => venue({ capacity: num(e.target.value) })} />
            <span>명</span>
          </span>
        </Row>
        <Row label="대관 예산" htmlFor={f("vbud")}>
          <span className="unit" style={{ maxWidth: 260 }}>
            <input id={f("vbud")} className="input input--num" inputMode="numeric" value={value.venue.budget ?? ""} onChange={(e) => venue({ budget: num(e.target.value) })} />
            <span>원</span>
          </span>
        </Row>
        <Row label="입실 · 퇴실">
          <span className="form-table__inline">
            <TimeSelect optional className="rq-time" aria-label="입실 희망" value={value.venue.checkinWish ?? ""} onChange={(v) => venue({ checkinWish: v || null })} />
            <span>~</span>
            <TimeSelect optional className="rq-time" aria-label="퇴실 희망" value={value.venue.checkoutWish ?? ""} onChange={(v) => venue({ checkoutWish: v || null })} />
            <label className="check">
              <input type="checkbox" checked={value.venue.proposalWanted} onChange={(e) => venue({ proposalWanted: e.target.checked })} />
              업체 제안 받기
            </label>
          </span>
        </Row>
        <Row label="꼭 필요한 조건">
          <Checks legend="꼭 필요한 조건" options={MUST_HAVE} value={value.venue.mustHave} onChange={(mustHave) => venue({ mustHave })} />
        </Row>
        <Note id={f("vnote")} value={value.venue.note} onChange={(note) => venue({ note })} error={errors["needs.venue.note"]} placeholder="예: 드럼 세트를 놓을 단상이 있으면 좋겠어요." />
      </NeedSection>

      <NeedSection icon="speaker" title="장비" desc={'장비를 잘 모르면 "업체 제안 받기"로 두세요.'} needed={value.equipment.needed} locked={lockNeeded} onNeeded={(needed) => equipment({ needed })}>
        <Row label="원하는 장비">
          <label className="check">
            <input type="checkbox" checked={value.equipment.proposalWanted} onChange={(e) => equipment({ proposalWanted: e.target.checked })} />
            <span>
              업체 제안 받기 <small>공연에 맞게 업체가 구성을 제안해요</small>
            </span>
          </label>
          {items.length > 0 && (
            <div className="rq-rows">
              {items.map((row, i) => (
                <div key={i} className="rq-row">
                  <input className="input" aria-label={`장비 이름 ${i + 1}`} placeholder="예: 보컬 마이크" value={row.name} onChange={(e) => equipment({ items: items.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />
                  <span className="unit">
                    <input className="input input--num" aria-label={`수량 ${i + 1}`} inputMode="numeric" value={row.qty} onChange={(e) => equipment({ items: items.map((r, j) => (j === i ? { ...r, qty: num(e.target.value) ?? 0 } : r)) })} />
                    <span>개</span>
                  </span>
                  <button className="icon-btn" type="button" aria-label={`장비 ${i + 1} 빼기`} onClick={() => equipment({ items: items.filter((_, j) => j !== i) })}>
                    <Ico name="trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn--sm" type="button" onClick={() => equipment({ items: [...items, { name: "", qty: 1 }] })}>
            <Ico name="plus" sm />
            장비 추가
          </button>
          {items.length === 0 && <Hint>미리 들어 있는 장비는 없어요.</Hint>}
        </Row>
        <Row label="필요한 서비스">
          <Checks legend="필요한 서비스" options={SERVICES} value={value.equipment.services} onChange={(services) => equipment({ services })} />
        </Row>
        <Row label="장비 예산" htmlFor={f("ebud")}>
          <span className="unit" style={{ maxWidth: 260 }}>
            <input id={f("ebud")} className="input input--num" inputMode="numeric" value={value.equipment.budget ?? ""} onChange={(e) => equipment({ budget: num(e.target.value) })} />
            <span>원</span>
          </span>
        </Row>
        <Row label="가지고 있는 장비">
          {owned.length > 0 && (
            <div className="rq-rows">
              {owned.map((row, i) => (
                <div key={i} className="rq-row rq-row--2">
                  <input className="input" aria-label={`가진 장비 ${i + 1}`} placeholder="예: 드럼 세트" value={row.name} onChange={(e) => equipment({ owned: owned.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />
                  <input className="input" aria-label={`자세히 ${i + 1}`} placeholder="예: 심벌 포함, 킥 페달 1" value={row.detail} onChange={(e) => equipment({ owned: owned.map((r, j) => (j === i ? { ...r, detail: e.target.value } : r)) })} />
                  <button className="icon-btn" type="button" aria-label={`가진 장비 ${i + 1} 빼기`} onClick={() => equipment({ owned: owned.filter((_, j) => j !== i) })}>
                    <Ico name="trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn--sm btn--ghost" type="button" onClick={() => equipment({ owned: [...owned, { name: "", detail: "" }] })}>
            <Ico name="plus" sm />
            가진 장비 추가
          </button>
          <Hint>자세히 적을수록 업체가 빠뜨리지 않아요.</Hint>
        </Row>
        <Note id={f("enote")} value={value.equipment.note} onChange={(note) => equipment({ note })} error={errors["needs.equipment.note"]} placeholder="예: 드럼 마이크 세트가 꼭 필요해요." />
      </NeedSection>

      <NeedSection icon="engineer" title="엔지니어" desc="해 줘야 할 작업을 하나 이상 골라 주세요." needed={value.engineer.needed} locked={lockNeeded} onNeeded={(needed) => engineer({ needed })}>
        <Row label="작업" required>
          <Checks legend="작업" options={TASKS} value={value.engineer.tasks} onChange={(tasks) => engineer({ tasks })} cols={2} />
          <Err msg={errors["needs.engineer.tasks"]} />
        </Row>
        <Row label="기타 작업" htmlFor={f("etc")}>
          <input id={f("etc")} className="input" placeholder="직접 입력" value={value.engineer.etc} onChange={(e) => engineer({ etc: e.target.value })} />
        </Row>
        <Row label="원하는 조건">
          <Checks legend="원하는 조건" options={CONDITIONS} value={value.engineer.conditions} onChange={(conditions) => engineer({ conditions })} />
        </Row>
        <Note id={f("gnote")} value={value.engineer.note} onChange={(note) => engineer({ note })} error={errors["needs.engineer.note"]} placeholder="예: 리허설부터 함께해 주시면 좋겠어요." />
      </NeedSection>

      <div className="notice mt-40">
        <Ico name="info" />
        <div>
          게시하면 <b>첫 단계 업체에게만</b> 공고가 보여요. 그 단계를 확정하고 [다음 단계로]를 누르면 다음 업체에게 열려요.
        </div>
      </div>
      <div className="btns btns--center mt-40">
        <button className="btn btn--lg" type="button" onClick={onBack} style={{ minWidth: 160 }}>
          이전
        </button>
        <button className="btn btn--primary btn--lg" type="submit" disabled={submitting} style={{ minWidth: 240 }}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

interface NeedProps {
  icon: KitIconName;
  title: string;
  desc: string;
  needed: boolean;
  locked: boolean;
  onNeeded: (needed: boolean) => void;
  children: ReactNode;
  first?: boolean;
}

/** 항목 하나: 머리줄 [필요해요 / 이미 있어요] + 필요할 때만 입력 표 */
function NeedSection({ icon, title, desc, needed, locked, onNeeded, children, first = false }: NeedProps) {
  const id = useId();
  return (
    <section className={first ? "need mt-24" : "need"} aria-labelledby={`${id}-title`}>
      <div className="need__head">
        <span className="ico-box ico-box--lg">
          <Ico name={icon} />
        </span>
        <div className="need__title">
          <b id={`${id}-title`}>{title}</b>
          <small>{desc}</small>
        </div>
        <fieldset className="toggle" disabled={locked}>
          <legend>{title} 필요 여부</legend>
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
      {needed ? <div className="form-table">{children}</div> : <p className="need-off">이미 있어요 — 이 단계는 모집하지 않아요.</p>}
    </section>
  );
}

function Note({ id, value, onChange, error, placeholder }: { id: string; value: string; onChange: (v: string) => void; error?: string; placeholder: string }) {
  return (
    <Row label="추가 요청" htmlFor={id}>
      <textarea id={id} className="textarea" maxLength={500} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} />
      <Err msg={error} />
    </Row>
  );
}
