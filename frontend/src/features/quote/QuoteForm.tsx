/**
 * 견적서 쓰기 양식 (#41, 목업 p-quote.html · FR-QUOTE-02). 업체 화면.
 * - AC-F2-15: 품목·금액·포함 항목을 계약서 모양(camelCase, 원 단위 정수)으로 보낸다
 * - AC-F2-16: 견적서 이름(label)으로 기본형·고급형을 나눈다
 * - AC-F2-17: 합계 = 항목 합 − 업체할인. 할인 > 항목 합, 합계 < 10,000원이면 보내기 전에 막는다
 * - AC-F2-18: 공연장 단계만 내 공간·입실·설치 가능 시각 칸이 있고 필수다
 * - AC-F2-19: 장비·엔지니어 포함을 둘 다 고르면 "풀스펙"
 * - AC-F2-20: 고치기 모드(mode="edit")는 현재 버전 값으로 채우고, 이름(label)은 읽기 전용, 보내는 본문에 label 이 없다
 * 화면 합계는 입력 미리보기와 보내는 본문 값(totalAmount)으로만 쓴다. 최종 판정은 서버 검사(TOTAL_MISMATCH 등)를 따른다.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError } from "../../shared/api/client";
import type { PostingDetail, QuoteIn, QuoteStaffIn, QuoteVersionOut } from "../../shared/api/types";
import { Button } from "../../shared/ui/Button";
import { Field, Input, type ControlProps } from "../../shared/ui/Field";
import { ErrorNotice, fieldErrorOf } from "../../shared/ui/ErrorText";
import { formatWon, MoneyText } from "../../shared/ui/MoneyText";
import { Select } from "../../shared/ui/Select";
import { useMyVenues } from "./api";
import styles from "./Quote.module.css";

/** quote_versions.amount_* 가 INT UNSIGNED (backend quote/schemas.py MAX_AMOUNT) */
const MAX_AMOUNT = 4_294_967_295;
const MIN_TOTAL = 10_000;
const MSG_REQUIRED = "꼭 입력해 주세요.";
const MSG_VENUE_REQUIRED = "공연장 견적서에는 꼭 입력해 주세요.";
const MSG_DISCOUNT = "업체할인은 항목 합계보다 클 수 없어요.";
const MSG_MIN_TOTAL = "금액을 다시 확인해 주세요. 견적서 합계는 10,000원 이상이어야 해요.";
/** 서버가 합계 칸 아래에 보여 줄 오류 코드 (api-contract.md 3.3) */
const TOTAL_CODES = new Set(["TOTAL_MISMATCH", "TOTAL_TOO_LARGE"]);

interface Line {
  name: string;
  category: string;
  qty: number | null;
  unitPrice: number | null;
}

type Includes = QuoteIn["includes"];
type Money = number | null;
/** 고치기 본문의 내용 부분 (page 가 version 을 더해 PUT 한다) */
export type QuoteBodyIn = Omit<QuoteIn, "label">;

interface FormState {
  label: string;
  includes: Includes;
  venueId: string;
  checkinTime: string;
  setupAvailableTime: string;
  setupStart: string;
  setupMinutes: Money;
  teardownMinutes: Money;
  lines: Line[];
  transport: Money;
  install: Money;
  labor: Money;
  etc: Money;
  discount: Money;
  extraCostNote: string;
  techNote: string;
  /** 화면에 칸은 없지만 고칠 때 이전 값을 지우지 않게 그대로 다시 보낸다 */
  staff: QuoteStaffIn[];
  validUntil: string | null;
}

const EMPTY_LINE: Line = { name: "", category: "", qty: null, unitPrice: null };

function initial(stageType: PostingDetail["stageType"]): FormState {
  return {
    label: "",
    includes: { equipment: stageType === "EQUIPMENT", engineer: stageType === "ENGINEER", install: false, transport: false },
    venueId: "",
    checkinTime: "",
    setupAvailableTime: "",
    setupStart: "",
    setupMinutes: null,
    teardownMinutes: null,
    lines: [{ ...EMPTY_LINE }],
    transport: null,
    install: null,
    labor: null,
    etc: null,
    discount: null,
    extraCostNote: "",
    techNote: "",
    staff: [],
    validUntil: null,
  };
}

