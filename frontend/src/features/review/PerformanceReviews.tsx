/**
 * 내 공연 화면의 후기 쓰기 (specs/reviews.md). 결제한 공연이 끝난 다음 날부터, 확정한 업체마다 한 번.
 * 아직 쓸 수 없으면(공연 전·결제 전) 칸을 보이지 않는다.
 */
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../shared/api/client";
import { ErrorNotice, fieldErrorOf } from "../../shared/ui/ErrorText";
import { Ico } from "../../shared/ui/Ico";
import { STAGE_LABEL, useDeleteReview, usePerformanceReviews, useWriteReview, type StageReview } from "./api";
import { StarPicker, Stars } from "./Stars";
import "./review.css";

const MIN = 10;
const MAX = 500;

function Writer({ performanceId, item }: { performanceId: number; item: StageReview }) {
  const write = useWriteReview(performanceId);
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [tried, setTried] = useState(false);
  const len = content.trim().length;
  const local = !rating ? "별점을 골라 주세요." : len < MIN ? `후기는 ${MIN}자 이상 써 주세요.` : undefined;
  const server = fieldErrorOf(write.error, "content") ?? fieldErrorOf(write.error, "rating");
  const error = (tried && local) || server;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (local) return;
    write.mutate({ stageId: item.stageId, rating, content });
  };

  return (
    <form className="review-write" onSubmit={submit} noValidate>
      <StarPicker name={`rating-${item.stageId}`} value={rating} onChange={setRating} />
      <textarea
        className="textarea"
        rows={3}
        maxLength={MAX}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="소리·설치 시간·소통은 어땠나요? 연락처는 쓸 수 없어요."
        aria-label={`${item.companyName} 후기`}
        aria-invalid={error ? true : undefined}
      />
      <div className="review-write__foot">
        <span className={`sd-num ${len > MAX ? "" : "muted"}`}>
          {len} / {MAX}
        </span>
        <button className="btn btn--primary btn--sm" type="submit" disabled={write.isPending}>
          후기 남기기
        </button>
      </div>
      {error && (
        <p className="field__error" role="alert">
          <Ico name="warn" sm />
          {error}
        </p>
      )}
      {write.error instanceof ApiError && !server && <ErrorNotice error={write.error} />}
    </form>
  );
}

export function PerformanceReviews({ performanceId }: { performanceId: number }) {
  const q = usePerformanceReviews(performanceId);
  const remove = useDeleteReview(performanceId);
  if (!q.data || !q.data.canWrite || q.data.items.length === 0) return null;
  const left = q.data.items.filter((i) => !i.review).length;

  return (
    <section className="sec" aria-labelledby="perf-reviews">
      <div className="sec-head">
        <h2 id="perf-reviews">
          <Ico name="talk" />
          함께한 업체 후기
        </h2>
        <p>{left > 0 ? `${left}곳의 후기를 기다리고 있어요. 다음 사람이 업체를 고를 때 큰 도움이 돼요.` : "모든 업체에 후기를 남겼어요. 고마워요!"}</p>
      </div>
      <ul className="review-targets">
        {q.data.items.map((item) => (
          <li key={item.stageId}>
            <div className="review-targets__who">
              <span className="tag">{STAGE_LABEL[item.stageType]}</span>
              <Link to={`/suppliers/${item.supplierId}`}>
                <b>{item.companyName}</b>
              </Link>
            </div>
            {item.review ? (
              <div className="review-done">
                <Stars value={item.review.rating} size="sm" />
                <p>{item.review.content}</p>
                <button className="btn btn--sm btn--ghost" type="button" disabled={remove.isPending} onClick={() => remove.mutate(item.review!.id)}>
                  지우고 다시 쓰기
                </button>
              </div>
            ) : (
              <Writer performanceId={performanceId} item={item} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
