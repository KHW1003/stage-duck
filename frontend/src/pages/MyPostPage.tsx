/**
 * 내 소개 글 (/supplier/posts, #30·#31). 목업 v4 p-post.html. FR-BOARD-02·03, AC-F4-01(승인 부문만)·AC-F4-02(부문당 1개)·AC-F4-03(연락처 경고)·AC-F4-10(블라인드).
 * - 말머리 탭: 글이 있으면 "게시 중"/"블라인드됨", 없으면 "새 글", 승인 안 된 부문은 "승인 안 됨"(못 누름)
 * - 글이 있으면 고치기(PUT, 말머리는 못 바꿈)·[글 내리기](DELETE)·끌어올리기(7일 1회), 가려진 글은 사유만 보여 주고 잠근다
 * - 승인 부문·부문당 1개·7일 규칙·블라인드는 서버가 검사하고, 화면은 서버가 준 canBump·nextBumpAt 을 보여 주기만 한다 (CLAUDE.md 9·12)
 * - 목업의 조회·관심 저장 수는 서버가 주지 않아 넣지 않았다
 * - GET /pr-posts/mine 은 계약서 반영 대기 (11/23)
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBumpPrPost, useCreatePrPost, useDeletePrPost, useMyPrPosts, useUpdatePrPost, useUploadPrPhoto } from "../features/board/api";
import { PHOTO_MAX, PR_CATEGORIES, PR_CATEGORY_LABEL, isPrCategory, monthDay } from "../features/board/labels";
import { SIDO } from "../features/request/codes";
import { useApplication } from "../features/supplier/api";
import type { MyPrPost, PrCategory, UploadedFile } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ErrorNotice, fieldErrorOf } from "../shared/ui/ErrorText";
import { Input } from "../shared/ui/Field";
import { Ico } from "../shared/ui/Ico";
import { Icon } from "../shared/ui/Icon";
import { KitModal } from "../shared/ui/KitModal";
import { Select } from "../shared/ui/Select";
import styles from "../features/board/Board.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

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

function tabState(c: PrCategory, approved: Set<PrCategory>, post: MyPrPost | undefined): string {
  if (post) return post.status === "BLINDED" ? "블라인드됨" : "게시 중";
  return approved.has(c) ? "새 글" : "승인 안 됨";
}

/** "2026-11-30T10:00:00" → "11월 30일 10:00" (서버 시각 그대로) */
function monthDayTime(iso: string): string {
  return `${monthDay(iso)} ${iso.slice(11, 16)}`;
}