/** 0원은 빈칸으로 보여 준다 (보낼 때 다시 0) */
const blankZero = (n: number): Money => (n === 0 ? null : n);

/** AC-F2-20: 고칠 때 현재 버전 값으로 양식을 채운다 */
function fromVersion(v: QuoteVersionOut, label: string): FormState {
  return {
    label,
    includes: { equipment: v.includesEquipment, engineer: v.includesEngineer, install: v.includesInstall, transport: v.includesTransport },
    venueId: v.venueId === null ? "" : String(v.venueId),
    checkinTime: v.checkinTime ?? "",
    setupAvailableTime: v.setupAvailableTime ?? "",
    setupStart: v.setupStart ?? "",
    setupMinutes: v.setupMinutes,
    teardownMinutes: v.teardownMinutes,
    lines: v.items.length > 0 ? v.items.map((i) => ({ name: i.name, category: i.category, qty: i.qty, unitPrice: i.unitPrice })) : [{ ...EMPTY_LINE }],
    transport: blankZero(v.amountTransport),
    install: blankZero(v.amountInstall),
    labor: blankZero(v.amountLabor),
    etc: blankZero(v.amountEtc),
    discount: blankZero(v.discountAmount),
    extraCostNote: v.extraCostNote ?? "",
    techNote: v.techNote ?? "",
    staff: v.staff,
    validUntil: v.validUntil,
  };
}

/** 숫자만 남긴다 (소수점·쉼표·글자는 버림). maxDigits 로 안전한 정수 범위를 지킨다 */
function digitsOf(raw: string, maxDigits: number): Money {
  const d = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, maxDigits);
  return d === "" ? null : Number(d);
}

interface NumberInputProps extends Partial<ControlProps> {
  value: Money;
  onChange: (v: Money) => void;
  /** 금액: 천 단위 쉼표 + 최대 INT UNSIGNED */
  money?: boolean;
  maxDigits?: number;
  "aria-label"?: string;
}

/** 원 단위 정수만 받는 칸. 금액은 칸을 벗어나면 "1,500,000" 처럼 보여 준다 (입력 중에는 숫자만 — 커서가 튀지 않게) */
function NumberInput({ value, onChange, money = false, maxDigits = 5, ...rest }: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  const shown = value === null ? "" : money && !focused ? formatWon(value) : String(value);
  return (
    <Input
      {...rest}
      numeric
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const n = digitsOf(e.target.value, money ? 10 : maxDigits);
        onChange(n !== null && money ? Math.min(n, MAX_AMOUNT) : n);
      }}
    />
  );
}

const lineAmount = (l: Line) => (l.qty ?? 0) * (l.unitPrice ?? 0);
const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** 화면 미리보기용 합계. 서버가 같은 식으로 다시 검사한다 */
function totals(f: FormState) {
  const items = f.lines.reduce((s, l) => s + lineAmount(l), 0);
  const subtotal = items + (f.transport ?? 0) + (f.install ?? 0) + (f.labor ?? 0) + (f.etc ?? 0);
  const discount = f.discount ?? 0;
  return { items, subtotal, discount, total: subtotal - discount };
}

type Errors = Record<string, string>;

function validate(f: FormState, isVenue: boolean): Errors {
  const e: Errors = {};
  if (!f.label.trim()) e.label = MSG_REQUIRED;
  if (isVenue) {
    if (!f.venueId) e.venueId = MSG_VENUE_REQUIRED;
    if (!f.checkinTime) e.checkinTime = MSG_VENUE_REQUIRED;
    if (!f.setupAvailableTime) e.setupAvailableTime = MSG_VENUE_REQUIRED;
  }
  f.lines.forEach((l, i) => {
    if (!l.name.trim()) e[`items.${i}.name`] = "품목 이름을 적어 주세요.";
    if (!l.category.trim()) e[`items.${i}.category`] = "분류를 적어 주세요.";
    if (!l.qty) e[`items.${i}.qty`] = "수량은 1 이상이어야 해요.";
  });
  const t = totals(f);
  if (t.discount > t.subtotal) e.discountAmount = MSG_DISCOUNT;
  else if (t.total < MIN_TOTAL) e.totalAmount = MSG_MIN_TOTAL;
  return e;
}

