/**
 * 업체 가입 1단계 (/signup/supplier, FR-SUP-01, #26). 업체는 이메일로만 가입하고 담당자 한 명이 계정을 쓴다.
 * 가입되면 바로 로그인되고, 서버가 준 첫 화면(입점 신청)으로 간다.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ApiError } from "../shared/api/client";
import { ErrorNotice, fieldErrorOf } from "../shared/ui/ErrorText";
import { Field, Input } from "../shared/ui/Field";
import { useSupplierSignup } from "../features/supplier/api";
import { Steps } from "../features/supplier/Steps";
import styles from "../features/supplier/Supplier.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

/** 입력 중인 값 (화면 상태). 서버 데이터가 아니라 useState 로 둔다 */
const EMPTY = {
  ...{ email: "", password: "", passwordCheck: "", name: "", phone: "" },
  ...{ service: false, privacy: false, marketing: false },
};
type TextKey = "email" | "password" | "passwordCheck" | "name" | "phone";
type BoxKey = "service" | "privacy" | "marketing";
type Change = ChangeEvent<HTMLInputElement>;

export function SupplierSignupPage() {
  const navigate = useNavigate();
  usePageMeta("업체 회원가입");
  const signup = useSupplierSignup();
  const [form, setForm] = useState(EMPTY);
  const [checked, setChecked] = useState(false);
  const err = (field: string) => fieldErrorOf(signup.error, field);
  const mismatch = checked && form.passwordCheck !== form.password;
  const text = (key: TextKey) => ({ value: form[key], onChange: (e: Change) => setForm({ ...form, [key]: e.target.value }) });
  const box = (key: BoxKey) => ({ checked: form[key], onChange: (e: Change) => setForm({ ...form, [key]: e.target.checked }) });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setChecked(true);
    if (form.passwordCheck !== form.password) return;
    const { email, password, name, phone, service, privacy, marketing } = form;
    signup.mutate(
      { email, password, name, phone, agreements: { service, privacyRequired: privacy, privacyOptional: false, marketing } },
      { onSuccess: (res) => navigate(res.landing, { replace: true }) },
    );
  }

  return (
    <>
      <PageTop
        title="업체 가입"
        crumbs={[{ label: "STAGE DUCK 파트너" }]}
        desc="업체는 이메일로만 가입해요. 담당자 한 명이 계정을 써요."
      />
      <div className={`sd-container ${styles.wrap}`}>
        <Steps now={0} />
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <section className={styles.section}>
            <Field label="회사 이메일" required hint="담당자가 바뀌어도 쓸 수 있는 회사 공용 이메일을 권해요." error={err("email")}>
              {(c) => (
                <Input {...c} type="email" autoComplete="email" {...text("email")} />
              )}
            </Field>
            <div className={styles.row2}>
              <Field label="비밀번호" required hint="8자 이상, 영문과 숫자를 함께 써 주세요." error={err("password")}>
                {(c) => (
                  <Input {...c} type="password" autoComplete="new-password" {...text("password")} />
                )}
              </Field>
              <Field label="비밀번호 확인" required error={mismatch ? "비밀번호가 서로 달라요. 다시 확인해 주세요." : undefined}>
                {(c) => (
                  <Input {...c} type="password" autoComplete="new-password" {...text("passwordCheck")} />
                )}
              </Field>
            </div>
            <div className={styles.row2}>
              <Field label="담당자 이름" required error={err("name")}>
                {(c) => <Input {...c} autoComplete="name" {...text("name")} />}
              </Field>
              <Field label="담당자 전화" required hint="결제가 끝난 공연의 최종 담당표에만 공개돼요." error={err("phone")}>
                {(c) => (
                  <Input {...c} inputMode="tel" autoComplete="tel" {...text("phone")} />
                )}
              </Field>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="terms-title">
            <h2 id="terms-title" className={styles.sectionTitle}>
              약관 동의
            </h2>
            <label className={styles.check}>
              <input type="checkbox" {...box("service")} />
              STAGE DUCK 이용약관 (필수)
              <Link to="/terms/supplier">보기</Link>
            </label>
            <label className={styles.check}>
              <input type="checkbox" {...box("privacy")} />
              개인정보 수집·이용 (필수)
              <Link to="/terms/privacy">보기</Link>
            </label>
            <label className={styles.check}>
              <input type="checkbox" {...box("marketing")} />
              마케팅 정보 받기 (선택)
            </label>
          </section>

          {!hasFieldErrors(signup.error) && <ErrorNotice error={signup.error} />}
          <div className={styles.actions}>
            <ButtonLink to="/" variant="ghost">
              취소
            </ButtonLink>
            <Button type="submit" variant="primary" size="lg" loading={signup.isPending}>
              다음
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

/** 이 화면의 칸 아래에 이미 보이는 오류뿐이면 위쪽 안내는 띄우지 않는다 (약관 같은 칸 밖 오류는 안내로 보인다) */
const SHOWN_FIELDS = ["email", "password", "name", "phone"];

function hasFieldErrors(error: unknown): boolean {
  return error instanceof ApiError && error.body.fieldErrors.some((e) => SHOWN_FIELDS.includes(e.field));
}