export function MyPostPage() {
  usePageMeta("내 소개 글");
  const application = useApplication();
  const mine = useMyPrPosts();
  const [picked, setPicked] = useState<PrCategory | null>(null);

  if (application.isPending || mine.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  const approved = new Set((application.data?.categories ?? []).filter(isPrCategory));
  const byCategory = new Map((mine.data?.items ?? []).map((p) => [p.category as PrCategory, p]));
  const fallback = PR_CATEGORIES.find((c) => byCategory.has(c.value))?.value ?? PR_CATEGORIES.find((c) => approved.has(c.value))?.value ?? null;
  const current = picked ?? fallback;
  const post = current ? byCategory.get(current) : undefined;

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
      <div className={styles.tabBar}>
        <div className="sd-container">
          <div className={`${styles.narrow} ${styles.tabs}`} role="tablist" aria-label="말머리">
            {PR_CATEGORIES.map((c) => {
              const off = !approved.has(c.value) && !byCategory.has(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  role="tab"
                  className={styles.tab}
                  aria-selected={current === c.value}
                  aria-disabled={off || undefined}
                  onClick={() => !off && setPicked(c.value)}
                >
                  {c.label} {tabState(c.value, approved, byCategory.get(c.value))}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="sd-container">
        <div className={`${styles.narrow} ${styles.wrap}`}>
          <ErrorNotice error={application.error ?? mine.error} />
          {post ? (
            <PostEditor key={`post-${post.id}`} post={post} />
          ) : (
            <NewPostForm
              key="new"
              category={current ?? ""}
              onCategory={setPicked}
              options={PR_CATEGORIES.map((c) =>
                !approved.has(c.value)
                  ? { ...c, label: `${c.label} · 승인된 부문이 아니에요`, disabled: true }
                  : byCategory.has(c.value)
                    ? { ...c, label: `${c.label} · 이미 올린 글이 있어요`, disabled: true }
                    : c,
              )}
            />
          )}
        </div>
      </div>
    </>
  );
}

interface Draft {
  title: string;
  sido: string;
  priceRange: string;
  body: string;
  photos: UploadedFile[];
}

/** 제목·사진·지역·가격대·본문 칸 (새 글과 고치기가 같이 쓴다). 말머리 칸은 부르는 쪽이 넣는다 */
function useDraft(initial: Draft) {
  const [draft, setDraft] = useState<Draft>(initial);
  const upload = useUploadPrPhoto();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  function addPhoto(file: File | undefined) {
    if (!file || draft.photos.length >= PHOTO_MAX) return;
    upload.mutate(file, { onSuccess: (f) => setDraft((d) => ({ ...d, photos: [...d.photos, f] })) });
  }
  return { draft, set, addPhoto, upload };
}

function DraftRows({ d, fe, locked }: { d: ReturnType<typeof useDraft>; fe: (f: string) => string | undefined; locked?: boolean }) {
  const { draft, set, addPhoto, upload } = d;
  return (
    <>
      <Row label="제목" required error={fe("title")}>
        {(c) => <Input {...c} value={draft.title} maxLength={100} disabled={locked} onChange={(e) => set("title", e.target.value)} />}
      </Row>
      <Row label="사진" group sub={`${draft.photos.length}/${PHOTO_MAX}`} hint="첫 사진이 업체 찾기 목록에 크게 보여요." error={fe("fileIds")}>
        {(c) => (
          <div className={styles.photos} role="group" aria-labelledby={`${c.id}-label`} aria-describedby={c["aria-describedby"]}>
            {draft.photos.map((p, i) => (
              <div key={p.id} className={styles.photoItem}>
                <img src={p.thumbUrl} alt={`올린 사진 ${i + 1}`} />
                {!locked && (
                  <button type="button" aria-label={`사진 ${i + 1} 지우기`} onClick={() => set("photos", draft.photos.filter((x) => x.id !== p.id))}>
                    <Icon name="x" size="sm" />
                  </button>
                )}
              </div>
            ))}
            {!locked && draft.photos.length < PHOTO_MAX && (
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
            <Select {...c} value={draft.sido} options={SIDO_OPTIONS} placeholder="시·도를 골라 주세요" disabled={locked} onChange={(v) => set("sido", v)} />
          </div>
        )}
      </Row>
      <Row label="대표 가격대" sub="(선택)" hint="예: 장비 40~60만 원" error={fe("priceRange")}>
        {(c) => <Input {...c} value={draft.priceRange} maxLength={50} disabled={locked} onChange={(e) => set("priceRange", e.target.value)} />}
      </Row>
      <Row label="본문" required error={fe("body")}>
        {(c) => (
          <textarea {...c} className={styles.textarea} value={draft.body} maxLength={5000} rows={7} disabled={locked} onChange={(e) => set("body", e.target.value)} />
        )}
      </Row>
    </>
  );
}

function payload(draft: Draft) {
  return { title: draft.title, body: draft.body, sido: draft.sido, priceRange: draft.priceRange.trim() || null, fileIds: draft.photos.map((p) => p.id) };
}

/** 새 글 (AC-F4-01·02). 저장하면 올린 소개 글로 가고, 연락처 경고는 그 화면이 보여 준다 (AC-F4-03) */
function NewPostForm(props: {
  category: PrCategory | "";
  onCategory: (c: PrCategory) => void;
  options: { value: PrCategory; label: string; disabled?: boolean }[];
}) {
  const navigate = useNavigate();
  const create = useCreatePrPost();
  const d = useDraft({ title: "", sido: "", priceRange: "", body: "", photos: [] });
  const fe = (field: string) => fieldErrorOf(create.error, field);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { category: props.category, ...payload(d.draft) },
      { onSuccess: (saved) => navigate(`/board/${saved.id}`, { state: { contactWarning: saved.contactWarning } }) },
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <ErrorNotice error={create.error} />
      <div className={styles.formTable}>
        <Row label="말머리" required error={fe("category")}>
          {(c) => (
            <div className={styles.short}>
              <Select {...c} value={props.category} options={props.options} placeholder="부문을 골라 주세요" onChange={(v) => props.onCategory(v as PrCategory)} />
            </div>
          )}
        </Row>
        <DraftRows d={d} fe={fe} />
      </div>
      <ErrorNotice error={d.upload.error} />
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" size="lg" loading={create.isPending}>
          저장
        </Button>
      </div>
    </form>
  );
}

/** 올린 글: 고치기·[글 내리기]·끌어올리기 (FR-BOARD-02·03). 가려진 글은 사유를 보여 주고 잠근다 (AC-F4-10) */
function PostEditor({ post }: { post: MyPrPost }) {
  const navigate = useNavigate();
  const update = useUpdatePrPost(post.id);
  const remove = useDeletePrPost(post.id);
  const bump = useBumpPrPost(post.id);
  const [asking, setAsking] = useState(false);
  const blinded = post.status === "BLINDED";
  const d = useDraft({ title: post.title, sido: post.sido, priceRange: post.priceRange ?? "", body: post.body, photos: post.photos });
  const fe = (field: string) => fieldErrorOf(update.error, field);
  const category = PR_CATEGORY_LABEL[post.category as PrCategory];

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate(payload(d.draft), {
      onSuccess: (saved) => navigate(`/board/${saved.id}`, { state: { contactWarning: saved.contactWarning } }),
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      {blinded ? (
        <div className="notice notice--conflict mb-16" role="status">
          <Ico name="conflict" />
          <div>
            <b>이 글은 관리자가 블라인드했어요.</b> 사유: {post.blindReason ?? "사유가 없어요"}. 관리자가 블라인드를 풀면 고쳐서 다시 올릴 수 있어요.
          </div>
        </div>
      ) : (
        <div className={`summary ${styles.bumpSummary}`}>
          <div className="has-ico">
            <span className="ico-box">
              <Ico name="up" />
            </span>
            <div>
              <span>마지막 끌어올리기</span>
              <b>{monthDay(post.bumpedAt)}</b>
            </div>
          </div>
          <div className={styles.bumpCell}>
            <Button size="sm" block disabled={!post.canBump} loading={bump.isPending} onClick={() => bump.mutate()}>
              <Ico name="up" sm />
              {post.canBump ? "끌어올리기" : `${monthDayTime(post.nextBumpAt)}부터 끌어올리기`}
            </Button>
          </div>
        </div>
      )}
      {bump.isSuccess && (
        <p className="notice mb-16" role="status">
          끌어올렸어요. 업체 찾기 맨 위에 보여요.
        </p>
      )}
      <ErrorNotice error={update.error ?? bump.error ?? remove.error} />
      <div className={styles.formTable}>
        <Row label="말머리" required hint="말머리는 바꿀 수 없어요. 다른 부문은 그 탭에서 새 글로 써 주세요.">
          {(c) => (
            <div className={styles.short}>
              <Input {...c} value={category} disabled readOnly />
            </div>
          )}
        </Row>
        <DraftRows d={d} fe={fe} locked={blinded} />
      </div>
      <ErrorNotice error={d.upload.error} />
      {!blinded && (
        <div className={`${styles.formActions} ${styles.formActionsSplit}`}>
          <Button variant="danger" onClick={() => setAsking(true)}>
            <Ico name="trash" sm />
            글 내리기
          </Button>
          <Button type="submit" variant="primary" size="lg" loading={update.isPending}>
            저장
          </Button>
        </div>
      )}
      {asking && (
        <KitModal
          title="글을 내릴까요?"
          onClose={() => setAsking(false)}
          busy={remove.isPending}
          foot={
            <>
              <Button onClick={() => setAsking(false)} disabled={remove.isPending}>
                취소
              </Button>
              <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => setAsking(false) })}>
                내리기
              </Button>
            </>
          }
        >
          <p>
            {category} 소개 글이 업체 찾기에서 사라지고, 되돌릴 수 없어요. 내린 뒤에는 이 부문에 새 글을 다시 쓸 수 있어요.
          </p>
          <ErrorNotice error={remove.error} />
        </KitModal>
      )}
    </form>
  );
}
