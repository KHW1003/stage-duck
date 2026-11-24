/**
 * 커뮤니티 글쓰기·수정 (/community/write, /community/:id/edit, #100). 사용자·업체만. 목업 community-write.html 시안 F 문서형.
 * - 말머리·제목(100자)·본문(5,000자)은 화면에서 먼저 확인하고, 서버 fieldErrors 가 오면 그 칸 아래에 보여 준다
 * - 1분 제한(AC-F4-16) 같은 칸 밖 오류는 서버 문구를 그대로 위에 보여 준다
 * - 사진은 고르는 순간 올리고(최대 5장) 저장할 때 id만 보낸다
 */
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { FreePost, FreePostCategory, FreePostRequest } from "../shared/api/types";
import { useMe } from "../shared/auth/useMe";
import { ApiError } from "../shared/api/client";
import { PageTop } from "../shared/layout/PageTop";
import { Button } from "../shared/ui/Button";
import { ErrorNotice, fieldErrorOf } from "../shared/ui/ErrorText";
import { useFreePost, useSaveFreePost, useUploadPhoto } from "../features/community/api";
import { BODY_MAX, CATEGORIES, CATEGORY_LABEL, PHOTO_MAX, TITLE_MAX } from "../features/community/labels";
import styles from "../features/community/Community.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

type Errors = Partial<Record<"category" | "title" | "body", string>>;

function check(f: FreePostRequest): Errors {
  const e: Errors = {};
  if (!f.category) e.category = "말머리를 골라 주세요.";
  if (!f.title.trim()) e.title = "제목을 적어 주세요.";
  if (!f.body.trim()) e.body = "내용을 적어 주세요.";
  return e;
}

function Editor({ initial }: { initial?: FreePost }) {
  const me = useMe();
  const navigate = useNavigate();
  const save = useSaveFreePost(initial?.id);
  const upload = useUploadPhoto();
  const [form, setForm] = useState<FreePostRequest>({
    category: initial?.category ?? "",
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    fileIds: initial?.photoIds ?? [],
  });
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const err = (k: keyof Errors) => errors[k] ?? fieldErrorOf(save.error, k);
  const outside = save.error instanceof ApiError && save.error.body.fieldErrors.length === 0 ? save.error : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = check(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      { ...form, title: form.title.trim(), body: form.body.trim() },
      { onSuccess: (saved) => navigate(`/community/${saved.id}`, { state: { contactWarning: saved.contactWarning } }) },
    );
  }

  function addPhoto(file: File | undefined) {
    if (!file || form.fileIds.length >= PHOTO_MAX) return;
    upload.mutate(file, {
      onSuccess: (f) => {
        setForm((v) => ({ ...v, fileIds: [...v.fileIds, f.id] }));
        setThumbs((t) => ({ ...t, [f.id]: f.thumbUrl }));
      },
    });
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div>
        <fieldset className={styles.chips} aria-invalid={err("category") ? true : undefined}>
          <legend className="sd-sr-only">말머리</legend>
          {CATEGORIES.map((c) => (
            <label key={c.value} className={styles.chip}>
              <input
                type="radio"
                name="category"
                checked={form.category === c.value}
                onChange={() => setForm({ ...form, category: c.value as FreePostCategory })}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
        {err("category") && <p className={styles.fieldError}>{err("category")}</p>}
      </div>

      <div>
        <label className={styles.label} htmlFor="cw-title">
          <span>
            제목 {form.category && `· [${CATEGORY_LABEL[form.category]}]`} · {me.data?.nickname ?? "나"}
          </span>
          <span className="sd-num">
            {form.title.length} / {TITLE_MAX}
          </span>
        </label>
        <input
          id="cw-title"
          className={styles.titleInput}
          maxLength={TITLE_MAX}
          value={form.title}
          aria-invalid={err("title") ? true : undefined}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        {err("title") && <p className={styles.fieldError}>{err("title")}</p>}
      </div>

      <div className={styles.photos}>
        <label className={styles.chip}>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => addPhoto(e.target.files?.[0])} disabled={form.fileIds.length >= PHOTO_MAX} />
          사진 <span className="sd-num">{form.fileIds.length} / {PHOTO_MAX}</span>
        </label>
        {form.fileIds.map((fid) => (
          <span key={fid} className={styles.thumb}>
            {thumbs[fid] && <img src={thumbs[fid]} alt="" />}
            <Button size="sm" variant="ghost" aria-label="사진 빼기" onClick={() => setForm({ ...form, fileIds: form.fileIds.filter((x) => x !== fid) })}>
              ×
            </Button>
          </span>
        ))}
        <ErrorNotice error={upload.error} />
      </div>

      <div>
        <label className={styles.label} htmlFor="cw-body">
          <span>본문 · 전화번호·계좌번호는 적지 말아 주세요</span>
          <span className="sd-num">
            {form.body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
          </span>
        </label>
        <textarea
          id="cw-body"
          className={styles.bodyInput}
          maxLength={BODY_MAX}
          value={form.body}
          aria-invalid={err("body") ? true : undefined}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        {err("body") && <p className={styles.fieldError}>{err("body")}</p>}
      </div>

      <ErrorNotice error={outside} />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => navigate(initial ? `/community/${initial.id}` : "/community")}>
          취소
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {initial ? "수정하기" : "올리기"}
        </Button>
      </div>
    </form>
  );
}

export function CommunityWritePage() {
  usePageMeta("글쓰기");
  const param = useParams().id;
  const id = param ? Number(param) : undefined;
  const editing = id !== undefined;
  const post = useFreePost(id ?? 0, editing);

  return (
    <>
      <PageTop
        title={editing ? "커뮤니티 글 수정" : "커뮤니티 글쓰기"}
        crumbs={[{ label: "커뮤니티", to: "/community" }, { label: editing ? "글 수정" : "글쓰기" }]}
        narrow
      />
      <div className={`sd-container ${styles.wrap}`}>
        <div className={styles.narrow}>
          {!editing && <Editor />}
          {editing && post.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
          {editing && post.data && <Editor key={post.data.id} initial={post.data} />}
          {editing && <ErrorNotice error={post.error} />}
        </div>
      </div>
    </>
  );
}