function toBody(f: FormState, isVenue: boolean): QuoteIn {
  const t = totals(f);
  const body: QuoteIn = {
    label: f.label.trim(),
    venueId: isVenue ? Number(f.venueId) : null,
    items: f.lines.map((l) => ({
      name: l.name.trim(),
      category: l.category.trim(),
      qty: l.qty ?? 0,
      unitPrice: l.unitPrice ?? 0,
      amount: lineAmount(l),
    })),
    staff: f.staff,
    setupStart: f.setupStart || null,
    setupMinutes: f.setupMinutes,
    teardownMinutes: f.teardownMinutes,
    includes: f.includes,
    amounts: { items: t.items, transport: f.transport ?? 0, install: f.install ?? 0, labor: f.labor ?? 0, etc: f.etc ?? 0 },
    discountAmount: t.discount,
    totalAmount: t.total,
    extraCostNote: orNull(f.extraCostNote),
    techNote: orNull(f.techNote),
  };
  if (isVenue) {
    body.checkinTime = f.checkinTime;
    body.setupAvailableTime = f.setupAvailableTime;
  }
  if (f.validUntil) body.validUntil = f.validUntil;
  return body;
}

const INCLUDE_OPTIONS: { key: keyof Includes; label: string; hint?: string }[] = [
  { key: "equipment", label: "장비 포함" },
  { key: "engineer", label: "엔지니어 포함", hint: "사용자에게 엔지니어 단계 건너뛰기를 제안해요" },
  { key: "install", label: "설치 포함" },
  { key: "transport", label: "운반 포함" },
];

const AMOUNT_FIELDS: { key: "transport" | "install" | "labor" | "etc"; label: string }[] = [
  { key: "transport", label: "운반비" },
  { key: "install", label: "설치비" },
  { key: "labor", label: "인건비" },
  { key: "etc", label: "기타" },
];

interface CommonProps {
  posting: PostingDetail;
  /** 보내는 중이면 버튼을 끈다 (CLAUDE.md 6.2) */
  sending: boolean;
  /** 서버 오류 (fieldErrors 는 칸 아래, TOTAL_* 는 합계 아래, 그 밖은 위쪽 안내) */
  error: unknown;
}

/** 보내기(기본): 빈 양식, 본문에 label 포함 / 고치기: 현재 버전 값, 본문에 label 없음 (AC-F2-20) */
type Props =
  | (CommonProps & { mode?: "send"; onSubmit: (body: QuoteIn) => void })
  | (CommonProps & { mode: "edit"; label: string; current: QuoteVersionOut; onSubmit: (body: QuoteBodyIn) => void });

