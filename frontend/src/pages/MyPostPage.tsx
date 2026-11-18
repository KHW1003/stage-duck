/**
 * 내 소개 글 쓰기 (/supplier/posts, #30). 목업 v4 p-post.html. FR-BOARD-02·03, AC-F4-01(승인 부문만)·AC-F4-02(부문당 1개).
 * 승인 부문·부문당 1개는 서버가 검사하고, 화면은 승인 안 된 말머리를 꺼 두는 보조만 한다 (CLAUDE.md 9).
 * 이번 범위는 새 글 쓰기. 부문별 "게시 중" 탭·고치기·내리기·끌어올리기·연락처 경고·블라인드 안내는 #31
 * ("내 글 목록" API 가 계약서에 아직 없다).
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useCreatePrPost, useUploadPrPhoto } from "../features/board/api";
import { PHOTO_MAX, PR_CATEGORIES, isPrCategory } from "../features/board/labels";
import { SIDO } from "../features/request/codes";
import { useApplication } from "../features/supplier/api";
import type { PrCategory, UploadedFile } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ErrorNotice, fieldErrorOf } from "../shared/ui/ErrorText";
import { Input } from "../shared/ui/Field";
import { Icon } from "../shared/ui/Icon";
import { Select } from "../shared/ui/Select";
import styles from "../features/board/Board.module.css";

const SIDO_OPTIONS = SIDO.map((s) => ({ value: s, label: s }));

interface Control {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
  "aria-required": boolean | undefined;
}

/** 목업 .form-table 한 줄: 왼쪽 이름, 오른쪽 입력. 이름·도움말·오류를 입력칸과 aria 로 잇는다 */
function Row(props: {
  label: string;
  required?: boolean;
  sub?: ReactNode;
  hint?: string;
  error?: string;
  /** 칸 하나가 아니라 여러 부품 묶음(사진)이면 이름을 label 대신 묶음 제목으로 */
  group?: boolean;
  children: (c: Control) => ReactNode;
}) {
  const id = useId();
  const Th = props.group ? "span" : "label";
  const hintId = props.hint ? `${id}-hint` : undefined;
  const errorId = props.error ? `${id}-error` : undefined;
  return (
    <div className={styles.row}>
      <Th className={styles.th} htmlFor={props.group ? undefined : id} id={props.group ? `${id}-label` : undefined}>
        {props.label}
        {props.required && (
          <span className={styles.req} aria-hidden="true">
            *
          </span>
        )}
        {props.sub && <span className={styles.thSub}>{props.sub}</span>}
      </Th>
      <div className={styles.td}>
        {props.children({
          id,
          "aria-invalid": props.error ? true : undefined,
          "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
          "aria-required": props.required || undefined,
        })}
        {props.hint && (
          <p id={hintId} className={styles.hint}>
            {props.hint}
          </p>
        )}
        {props.error && (
          <p id={errorId} className={styles.fieldError}>
            {props.error}
          </p>
        )}
      </div>
    </div>
  );
}

export function MyPostPage() {
  const navigate = useNavigate();
  const application = useApplication();
  const create = useCreatePrPost();
  const upload = useUploadPrPhoto();
  const [category, setCategory] = useState<PrCategory | "">("");
  const [title, setTitle] = useState("");
  const [sido, setSido] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<UploadedFile[]>([]);

  if (application.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  const approved = new Set((application.data?.categories ?? []).filter(isPrCategory));
  const categoryOptions = PR_CATEGORIES.map((c) =>
    approved.has(c.value) ? c : { ...c, label: `${c.label} · 승인된 부문이 아니에요`, disabled: true },
  );
  const fe = (field: string) => fieldErrorOf(create.error, field);

  function addPhoto(file: File | undefined) {
    if (!file || photos.length >= PHOTO_MAX) return;
    upload.mutate(file, { onSuccess: (f) => setPhotos((list) => [...list, f]) });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { category, title, body, sido, priceRange: priceRange.trim() || null, fileIds: photos.map((p) => p.id) },
      { onSuccess: (saved) => navigate(`/board/${saved.id}`) },
    );
  }

  return (
    <>
      <PageTop
        title="내 소개 글"
        narrow
        crumbs={[{ label: "업체 찾기", to: "/board" }, { label: "내 소개 글" }]}
        desc="승인된 부문마다 글을 하나씩 올릴 수 있어요. 소개 글을 올리면 업체 찾기에 보여요."
        actions={
          <ButtonLink to="/board" size="sm">
            업체 찾기에서 보기
          </ButtonLink>
        }
      />
      <div className="sd-container">
        <form className={`${styles.narrow} ${styles.wrap}`} onSubmit={submit} noValidate>
          <ErrorNotice error={application.error ?? create.error} />
          <div className={styles.formTable}>
            <Row label="말머리" required error={fe("category")}>
              {(c) => (
                <div className={styles.short}>
                  <Select {...c} value={category} options={categoryOptions} placeholder="부문을 골라 주세요" onChange={(v) => setCategory(v as PrCategory)} />
                </div>
              )}
            </Row>
            <Row label="제목" required error={fe("title")}>
              {(c) => <Input {...c} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}
            </Row>
            <Row label="사진" group sub={`${photos.length}/${PHOTO_MAX}`} hint="첫 사진이 업체 찾기 목록에 크게 보여요." error={fe("fileIds")}>
              {(c) => (
                <div className={styles.photos} role="group" aria-labelledby={`${c.id}-label`} aria-describedby={c["aria-describedby"]}>
                  {photos.map((p, i) => (
                    <div key={p.id} className={styles.photoItem}>
                      <img src={p.thumbUrl} alt={`올린 사진 ${i + 1}`} />
                      <button type="button" aria-label={`사진 ${i + 1} 지우기`} onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}>
                        <Icon name="x" size="sm" />
                      </button>
                    </div>
                  ))}
                  {photos.length < PHOTO_MAX && (
                    <label className={styles.photoAdd}>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="사진 추가"
                        disabled={upload.isPending}
                        onChange={(e) => {
                          addPhoto(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      추가
                    </label>
                  )}
                </div>
              )}
            </Row>
            <Row label="활동 지역" required error={fe("sido")}>
              {(c) => (
                <div className={styles.short}>
                  <Select {...c} value={sido} options={SIDO_OPTIONS} placeholder="시·도를 골라 주세요" onChange={setSido} />
                </div>
              )}
            </Row>
            <Row label="대표 가격대" sub="(선택)" hint="예: 장비 40~60만 원" error={fe("priceRange")}>
              {(c) => <Input {...c} value={priceRange} maxLength={50} onChange={(e) => setPriceRange(e.target.value)} />}
            </Row>
            <Row label="본문" required error={fe("body")}>
              {(c) => <textarea {...c} className={styles.textarea} value={body} maxLength={5000} rows={7} onChange={(e) => setBody(e.target.value)} />}
            </Row>
          </div>
          <ErrorNotice error={upload.error} />
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" size="lg" loading={create.isPending}>
              저장
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
