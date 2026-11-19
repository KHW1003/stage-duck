/**
 * 1:1 문의 — 목록 (/inquiries) · 쓰기 (/inquiries/new, /inquiries/:id/edit) · 보기 (/inquiries/:id)
 * 목업: mockup-v4/pages/inquiry-list · inquiry-write · inquiry-post · FR-CS-01 · AC-F5-18~20 · D-48
 * - 내 문의만 보인다 (남의 문의는 서버가 404). 정지된 업체도 쓸 수 있다.
 * - 답변 대기일 때만 고치고 지운다. 답변이 오면 알림으로 알려 준다 (알림은 3번 #45).
 * - 서버(목산 #178)가 목록을 배열로 주니 요약 숫자·거르기·쪽 나누기는 features/support/inquiry.viewOf 가 한다.
 * - 사진은 고르는 순간 비공개로 올리고(최대 3장), 보낼 때 id만 보낸다. 전화번호·계좌번호는 적을 수 없다.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMyPerformances } from "../features/performance/api";
import { usePageMeta } from "../features/seo/usePageMeta";
import {
  BODY_MAX,
  INQUIRY_CATEGORIES,
  MAX_FILES,
  PAGE_SIZE,
  TITLE_MAX,
  categoryLabel,
  dateTime,
  hasContact,
  monthDay,
  shortDate,
  useDeleteInquiry,
  useInquiry,
  useMyInquiries,
  useSaveInquiry,
  useUploadInquiryPhoto,
  type InquiryCategory,
  type InquiryDetail,
  type InquiryStatus,
  type ListFilter,
  viewOf,
} from "../features/support/inquiry";
import { ApiError } from "../shared/api/client";
import { useMe } from "../shared/auth/useMe";
import { KitModal } from "../shared/ui/KitModal";
import { ErrorNotice, fieldErrorOf } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import "../features/support/inquiry.css";

const STATUS_FILTERS: { value: ListFilter["status"]; label: string }[] = [
  { value: "", label: "전체" },
  { value: "WAITING", label: "답변 대기" },
  { value: "ANSWERED", label: "답변 완료" },
];

function StateText({ status }: { status: InquiryStatus }) {
  return status === "WAITING" ? <span className="state state--on">답변 대기</span> : <span className="state state--done">답변 완료</span>;
}

function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <ol className="page-top__crumb" aria-label="현재 위치">
      {items.map((c) => (
        <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>
      ))}
    </ol>
  );
}

/* ---------------- 목록 ---------------- */

