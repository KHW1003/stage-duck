/**
 * 입점 신청 2단계 (FR-SUP-02). 처음 신청은 POST, 반려 뒤에는 고쳐서 PUT.
 * - AC-F1-17: 개인(프리랜서)을 고르면 사업자등록번호·사업장 주소 칸이 사라지고, 보내지도 않는다
 * - AC-F1-18: 체크섬 검사는 서버가 한다. 틀리면 서버 문구를 그 칸 아래에 보여 준다
 * 입력 중인 값은 화면 상태(useState)지만, 서버 데이터는 첫 값으로만 쓴다.
 */
import { useState, type ChangeEvent, type FormEvent } from "react";
import type { BusinessType, SupplierApplication, SupplierCategory } from "../../shared/api/types";
import { Button } from "../../shared/ui/Button";
import { ApiError } from "../../shared/api/client";
import { ErrorNotice, fieldErrorOf } from "../../shared/ui/ErrorText";
import { Field, Input } from "../../shared/ui/Field";
import { useSubmitApplication } from "./api";
import styles from "./Supplier.module.css";

const TYPES: { value: BusinessType; label: string; desc: string }[] = [
  { value: "SOLE_PROPRIETOR", label: "개인사업자", desc: "사업자등록번호가 있어요" },
  { value: "CORPORATION", label: "법인사업자", desc: "법인 등록이 있어요" },
  { value: "INDIVIDUAL", label: "개인 (프리랜서)", desc: "등록번호·등록증 칸이 사라져요" },
];

const CATEGORIES: { value: SupplierCategory; label: string }[] = [
  { value: "VENUE", label: "공연장" },
  { value: "EQUIPMENT", label: "음향 장비" },
  { value: "INSTALL", label: "설치·철수" },
  { value: "ENGINEER", label: "엔지니어" },
];

interface Props {
  initial: SupplierApplication | null;
  /** 반려된 신청을 고쳐서 다시 신청하는지 */
  resubmit: boolean;
}

type TextKey = "companyName" | "representativeName" | "businessRegNo" | "businessAddress" | "mainPhone" | "mailOrderNo";

export function ApplicationForm({ initial, resubmit }: Props) {
  const [form, setForm] = useState({
    businessType: initial?.businessType ?? ("SOLE_PROPRIETOR" as BusinessType),
    companyName: initial?.companyName ?? "",
    representativeName: initial?.representativeName ?? "",
    businessRegNo: initial?.businessRegNo ?? "",
    businessAddress: initial?.businessAddress ?? "",
    mainPhone: initial?.mainPhone ?? "",
    mailOrderNo: initial?.mailOrderNo ?? "",
    categories: initial?.categories ?? ([] as SupplierCategory[]),
  });
  const submit = useSubmitApplication(resubmit);
  const business = form.businessType !== "INDIVIDUAL";
  const err = (field: string) => fieldErrorOf(submit.error, field);
  const text = (key: TextKey) => ({
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  function toggle(c: SupplierCategory) {
    const has = form.categories.includes(c);
    setForm({ ...form, categories: has ? form.categories.filter((x) => x !== c) : [...form.categories, c] });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { businessRegNo, businessAddress, mailOrderNo, ...rest } = form;
    submit.mutate({
      ...rest,
      ...(business ? { businessRegNo, businessAddress } : {}),
      mailOrderNo: mailOrderNo.trim() || null,
    });
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <section className={styles.section}>
        <fieldset className={styles.choices}>
          <legend className={styles.legend}>사업자 유형</legend>
          {TYPES.map((t) => (
            <label key={t.value} className={styles.choice}>
              <input
                type="radio"
                name="businessType"
                value={t.value}
                checked={form.businessType === t.value}
                onChange={() => setForm({ ...form, businessType: t.value })}
              />
              <b>{t.label}</b>
              <span>{t.desc}</span>
            </label>
          ))}
        </fieldset>
        {err("businessType") && <p className={styles.fieldError}>{err("businessType")}</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>사업자 정보</h2>
        <p className={styles.sectionDesc}>관리자만 봐요. 다른 사용자에게는 공개하지 않아요.</p>
        <div className={styles.row2}>
          <Field label={business ? "상호" : "활동명"} required error={err("companyName")}>
            {(c) => <Input {...c} {...text("companyName")} />}
          </Field>
          <Field label="대표자" required error={err("representativeName")}>
            {(c) => <Input {...c} {...text("representativeName")} />}
          </Field>
        </div>
        {business && (
          <>
            <Field label="사업자등록번호" required hint="숫자 10자리 (하이픈은 있어도 돼요)" error={err("businessRegNo")}>
              {(c) => <Input {...c} inputMode="numeric" {...text("businessRegNo")} />}
            </Field>
            <Field label="사업장 주소" required error={err("businessAddress")}>
              {(c) => <Input {...c} {...text("businessAddress")} />}
            </Field>
          </>
        )}
        <div className={styles.row2}>
          <Field label="대표 전화" required hint="숫자만 (예: 0621234567)" error={err("mainPhone")}>
            {(c) => <Input {...c} inputMode="tel" {...text("mainPhone")} />}
          </Field>
          <Field label="통신판매업 신고번호" optional hint="없으면 비워 두세요 (해당 없음)" error={err("mailOrderNo")}>
            {(c) => <Input {...c} {...text("mailOrderNo")} />}
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <fieldset className={`${styles.choices} ${styles.choices4}`}>
          <legend className={styles.legend}>제공할 서비스</legend>
          {CATEGORIES.map((c) => (
            <label key={c.value} className={styles.choice}>
              <input type="checkbox" checked={form.categories.includes(c.value)} onChange={() => toggle(c.value)} />
              <b>{c.label}</b>
            </label>
          ))}
        </fieldset>
        {err("categories") && <p className={styles.fieldError}>{err("categories")}</p>}
      </section>

      {/* 칸마다 이유가 있으면 그 칸 아래에만 보여 준다 (같은 문구를 두 번 보이지 않게) */}
      {!hasFieldErrors(submit.error) && <ErrorNotice error={submit.error} />}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="lg" loading={submit.isPending}>
          {resubmit ? "고쳐서 다시 신청" : "심사 신청"}
        </Button>
      </div>
    </form>
  );
}

/** 이 화면의 칸 아래에 이미 보이는 오류뿐이면 위쪽 안내는 띄우지 않는다 (약관 같은 칸 밖 오류는 안내로 보인다) */
const SHOWN_FIELDS = ["businessType", "companyName", "representativeName", "businessRegNo", "businessAddress", "mainPhone", "mailOrderNo", "categories"];

function hasFieldErrors(error: unknown): boolean {
  return error instanceof ApiError && error.body.fieldErrors.some((e) => SHOWN_FIELDS.includes(e.field));
}
