/**
 * 사용자 가입 (/signup). 목업: mockup-v4/pages/signup.html · FR-AUTH-01 · AC-F1-01~03
 * StepBar(가입 유형 → 정보 입력 → 완료) + 가입 유형 고르기 + 정보 표 + 약관 동의.
 * - [업체로 입점할래요]를 고르면 업체 가입(/signup/supplier)으로 간다
 * - 칸 오류는 화면에서 먼저 보고(빈 칸·비밀번호·만 14세), 서버가 돌려준 fieldErrors 도 같은 칸 아래에 보여 준다
 * - 가입이 끝나면 같은 자리에서 완료 안내로 바뀐다 (서버가 성공을 확인한 뒤)
 * 받지 않는 정보: 주소. 네이버 추가 정보(social) 모드는 네이버 로그인이 생기면 붙인다.
 */
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { checkAvailable, useSignup, type SignupRequest } from "../features/auth/api";
import { usePageMeta } from "../features/seo/usePageMeta";
import { ApiError } from "../shared/api/client";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { DateField, yearsFromNow } from "../shared/ui/DateField";
import { DoneView } from "../shared/ui/DoneView";
import { Ico } from "../shared/ui/Ico";
import "./signup.css";

const PURPOSES = ["밴드 공연", "연극·뮤지컬", "강연·행사", "종교 행사", "기타"];
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

type Form = { name: string; nickname: string; email: string; password: string; password2: string; phone: string; birthDate: string; purpose: string };
type Field = keyof Form;
const EMPTY: Form = { name: "", nickname: "", email: "", password: "", password2: "", phone: "", birthDate: "", purpose: PURPOSES[0] };

/** 만 나이 (생일이 지났는지까지 본다) */
export function ageOn(birth: string, today = new Date()): number {
  const [y, m, d] = birth.split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export function localErrors(f: Form, today = new Date()): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (!f.name.trim()) e.name = "이름을 적어 주세요.";
  if (!f.nickname.trim()) e.nickname = "닉네임을 적어 주세요.";
  if (!f.email.trim()) e.email = "이메일을 적어 주세요.";
  if (!PASSWORD_RE.test(f.password)) e.password = "8자 이상, 영문과 숫자를 함께 써 주세요.";
  if (f.password2 !== f.password) e.password2 = "비밀번호가 서로 달라요.";
  if (!/^\d{9,11}$/.test(f.phone.replace(/-/g, ""))) e.phone = "전화번호는 숫자 9~11자리로 적어 주세요.";
  if (!f.birthDate) e.birthDate = "생년월일을 적어 주세요.";
  else if (ageOn(f.birthDate, today) < 14) e.birthDate = "만 14세 이상만 가입할 수 있어요.";
  return e;
}

const SERVER_FIELD: Record<string, Field> = { name: "name", nickname: "nickname", email: "email", password: "password", phone: "phone", birthDate: "birthDate", signupPurpose: "purpose" };

function Row({ label, req = true, error, hint, children }: { label: string; req?: boolean; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <span className="form-table__th">
        {label}
        {req && <span className="req">*</span>}
      </span>
      <span className="form-table__td">
        {children}
        {error ? (
          <span className="field__error">
            <Ico name="warn" sm />
            {error}
          </span>
        ) : (
          hint && <span className="field__hint">{hint}</span>
        )}
      </span>
    </div>
  );
}

