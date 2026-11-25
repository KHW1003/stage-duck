/** 업체 프로필의 후기 칸 (specs/reviews.md): 평균·별점 분포·최신순 10개씩. 쓴 사람은 닉네임만. */
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { Ico } from "../../shared/ui/Ico";
import { STAGE_LABEL, useSupplierReviews } from "./api";
import { Stars } from "./Stars";
import "./review.css";

export function SupplierReviews({ supplierId }: { supplierId: number }) {
  const q = useSupplierReviews(supplierId);
  const first = q.data?.pages[0];
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="sec" aria-labelledby="supplier-reviews">
      <div className="sec-head">
        <h2 id="supplier-reviews">
          <Ico name="talk" />
          이용 후기 {first ? <em>{first.count}</em> : null}
        </h2>
        <p>결제하고 공연을 마친 뮤지션만 쓸 수 있어요.</p>
      </div>
      {q.isError && <ErrorNotice error={q.error} />}
      {first && first.count === 0 && (
        <div className="empty">
          <Ico name="talk" />
          <b>아직 후기가 없어요</b>
          <p>이 업체와 공연을 마친 뮤지션의 후기가 여기에 보여요.</p>
        </div>
      )}
      {first && first.count > 0 && first.average !== null && (
        <>
          <div className="review-sum">
            <div className="review-sum__avg">
              <b className="sd-num">{first.average.toFixed(1)}</b>
              <Stars value={first.average} size="lg" />
              <span className="muted">후기 {first.count}개</span>
            </div>
            <ul className="review-sum__dist" aria-label="별점 분포">
              {["5", "4", "3", "2", "1"].map((k) => {
                const n = first.distribution[k] ?? 0;
                return (
                  <li key={k}>
                    <span>{k}점</span>
                    <span className="review-sum__bar" aria-hidden="true">
                      <i style={{ width: `${(n / first.count) * 100}%` }} />
                    </span>
                    <span className="sd-num muted">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="review-list">
            {items.map((r) => (
              <li key={r.id}>
                <div className="review-list__head">
                  <Stars value={r.rating} size="sm" />
                  <b>{r.nickname}</b>
                  <span className="muted">
                    {STAGE_LABEL[r.stageType]} · {r.showMonth} 공연
                  </span>
                </div>
                <p>{r.content}</p>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="mt-16" style={{ textAlign: "center" }}>
              <button className="btn btn--sm" type="button" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                후기 더 보기
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
