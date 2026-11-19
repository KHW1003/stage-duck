/**
 * 요청서 STEP1 공연 기본 정보 (FR-REQ-01, 목업 v4 request-1.html). AC-F2-04·05·06: 틀리면 넘어가지 않고 칸 아래에 이유.
 * 표 모양(.form-table): 공연 / 날짜와 시간 / 지역과 연락처 세 묶음. 공연 형태는 아이콘 타일.
 */
import { useId, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import type { KitIconName } from "../../shared/ui/kitIcons";
import { Ico } from "../../shared/ui/Ico";
import { FORMS, SIDO } from "./codes";
import { Err, Hint, Row } from "./FormRow";
import type { Errors, Step1Form as Form } from "./validate";
import "./request-v4.css";

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

const FORM_ICON: Record<string, KitIconName> = { BAND: "music", THEATER: "ticket", TALK_EVENT: "mic", RELIGIOUS: "church", ETC: "more" };

export function Step1Form({ value, onChange, errors, minDate, onNext, phoneHint }: Props) {
  const id = useId();
  const f = (k: string) => `${id}-${k}`;
  const text = (key: TextKey) => ({
    id: f(key),
    value: value[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value }),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": [key === "rehearsalStart" ? f("time-hint") : "", errors[key] ? f(`${key}-err`) : ""].filter(Boolean).join(" ") || undefined,
  });
  const setLineup = (lineup: Form["lineup"]) => onChange({ ...value, lineup });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <section className="sec mt-40" aria-labelledby={f("s1")}>
        <div className="sec-head">
          <h2 id={f("s1")}>
            <Ico name="music" />
            공연
          </h2>
          <p>
            <span style={{ color: "var(--sd-conflict-text)" }}>*</span> 꼭 적어야 해요
          </p>
        </div>
        <div className="form-table">
          <Row label="공연명" required htmlFor={f("title")}>
            <input className="input wide" maxLength={100} {...text("title")} />
            <Err id={f("title-err")} msg={errors.title} />
          </Row>
          <Row label="공연 형태" required>
            <fieldset className="rq-fieldset" aria-invalid={errors.form ? true : undefined}>
              <legend>공연 형태</legend>
              <div className="cat-tiles" style={{ ["--cols" as string]: FORMS.length }}>
                {FORMS.map((o) => (
                  <label key={o.value}>
                    <input type="radio" name={f("form")} value={o.value} checked={value.form === o.value} onChange={() => onChange({ ...value, form: o.value })} />
                    <Ico name={FORM_ICON[o.value] ?? "more"} />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Err msg={errors.form} />
          </Row>
          <Row label="편성">
            {value.lineup.length > 0 && (
              <div className="rq-rows">
                {value.lineup.map((row, i) => (
                  <div key={i} className="rq-row">
                    <input
                      className="input"
                      aria-label={`파트 ${i + 1}`}
                      placeholder="예: 보컬"
                      value={row.part}
                      onChange={(e) => setLineup(value.lineup.map((r, j) => (j === i ? { ...r, part: e.target.value } : r)))}
                    />
                    <span className="unit">
                      <input
                        className="input input--num"
                        aria-label={`인원 ${i + 1}`}
                        inputMode="numeric"
                        value={row.count}
                        onChange={(e) => setLineup(value.lineup.map((r, j) => (j === i ? { ...r, count: e.target.value } : r)))}
                      />
                      <span>명</span>
                    </span>
                    <button className="icon-btn" type="button" aria-label={`파트 ${i + 1} 빼기`} onClick={() => setLineup(value.lineup.filter((_, j) => j !== i))}>
                      <Ico name="trash" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setLineup([...value.lineup, { part: "", count: "1" }])}>
              <Ico name="plus" sm />
              편성 추가
            </button>
            <Hint>업체가 장비 구성을 정할 때 봐요.</Hint>
          </Row>
        </div>
      </section>

      <section className="sec" aria-labelledby={f("s2")}>
        <div className="sec-head">
          <h2 id={f("s2")}>
            <Ico name="calendar" />
            날짜와 시간
          </h2>
          <p>공연 14일 전까지만 요청할 수 있어요.</p>
        </div>
        <div className="form-table">
          <Row label="공연 날짜" required htmlFor={f("showDate")}>
            <input className="input" type="date" min={minDate} style={{ maxWidth: 220 }} {...text("showDate")} />
            <Err id={f("showDate-err")} msg={errors.showDate} />
          </Row>
          <Row label="시간" required>
            <span className="form-table__inline">
              <span className="small muted">리허설</span>
              <input className="input" type="time" step={60} aria-label="리허설 시작" {...text("rehearsalStart")} />
              <span className="small muted">공연</span>
              <input className="input" type="time" step={60} aria-label="공연 시작" {...text("showStart")} />
              <span>~</span>
              <input className="input" type="time" step={60} aria-label="공연 종료" {...text("showEnd")} />
            </span>
            <Err id={f("rehearsalStart-err")} msg={errors.rehearsalStart} />
            <Err id={f("showStart-err")} msg={errors.showStart} />
            <Err id={f("showEnd-err")} msg={errors.showEnd} />
            <Hint id={f("time-hint")}>리허설 시작 전에 장비 설치가 끝나야 해요. 철수는 공연이 끝난 뒤에 해요.</Hint>
          </Row>
          <Row label="예상 관객" required htmlFor={f("audience")}>
            <span className="unit" style={{ maxWidth: 200 }}>
              <input className="input input--num" inputMode="numeric" {...text("audience")} />
              <span>명</span>
            </span>
            <Err id={f("audience-err")} msg={errors.audience} />
            {!errors.audience && <Hint>1명부터 500명까지 적을 수 있어요.</Hint>}
          </Row>
        </div>
      </section>

      <section className="sec" aria-labelledby={f("s3")}>
        <div className="sec-head">
          <h2 id={f("s3")}>
            <Ico name="users" />
            지역과 연락처
          </h2>
        </div>
        <div className="form-table">
          <Row label="지역" required>
            <span className="form-table__inline">
              <select
                className="select"
                aria-label="시·도"
                value={value.sido}
                onChange={(e) => onChange({ ...value, sido: e.target.value })}
                aria-invalid={errors.sido ? true : undefined}
              >
                <option value="">시·도 골라 주세요</option>
                {SIDO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input className="input" aria-label="시·군·구" placeholder="예: 동구" {...text("sigungu")} />
            </span>
            <Err msg={errors.sido} />
            <Err id={f("sigungu-err")} msg={errors.sigungu} />
          </Row>
          <Row label="대표 전화번호" htmlFor={f("contactPhone")}>
            <input className="input" inputMode="tel" placeholder="010-0000-0000" {...text("contactPhone")} />
            <Err id={f("contactPhone-err")} msg={errors.contactPhone} />
            <Hint>{phoneHint ?? "안 남기시면 채팅으로 연락이 가요. 결제 전에는 업체에게 보이지 않아요."}</Hint>
          </Row>
        </div>
      </section>

      <div className="btns btns--center mt-40">
        <Link className="btn btn--lg" to="/me/performances" style={{ minWidth: 160 }}>
          나중에 쓰기
        </Link>
        <button className="btn btn--primary btn--lg" type="submit" style={{ minWidth: 240 }}>
          다음 단계
        </button>
      </div>
    </form>
  );
}