export function SignupPage() {
  usePageMeta("가입하기");
  const navigate = useNavigate();
  const signup = useSignup();
  const [form, setForm] = useState<Form>(EMPTY);
  const [tried, setTried] = useState(false);
  const [terms, setTerms] = useState({ service: false, privacy: false, marketing: false });
  type Dup = "email" | "nickname";
  const [avail, setAvail] = useState<Partial<Record<Dup, { value: string; ok: boolean; msg: string }>>>({});
  const [checking, setChecking] = useState<Dup | null>(null);
  const [done, setDone] = useState<{ nickname: string; email: string } | null>(null);

  const set = (k: Field) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const local = useMemo(() => (tried ? localErrors(form) : {}), [tried, form]);
  const server = useMemo(() => {
    const out: Partial<Record<Field, string>> = {};
    if (signup.error instanceof ApiError) for (const fe of signup.error.body.fieldErrors) out[SERVER_FIELD[fe.field] ?? "name"] = fe.reason;
    return out;
  }, [signup.error]);
  /** [중복 확인] 결과 — 그 뒤로 칸을 고치면 지운다 */
  const dup = (k: Dup) => (avail[k]?.value === form[k].trim() ? avail[k] : undefined);
  const err = (k: Field) => local[k] ?? server[k] ?? (k === "email" || k === "nickname" ? (dup(k)?.ok === false ? dup(k)!.msg : undefined) : undefined);
  const check = async (k: Dup) => {
    const value = form[k].trim();
    setChecking(k);
    try {
      const r = await checkAvailable(k, value);
      setAvail((a) => ({ ...a, [k]: { value, ok: r.available, msg: r.message } }));
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body.fieldErrors[0]?.reason ?? e.body.message) : "확인하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
      setAvail((a) => ({ ...a, [k]: { value, ok: false, msg } }));
    } finally {
      setChecking(null);
    }
  };
  const okHint = (k: Dup, fallback?: ReactNode) =>
    dup(k)?.ok ? (
      <span style={{ color: "var(--sd-pass-text)" }}>
        <Ico name="check" sm /> {dup(k)!.msg}
      </span>
    ) : (
      fallback
    );
  const all = terms.service && terms.privacy && terms.marketing;
  const required = terms.service && terms.privacy;
  const generalError = signup.error instanceof ApiError && signup.error.body.fieldErrors.length === 0 ? signup.error.body.message : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(localErrors(form)).length || !required) return;
    const body: SignupRequest = {
      name: form.name.trim(),
      nickname: form.nickname.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.replace(/-/g, ""),
      birthDate: form.birthDate || null,
      signupPurpose: form.purpose,
      agreements: { service: terms.service, privacyRequired: terms.privacy, privacyOptional: false, marketing: terms.marketing },
    };
    signup.mutate(body, { onSuccess: () => (setDone({ nickname: body.nickname, email: body.email }), window.scrollTo(0, 0)) });
  };

  if (done) {
    return (
      <>
        <KitPageTop title="가입하기" crumbs={[{ label: "가입" }]} />
        <main className="container container--narrow main">
          <ol className="step-bar">
            <li className="is-done">
              <b>01</b>
              <Ico name="users" />
              가입 유형
            </li>
            <li className="is-done">
              <b>02</b>
              <Ico name="edit" />
              정보 입력
            </li>
            <li className="is-now">
              <b>03</b>
              <Ico name="check" />
              완료
            </li>
          </ol>
          <DoneView
            title="가입이 완료됐어요"
            desc={`${done.nickname}님, 환영해요.`}
            rows={[
              ["닉네임", done.nickname, true],
              ["이메일", done.email],
              ["가입 유형", "사용자 (공연을 준비해요)"],
            ]}
            next="요청서를 한 번만 쓰면 공연장부터 차례로 견적서를 받을 수 있어요."
            actions={[
              { label: "공간 둘러보기", to: "/venues" },
              { label: "요청서 쓰기", to: "/performances/new", primary: true },
            ]}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <KitPageTop title="가입하기" crumbs={[{ label: "가입" }]} />
      <main className="container container--narrow main">
        <ol className="step-bar">
          <li className="is-done">
            <b>01</b>
            <Ico name="users" />
            가입 유형
          </li>
          <li className="is-now">
            <b>02</b>
            <Ico name="edit" />
            정보 입력
          </li>
          <li>
            <b>03</b>
            <Ico name="check" />
            완료
          </li>
        </ol>
        <form onSubmit={submit} noValidate>
          <section className="sec mt-40">
            <div className="sec-head">
              <h2>
                <Ico name="users" />
                가입 유형
              </h2>
            </div>
            <div className="choice choice--photo">
              <label className="choice__item">
                <input type="radio" name="role" defaultChecked />
                <span className="choice__photo" style={{ "--img": "url('/photos/photo-1598387993441-a364f854c3e1.jpg')" } as CSSProperties} role="img" aria-label="밴드 공연 사진" />
                <span>
                  <span className="choice__mark" />
                  <span>
                    <b>공연을 준비해요</b>
                    <small>요청서를 쓰고 공연장·장비·엔지니어 견적서를 받아요.</small>
                  </span>
                </span>
              </label>
              <label className="choice__item">
                <input type="radio" name="role" onChange={() => navigate("/signup/supplier")} />
                <span className="choice__photo" style={{ "--img": "url('/photos/photo-1524230659092-07f99a75c013.jpg')" } as CSSProperties} role="img" aria-label="공연 장비 사진" />
                <span>
                  <span className="choice__mark" />
                  <span>
                    <b>업체로 입점할래요</b>
                    <small>공간·장비·엔지니어 업체예요. 입점 신청으로 이어져요.</small>
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="sec">
            <div className="sec-head">
              <h2>
                <Ico name="edit" />
                정보 입력
              </h2>
              <p>
                <span className="req signup__req">*</span> 표시는 꼭 적어야 해요. 이름·연락처는 업체에게 보이지 않아요.
              </p>
            </div>
            <div className="form-table">
              <Row label="이름" error={err("name")}>
                <input className="input" value={form.name} onChange={set("name")} placeholder="이름" aria-label="이름" aria-invalid={!!err("name")} autoComplete="name" />
              </Row>
              <Row label="닉네임" error={err("nickname")} hint={okHint("nickname", "업체에게는 닉네임만 보여요.")}>
                <span className="form-table__inline">
                  <input className="input signup__short" value={form.nickname} onChange={set("nickname")} aria-label="닉네임" aria-invalid={!!err("nickname")} />
                  <button className="btn btn--sm" type="button" onClick={() => check("nickname")} disabled={checking === "nickname"} aria-label="닉네임 중복 확인">
                    {checking === "nickname" ? "확인 중…" : "중복 확인"}
                  </button>
                </span>
              </Row>
              <Row label="이메일" error={err("email")} hint={okHint("email")}>
                <span className="form-table__inline">
                  <input className="input signup__email" type="email" value={form.email} onChange={set("email")} aria-label="이메일" aria-invalid={!!err("email")} autoComplete="email" />
                  <button className="btn btn--sm" type="button" onClick={() => check("email")} disabled={checking === "email"} aria-label="이메일 중복 확인">
                    {checking === "email" ? "확인 중…" : "중복 확인"}
                  </button>
                </span>
              </Row>
              <Row label="비밀번호" error={err("password")} hint="8자 이상, 영문과 숫자를 함께 써 주세요.">
                <input className="input" type="password" value={form.password} onChange={set("password")} aria-label="비밀번호" aria-invalid={!!err("password")} autoComplete="new-password" />
              </Row>
              <Row label="비밀번호 확인" error={err("password2")}>
                <input className="input" type="password" value={form.password2} onChange={set("password2")} aria-label="비밀번호 확인" aria-invalid={!!err("password2")} autoComplete="new-password" />
              </Row>
              <Row label="전화번호" error={err("phone")}>
                <input className="input" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="010-0000-0000" aria-label="전화번호" aria-invalid={!!err("phone")} autoComplete="tel" />
              </Row>
              <Row label="생년월일" error={err("birthDate")}>
                <DateField
                  value={form.birthDate}
                  onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))}
                  min={yearsFromNow(-100)}
                  max={yearsFromNow(0)}
                  initialMonth={yearsFromNow(-25)}
                  placeholder="생년월일을 골라 주세요"
                  aria-label="생년월일"
                  aria-invalid={!!err("birthDate")}
                />
              </Row>
              <Row label="가입 목적" req={false}>
                <select className="select signup__short" value={form.purpose} onChange={set("purpose")} aria-label="가입 목적">
                  {PURPOSES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Row>
            </div>
          </section>

          <section className="sec">
            <div className="sec-head">
              <h2>
                <Ico name="shield" />
                약관 동의
              </h2>
            </div>
            <div className="list">
              <div className="list__item">
                <label className="check strong">
                  <input type="checkbox" checked={all} onChange={(e) => setTerms({ service: e.target.checked, privacy: e.target.checked, marketing: e.target.checked })} />
                  전체 동의
                </label>
                <span />
              </div>
              <div className="list__item">
                <label className="check">
                  <input type="checkbox" checked={terms.service} onChange={(e) => setTerms((t) => ({ ...t, service: e.target.checked }))} />
                  STAGE DUCK 이용약관 (필수)
                </label>
                <Link className="link" to="/terms/service">
                  보기
                </Link>
              </div>
              <div className="list__item">
                <label className="check">
                  <input type="checkbox" checked={terms.privacy} onChange={(e) => setTerms((t) => ({ ...t, privacy: e.target.checked }))} />
                  <span>
                    개인정보 수집·이용 (필수)
                    <small>이름, 전화번호, 이메일, 생년월일, 닉네임. 주소는 받지 않아요.</small>
                  </span>
                </label>
                <Link className="link" to="/terms/privacy">
                  보기
                </Link>
              </div>
              <div className="list__item">
                <label className="check">
                  <input type="checkbox" checked={terms.marketing} onChange={(e) => setTerms((t) => ({ ...t, marketing: e.target.checked }))} />
                  마케팅 정보 받기 (선택)
                </label>
                <Link className="link" to="/terms/service">
                  보기
                </Link>
              </div>
            </div>
            {tried && !required && (
              <p className="field__error mt-8" role="alert">
                <Ico name="warn" sm />
                필수 약관에 동의해 주세요.
              </p>
            )}
            {generalError && (
              <div className="notice notice--conflict mt-16" role="alert">
                <Ico name="warn" />
                <div>{generalError}</div>
              </div>
            )}
          </section>

          <div className="btns btns--center mt-40 signup__btns">
            <Link className="btn btn--lg signup__cancel" to="/login">
              취소
            </Link>
            <button className="btn btn--primary btn--lg signup__submit" type="submit" disabled={signup.isPending}>
              {signup.isPending ? "가입하는 중…" : "가입하기"}
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