export function InquiryListPage() {
  usePageMeta("1:1 문의");
  const [params, setParams] = useSearchParams();
  const filter: ListFilter = {
    status: (["WAITING", "ANSWERED"].includes(params.get("status") ?? "") ? params.get("status") : "") as ListFilter["status"],
    category: (INQUIRY_CATEGORIES.some((c) => c.value === params.get("category")) ? params.get("category") : "") as ListFilter["category"],
    page: Math.max(1, Number(params.get("page")) || 1),
  };
  const mine = useMyInquiries();
  const { isPending, error } = mine;
  const data = mine.data ? viewOf(mine.data, filter) : undefined;
  const go = (next: Partial<ListFilter>) => {
    const f = { ...filter, page: 1, ...next };
    const qs: Record<string, string> = {};
    if (f.status) qs.status = f.status;
    if (f.category) qs.category = f.category;
    if (f.page > 1) qs.page = String(f.page);
    setParams(qs, { replace: true });
  };

  return (
    <>
      <div className="page-top">
        <div className="container page-top__inner">
          <div>
            <Crumbs items={[{ label: "1:1 문의" }]} />
            <h1>1:1 문의</h1>
            <p className="page-top__desc">STAGE DUCK 운영자에게 묻는 곳이에요. 내가 남긴 문의만 보이고, 답변이 오면 알림으로 알려 드려요.</p>
          </div>
          <div className="page-top__actions">
            <Link className="btn btn--primary" to="/inquiries/new">
              <Ico name="edit" sm />
              문의하기
            </Link>
          </div>
        </div>
      </div>
      <main className="container main" style={{ paddingTop: 0 }}>
        <dl className="iq-sum">
          <div>
            <dt>전체 문의</dt>
            <dd>{data?.counts.total ?? "-"}</dd>
          </div>
          <div>
            <dt>답변 대기</dt>
            <dd>{data?.counts.waiting ?? "-"}</dd>
          </div>
          <div>
            <dt>답변 완료</dt>
            <dd>{data?.counts.answered ?? "-"}</dd>
          </div>
        </dl>
        <div className="iq-bar">
          <div className="filters" role="group" aria-label="답변 상태">
            {STATUS_FILTERS.map((s) => (
              <button key={s.label} type="button" aria-pressed={filter.status === s.value} onClick={() => go({ status: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
          <select
            className="select select--sm"
            aria-label="문의 유형"
            value={filter.category}
            onChange={(e) => go({ category: e.target.value as ListFilter["category"] })}
          >
            <option value="">모든 유형</option>
            {INQUIRY_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {isPending ? (
          <p className="field__hint">문의를 불러오는 중이에요.</p>
        ) : error || !data ? (
          <ErrorNotice error={error} />
        ) : data.items.length === 0 ? (
          <div className="empty">
            <Ico name="talk" />
            <b>{data.counts.total === 0 ? "아직 남긴 문의가 없어요" : "조건에 맞는 문의가 없어요"}</b>
            <p>궁금한 점은 자주 묻는 질문에서 먼저 찾아보거나 문의로 남겨 주세요.</p>
            <Link className="btn btn--sm" to="/faq">
              자주 묻는 질문
            </Link>
          </div>
        ) : (
          <>
            <table className="iq-bbs">
              <colgroup>
                <col className="c-no" style={{ width: 72 }} />
                <col className="c-cat" style={{ width: 120 }} />
                <col />
                <col className="c-date" style={{ width: 120 }} />
                <col className="c-state" style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="c-no">번호</th>
                  <th className="c-cat">유형</th>
                  <th style={{ textAlign: "left" }}>제목</th>
                  <th className="c-date">문의일</th>
                  <th className="c-state">상태</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((q, i) => (
                  <tr key={q.id}>
                    <td className="c-no">{data.filtered.length - (data.page - 1) * PAGE_SIZE - i}</td>
                    <td className="c-cat">{categoryLabel(q.category)}</td>
                    <td className="t">
                      <span className="iq-lock">
                        <Ico name="lock" sm />
                      </span>
                      <Link to={`/inquiries/${q.id}`}>{q.title}</Link>
                    </td>
                    <td className="c-date">{shortDate(q.createdAt)}</td>
                    <td className="c-state">
                      <StateText status={q.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <nav className="pagination" aria-label="쪽">
              {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) =>
                p === data.page ? (
                  <span key={p} aria-current="page">
                    {p}
                  </span>
                ) : (
                  <a
                    key={p}
                    href={`?page=${p}`}
                    onClick={(e) => {
                      e.preventDefault();
                      go({ page: p });
                    }}
                  >
                    {p}
                  </a>
                ),
              )}
            </nav>
          </>
        )}
      </main>
    </>
  );
}

/* ---------------- 쓰기·고치기 ---------------- */

type Errors = Partial<Record<"category" | "title" | "body", string>>;

function check(category: string, title: string, body: string): Errors {
  const e: Errors = {};
  if (!category) e.category = "문의 유형을 골라 주세요";
  if (!title.trim()) e.title = "제목을 적어 주세요";
  if (!body.trim()) e.body = "내용을 적어 주세요";
  else if (hasContact(body)) e.body = "전화번호·계좌번호는 적을 수 없어요. 빼고 다시 보내 주세요.";
  return e;
}

function InquiryForm({ initial }: { initial?: InquiryDetail }) {
  const navigate = useNavigate();
  const me = useMe();
  const isUser = me.data?.role === "USER";
  const perfs = useMyPerformances({ enabled: isUser });
  const save = useSaveInquiry(initial?.id);
  const upload = useUploadInquiryPhoto();
  const fileInput = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<InquiryCategory | "">(initial?.category ?? "");
  const [performanceId, setPerformanceId] = useState<number | null>(initial?.performanceId ?? null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [files, setFiles] = useState<{ id: number; name: string; thumb: string }[]>(
    initial?.photos.map((p, i) => ({ id: p.id, name: `첨부 ${i + 1}`, thumb: p.url })) ?? [],
  );
  const [errors, setErrors] = useState<Errors>({});
  const err = (k: keyof Errors) => errors[k] ?? fieldErrorOf(save.error, k);
  const outside = save.error instanceof ApiError && save.error.body.fieldErrors.length > 0 ? null : save.error;
  const myPerfs = perfs.data ? [...perfs.data.active, ...perfs.data.draft, ...perfs.data.past] : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = check(category, title, body);
    setErrors(found);
    if (Object.keys(found).length > 0 || !category) return;
    save.mutate(
      { category, performanceId, title: title.trim(), body: body.trim(), fileIds: files.map((f) => f.id) },
      { onSuccess: (saved) => navigate(`/inquiries/${saved.id}`, { replace: !!initial }) },
    );
  }

  function addFile(file: File | undefined) {
    if (!file || files.length >= MAX_FILES) return;
    upload.mutate(file, { onSuccess: (f) => setFiles((v) => [...v, { id: f.id, name: file.name, thumb: f.thumbUrl }]) });
  }

  return (
    <form className="iq-narrow" onSubmit={submit} noValidate>
      <ErrorNotice error={outside} />
      <p className="iq-step" id="iq-cat">
        문의 유형<span className="req">*</span>
      </p>
      <div className="iq-chips" role="radiogroup" aria-labelledby="iq-cat" aria-invalid={err("category") ? true : undefined}>
        {INQUIRY_CATEGORIES.map((c) => (
          <label key={c.value}>
            <input type="radio" name="category" checked={category === c.value} onChange={() => setCategory(c.value)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      {err("category") && (
        <p className="field__error mt-8">
          <Ico name="warn" sm />
          {err("category")}
        </p>
      )}

      <div className="iq-editor mt-24">
        <input
          className="iq-editor__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="무엇이 궁금한지 한 줄로 적어 주세요"
          aria-label="제목"
          maxLength={TITLE_MAX}
          aria-invalid={err("title") ? true : undefined}
        />
        <div className="iq-editor__tools">
          <button
            className="btn btn--sm btn--ghost"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={files.length >= MAX_FILES || upload.isPending}
          >
            <Ico name="clip" sm />
            사진 첨부 ({files.length}/{MAX_FILES})
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            aria-label="사진 고르기"
            onChange={(e) => {
              addFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {isUser && (
            <select
              className="select select--sm"
              aria-label="관련 공연"
              value={performanceId ?? ""}
              onChange={(e) => setPerformanceId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">관련 공연 없음</option>
              {myPerfs.map((p) => (
                <option key={p.id} value={p.id}>
                  관련 공연: {p.title} · {monthDay(p.showDate)}
                </option>
              ))}
            </select>
          )}
        </div>
        <textarea
          className="iq-editor__body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="내용"
          placeholder="상황을 자세히 적어 주시면 더 빨리 도와드릴 수 있어요."
          maxLength={BODY_MAX}
          aria-invalid={err("body") ? true : undefined}
        />
        {files.length > 0 && (
          <div className="iq-editor__files">
            {files.map((f) => (
              <span key={f.id} className="iq-file-chip">
                <img src={f.thumb} alt="" />
                {f.name}
                <button className="link" type="button" aria-label={`${f.name} 첨부 빼기`} onClick={() => setFiles((v) => v.filter((x) => x.id !== f.id))}>
                  <Ico name="x" sm />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="iq-editor__foot">
          {err("body") || err("title") ? (
            <span className="field__error" role="alert">
              <Ico name="warn" sm />
              {err("body") ?? err("title")}
            </span>
          ) : (
            <span>
              <Ico name="info" sm /> 전화번호·계좌번호는 적지 말아 주세요. 결제 내역은 운영자가 직접 확인해요
            </span>
          )}
          <span>
            {body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
          </span>
        </div>
      </div>
      <ErrorNotice error={upload.error} />

      <div className="iq-sticky">
        <span className="small muted">답변은 1:1 문의 목록과 알림에서 볼 수 있어요</span>
        <div className="btns">
          <Link className="btn" to={initial ? `/inquiries/${initial.id}` : "/inquiries"}>
            취소
          </Link>
          <button className="btn btn--primary" type="submit" disabled={save.isPending || upload.isPending}>
            {initial ? "고친 내용 보내기" : "문의 보내기"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function InquiryWritePage() {
  const { id } = useParams();
  const editId = id ? Number(id) : undefined;
  const existing = useInquiry(editId ?? 0);
  usePageMeta(editId ? "문의 고치기" : "문의하기");
  const answered = existing.data?.status === "ANSWERED";

  return (
    <>
      <div className="page-top">
        <div className="container container--narrow page-top__inner">
          <div>
            <Crumbs items={[{ label: "1:1 문의", to: "/inquiries" }, { label: editId ? "문의 고치기" : "문의하기" }]} />
            <h1>{editId ? "문의 고치기" : "문의하기"}</h1>
            <p className="page-top__desc">운영자만 볼 수 있어요. 답변이 오면 알림으로 알려 드려요.</p>
          </div>
        </div>
      </div>
      <main className="container container--narrow main">
        {!editId ? (
          <InquiryForm />
        ) : existing.isPending ? (
          <p className="field__hint">문의를 불러오는 중이에요.</p>
        ) : existing.error || !existing.data ? (
          <NotFoundBox />
        ) : answered ? (
          <div className="empty">
            <Ico name="lock" />
            <b>답변이 달린 문의는 고칠 수 없어요</b>
            <p>더 궁금한 점은 새 문의로 남겨 주세요.</p>
            <Link className="btn btn--sm" to="/inquiries/new">
              다시 문의하기
            </Link>
          </div>
        ) : (
          <InquiryForm initial={existing.data} />
        )}
      </main>
    </>
  );
}

/* ---------------- 보기 ---------------- */

function NotFoundBox() {
  return (
    <div className="empty">
      <Ico name="search" />
      <b>문의를 찾을 수 없어요</b>
      <p>지워졌거나 내가 남긴 문의가 아니에요.</p>
      <Link className="btn btn--sm" to="/inquiries">
        목록
      </Link>
    </div>
  );
}

export function InquiryPostPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data, isPending, error } = useInquiry(id);
  const me = useMe();
  const perfs = useMyPerformances({ enabled: me.data?.role === "USER" && !!data?.performanceId });
  const perf = data?.performanceId
    ? [...(perfs.data?.active ?? []), ...(perfs.data?.draft ?? []), ...(perfs.data?.past ?? [])].find((p) => p.id === data.performanceId)
    : undefined;
  const remove = useDeleteInquiry();
  const [asking, setAsking] = useState(false);
  usePageMeta(data ? data.title : "1:1 문의");
  useEffect(() => {
    if (remove.isSuccess) navigate("/inquiries", { replace: true });
  }, [remove.isSuccess, navigate]);

  return (
    <>
      <div className="page-top">
        <div className="container container--narrow page-top__inner" style={{ paddingBottom: 14 }}>
          <Crumbs items={[{ label: "1:1 문의", to: "/inquiries" }, { label: data ? categoryLabel(data.category) : "문의" }]} />
        </div>
      </div>
      <main className="container container--narrow main">
        {isPending ? (
          <p className="field__hint">문의를 불러오는 중이에요.</p>
        ) : error || !data ? (
          <>
            <h1 className="sd-sr-only">문의를 찾을 수 없어요</h1>
            <NotFoundBox />
          </>
        ) : (
          <article className="iq-narrow">
            <div className="iq-head">
              <div className="iq-head__top">
                <span className="tag">{categoryLabel(data.category)}</span>
                <StateText status={data.status} />
              </div>
              <h1>{data.title}</h1>
              <div className="list__meta">
                <span>{dateTime(data.createdAt)} 문의</span>
                {perf && (
                  <span>
                    관련 공연 · {perf.title} ({monthDay(perf.showDate)})
                  </span>
                )}
              </div>
            </div>
            <div className="iq-body">{data.body}</div>
            {data.photos.length > 0 && (
              <div className="iq-files">
                {data.photos.map((f, i) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt={`첨부 사진 ${i + 1}`} />
                  </a>
                ))}
              </div>
            )}

            {data.status === "WAITING" ? (
              <section aria-label="답변">
                <div className="iq-wait">
                  <span className="ico-box">
                    <Ico name="clock" />
                  </span>
                  <b>운영자가 문의를 확인하고 있어요</b>
                  답변이 오면 알림으로 알려 드려요. 답변 전에는 문의를 고치거나 지울 수 있어요.
                </div>
                <ErrorNotice error={remove.error} />
                <div className="btns btns--end mt-24">
                  <button className="btn" type="button" onClick={() => setAsking(true)}>
                    <Ico name="trash" sm />
                    지우기
                  </button>
                  <Link className="btn" to={`/inquiries/${data.id}/edit`}>
                    <Ico name="edit" sm />
                    고치기
                  </Link>
                  <Link className="btn" to="/inquiries">
                    <Ico name="list" sm />
                    목록
                  </Link>
                </div>
              </section>
            ) : (
              <section aria-label="답변">
                <div className="iq-answer">
                  <div className="iq-answer__head">
                    <span className="who">
                      <span className="avatar avatar--sm" aria-hidden="true">
                        S
                      </span>
                      <b>STAGE DUCK 운영자</b>
                    </span>
                    {data.answeredAt && <span className="small muted">{dateTime(data.answeredAt)} 답변</span>}
                  </div>
                  <div className="iq-answer__body">{data.answer}</div>
                </div>
                <div className="row row--end mt-24">
                  <div className="btns">
                    <Link className="btn" to="/inquiries/new">
                      다시 문의하기
                    </Link>
                    <Link className="btn" to="/inquiries">
                      <Ico name="list" sm />
                      목록
                    </Link>
                  </div>
                </div>
              </section>
            )}
          </article>
        )}
      </main>
      {asking && data && (
        <KitModal
          title="문의를 지울까요?"
          onClose={() => setAsking(false)}
          busy={remove.isPending}
          foot={
            <>
              <button className="btn" type="button" onClick={() => setAsking(false)} disabled={remove.isPending}>
                취소
              </button>
              <button className="btn btn--primary" type="button" onClick={() => remove.mutate(data.id)} disabled={remove.isPending}>
                지우기
              </button>
            </>
          }
        >
          <p>지운 문의는 되돌릴 수 없어요.</p>
        </KitModal>
      )}
    </>
  );
}