export function QuoteForm(props: Props) {
  const { posting, sending, error } = props;
  const isEdit = props.mode === "edit";
  const isVenue = posting.stageType === "VENUE";
  const [f, setF] = useState<FormState>(() => (props.mode === "edit" ? fromVersion(props.current, props.label) : initial(posting.stageType)));
  const [errors, setErrors] = useState<Errors>({});
  const venues = useMyVenues(isVenue);

  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }));
  const setLine = (i: number, patch: Partial<Line>) =>
    setF((prev) => ({ ...prev, lines: prev.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  /** 화면 검사 오류가 먼저, 없으면 서버 fieldErrors */
  const errorOf = (field: string) => errors[field] ?? fieldErrorOf(error, field);
  const apiCode = error instanceof ApiError ? error.body.code : undefined;
  const totalError = errors.totalAmount ?? (apiCode && TOTAL_CODES.has(apiCode) ? (error as ApiError).body.message : fieldErrorOf(error, "totalAmount"));
  const shownByField = apiCode !== undefined && TOTAL_CODES.has(apiCode);

  const t = totals(f);
  const fullSpec = f.includes.equipment && f.includes.engineer;

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = validate(f, isVenue);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = toBody(f, isVenue);
    if (props.mode === "edit") {
      const { label: _label, ...rest } = body;
      props.onSubmit(rest);
    } else props.onSubmit(body);
  }

  const venueOptions = (venues.data ?? []).map((v) => ({ value: String(v.id), label: `${v.name} (${v.sido} ${v.sigungu}, 최대 ${v.maxCapacity}명)` }));

  return (
    <form className={styles.withAside} noValidate onSubmit={submit}>
      <div>
        {!shownByField && <ErrorNotice error={error} />}

        <section className={styles.sec} aria-labelledby="quote-basic">
          <h2 id="quote-basic" className={styles.secTitle}>
            기본 정보
          </h2>
          <div className={styles.formRows}>
            {isEdit ? (
              <Field label="견적서 이름" hint="견적서 이름은 고칠 수 없어요.">
                {(c) => <Input {...c} readOnly value={f.label} />}
              </Field>
            ) : (
              <Field label="견적서 이름" required hint="한 공고에 여러 개 보낼 수 있어요. 예: 기본형, 고급형" error={errorOf("label")}>
                {(c) => <Input {...c} maxLength={30} value={f.label} onChange={(e) => set({ label: e.target.value })} />}
              </Field>
            )}

            <fieldset className={styles.checks}>
              <legend className={styles.legend}>
                포함
                {fullSpec && <span className={styles.tag}>풀스펙</span>}
              </legend>
              {INCLUDE_OPTIONS.map((o) => (
                <label key={o.key} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={f.includes[o.key]}
                    onChange={(e) => set({ includes: { ...f.includes, [o.key]: e.target.checked } })}
                  />
                  <span>
                    {o.label}
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                </label>
              ))}
            </fieldset>

            {isVenue && (
              <div className={styles.row3}>
                <Field
                  label="공간"
                  required
                  hint={venues.data && venues.data.length === 0 ? "먼저 공간을 등록해 주세요." : undefined}
                  error={errorOf("venueId")}
                >
                  {(c) => <Select {...c} value={f.venueId} options={venueOptions} onChange={(venueId) => set({ venueId })} placeholder="내 공간 고르기" />}
                </Field>
                <Field label="입실 시각" required error={errorOf("checkinTime")}>
                  {(c) => <Input {...c} type="time" step={60} value={f.checkinTime} onChange={(e) => set({ checkinTime: e.target.value })} />}
                </Field>
                <Field label="설치 가능 시각" required error={errorOf("setupAvailableTime")}>
                  {(c) => <Input {...c} type="time" step={60} value={f.setupAvailableTime} onChange={(e) => set({ setupAvailableTime: e.target.value })} />}
                </Field>
              </div>
            )}

            <div className={styles.row3}>
              <Field label="설치 시작" error={errorOf("setupStart")}>
                {(c) => <Input {...c} type="time" step={60} value={f.setupStart} onChange={(e) => set({ setupStart: e.target.value })} />}
              </Field>
              <Field label="설치 걸리는 시간 (분)" error={errorOf("setupMinutes")}>
                {(c) => <NumberInput {...c} value={f.setupMinutes} onChange={(setupMinutes) => set({ setupMinutes })} />}
              </Field>
              <Field label="철수 걸리는 시간 (분)" error={errorOf("teardownMinutes")}>
                {(c) => <NumberInput {...c} value={f.teardownMinutes} onChange={(teardownMinutes) => set({ teardownMinutes })} />}
              </Field>
            </div>
            <p className={styles.hint}>
              리허설 {posting.rehearsalStart} · 공연 {posting.showStart}~{posting.showEnd} 기준으로 서버가 자동 검사해요.
            </p>
          </div>
        </section>

        <section className={styles.sec} aria-labelledby="quote-lines">
          <h2 id="quote-lines" className={styles.secTitle}>
            품목
          </h2>
          <p className={styles.hint}>금액은 부가세 포함 원 단위로 적어요. 금액 = 수량 × 단가.</p>
          <div className={styles.tableBox}>
            <table className={styles.lines}>
              <thead>
                <tr>
                  <th>품목</th>
                  <th>분류</th>
                  <th className={styles.r}>수량</th>
                  <th className={styles.r}>단가</th>
                  <th className={styles.r}>금액</th>
                  <th>
                    <span className="sd-sr-only">지우기</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.lines.map((l, i) => {
                  const no = i + 1;
                  const lineErr = errorOf(`items.${i}.name`) ?? errorOf(`items.${i}.category`) ?? errorOf(`items.${i}.qty`) ?? errorOf(`items.${i}.unitPrice`);
                  return (
                    <tr key={i}>
                      <td>
                        <Input aria-label={`${no}번 품목 이름`} maxLength={100} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} />
                        {lineErr && <p className={styles.fieldError}>{lineErr}</p>}
                      </td>
                      <td>
                        <Input aria-label={`${no}번 분류`} maxLength={20} placeholder="예: 음향" value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} />
                      </td>
                      <td>
                        <NumberInput aria-label={`${no}번 수량`} value={l.qty} onChange={(qty) => setLine(i, { qty })} />
                      </td>
                      <td>
                        <NumberInput aria-label={`${no}번 단가`} money value={l.unitPrice} onChange={(unitPrice) => setLine(i, { unitPrice })} />
                      </td>
                      <td className={`${styles.r} sd-num`}>
                        <MoneyText value={lineAmount(l)} />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${no}번 품목 지우기`}
                          disabled={f.lines.length === 1}
                          onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })}
                        >
                          지우기
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>품목 합계</td>
                  <td className={`${styles.r} sd-num`}>
                    <MoneyText value={t.items} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <Button size="sm" className={styles.mt12} onClick={() => set({ lines: [...f.lines, { ...EMPTY_LINE }] })}>
            품목 추가
          </Button>
        </section>

        <section className={styles.sec} aria-labelledby="quote-amounts">
          <h2 id="quote-amounts" className={styles.secTitle}>
            금액
          </h2>
          <div className={styles.row4}>
            {AMOUNT_FIELDS.map((a) => (
              <Field key={a.key} label={a.label} error={errorOf(`amounts.${a.key}`)}>
                {(c) => <NumberInput {...c} money value={f[a.key]} onChange={(v) => set({ [a.key]: v })} />}
              </Field>
            ))}
          </div>
          <div className={styles.row4}>
            <Field label="업체할인" hint="항목 합계보다 클 수 없어요. 사용자에게는 − 금액으로 보여요." error={errorOf("discountAmount")}>
              {(c) => <NumberInput {...c} money value={f.discount} onChange={(discount) => set({ discount })} />}
            </Field>
          </div>
        </section>

        <section className={styles.sec} aria-labelledby="quote-notes">
          <h2 id="quote-notes" className={styles.secTitle}>
            안내
          </h2>
          <div className={styles.formRows}>
            <Field label="추가 비용 안내" hint="예: 주차비 별도" error={errorOf("extraCostNote")}>
              {(c) => <Input {...c} maxLength={500} value={f.extraCostNote} onChange={(e) => set({ extraCostNote: e.target.value })} />}
            </Field>
            <Field label="기술 메모" hint="전화번호·계좌번호·외부 링크는 적지 말아 주세요." error={errorOf("techNote")}>
              {(c) => <textarea {...c} className={styles.textarea} value={f.techNote} onChange={(e) => set({ techNote: e.target.value })} />}
            </Field>
          </div>
        </section>
      </div>

      <aside className={styles.sideBox} aria-label="보낼 견적서">
        <div className={styles.sideSec} data-testid="quote-total-box">
          <p className={styles.sideTitle}>
            {isEdit ? "고친 견적서" : "보낼 견적서"}
            {fullSpec && <span className={styles.tag}>풀스펙</span>}
          </p>
          <div className={styles.sumTotal}>
            <span>합계</span>
            <b data-testid="quote-total" className="sd-num">
              {formatWon(t.total)}원
            </b>
          </div>
          <dl className={styles.sumRows}>
            <div>
              <dt>항목 합계</dt>
              <dd data-testid="quote-subtotal" className="sd-num">
                {formatWon(t.subtotal)}원
              </dd>
            </div>
            <div>
              <dt>업체할인</dt>
              <dd className={`${styles.discount} sd-num`}>− {formatWon(t.discount)}원</dd>
            </div>
          </dl>
          {totalError && (
            <p className={styles.fieldError} role="alert">
              {totalError}
            </p>
          )}
          <p className={styles.hint}>부가세 포함 · 서버가 같은 식으로 다시 확인해요.</p>
        </div>
        <div className={styles.sideSec}>
          <Button type="submit" variant="primary" size="lg" block loading={sending}>
            {isEdit ? "고친 견적서 보내기" : "견적서 보내기"}
          </Button>
        </div>
      </aside>
    </form>
  );
}
