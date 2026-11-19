/**
 * 견적서 쓰기 (/supplier/postings/:stageId/quote, #41). 승인된 업체만. 목업 p-quote.html (업체 테마).
 * - AC-F2-15: 보내면 완료 안내 + [채팅방으로]·[다른 견적서 쓰기]·[공고 목록으로]
 * - AC-F2-16: [다른 견적서 쓰기]는 ?new=<보낸 quoteId> 로 빈 양식을 새로 연다 (label 을 바꿔 하나 더)
 * - 응답 checks[]의 경고·충돌·확인 필요를 완료 화면에 글자와 함께 보여 준다 (StatusBadge)
 * - 409 STAGE_NOT_OPEN: 보낼 수 없는 공고 안내 + [공고 목록으로]
 * [채팅방으로]는 지금 화면 주소에 ?chat=<roomId> 를 붙인다. 떠 있는 채팅 위젯 연결은 다음 PR.
 */
import { useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../shared/api/client";
import type { PostingDetail, QuoteIn, QuoteSentOut } from "../shared/api/types";
import { PageTop } from "../shared/layout/PageTop";
import { StatusBadge } from "../shared/StatusBadge";
import { ButtonLink } from "../shared/ui/Button";
import { DoneView, type DoneAction } from "../shared/ui/DoneView";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { MoneyText } from "../shared/ui/MoneyText";
import { usePosting, useSendQuote } from "../features/quote/api";
import { dateLabel, hm, nicknameOf, stageTag, userCounts } from "../features/quote/labels";
import { QuoteForm } from "../features/quote/QuoteForm";
import styles from "../features/quote/Quote.module.css";

const LIST_PATH = "/supplier/postings";

function Notice({ title, desc }: { title: string; desc: string }) {
  return (
    <div className={styles.notice} role="status">
      <b>{title}</b>
      <p>{desc}</p>
      <div className={styles.noticeActions}>
        <ButtonLink to={LIST_PATH}>공고 목록으로</ButtonLink>
      </div>
    </div>
  );
}

/** 보낸 뒤 완료 안내 */
function Sent({ p, body, result, again }: { p: PostingDetail; body: QuoteIn; result: QuoteSentOut; again: string }) {
  const base = `${LIST_PATH}/${p.stageId}/quote`;
  const actions: DoneAction[] = [];
  if (result.chatRoomId !== null) {
    const qs = new URLSearchParams(again ? { new: again } : {});
    qs.set("chat", String(result.chatRoomId));
    actions.push({ label: "채팅방으로", to: `${base}?${qs}`, primary: true });
  }
  actions.push({ label: "다른 견적서 쓰기", to: `${base}?new=${result.quoteId}`, primary: result.chatRoomId === null });
  actions.push({ label: "공고 목록으로", to: LIST_PATH });

  const fullSpec = body.includes.equipment && body.includes.engineer;
  const notPass = result.checks.filter((c) => c.result !== "PASS");

  return (
    <div className={`sd-container ${styles.wrap}`}>
      <DoneView
        title="견적서를 보냈어요"
        desc="사용자 견적함에 도착했어요. 사용자가 채팅을 시작하면 이야기를 나눌 수 있어요."
        rows={[
          ["공고", p.title],
          ["견적서 이름", body.label],
          ["합계", <MoneyText value={body.totalAmount} />, true],
          ["버전", `v${result.version}`],
          ...(fullSpec ? [["표시", <span className={styles.tag}>풀스펙</span>] as [string, JSX.Element]] : []),
        ]}
        actions={actions}
      />
      {result.checks.length > 0 && (
        <section className={`${styles.sec} ${styles.doneWrap}`} aria-labelledby="quote-checks">
          <h2 id="quote-checks" className={styles.secTitle}>
            자동 검사 결과
          </h2>
          {notPass.length === 0 ? (
            <p className={styles.desc}>경고나 충돌이 없어요.</p>
          ) : (
            <ul className={styles.checkList} aria-label="자동 검사 결과">
              {notPass.map((c) => (
                <li key={c.id}>
                  <StatusBadge result={c.result} />
                  <span>{c.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Writer({ stageId, again }: { stageId: number; again: string }) {
  const posting = usePosting(stageId);
  const send = useSendQuote(stageId);
  const p = posting.data;
  const crumbs = [{ label: "공고 목록", to: LIST_PATH }, { label: "공고 상세", to: `${LIST_PATH}/${stageId}` }, { label: "견적서" }];

  if (p && send.data && send.variables) return <Sent p={p} body={send.variables} result={send.data} again={again} />;

  const notOpen = send.error instanceof ApiError && send.error.body.code === "STAGE_NOT_OPEN";
  const hidden = posting.error instanceof ApiError && posting.error.status === 404;

  return (
    <>
      <PageTop
        title={p ? `견적서 쓰기 · ${p.title}` : "견적서 쓰기"}
        crumbs={crumbs}
        desc={
          p && (
            <>
              <span className="sd-num">
                {stageTag(p)} · {dateLabel(p.showDate)} · 리허설 {hm(p.rehearsalStart)} · 공연 {hm(p.showStart)}~{hm(p.showEnd)} · {p.sido}{" "}
                {p.sigungu} · 관객 {p.audience}명 · 요청서 v{p.performanceVersion}
              </span>
              <br />
              <span className="sd-num">
                {nicknameOf(p)} · {userCounts(p)}
              </span>
            </>
          )
        }
      />
      <div className={`sd-container ${styles.wrap}`}>
        {posting.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {hidden && <Notice title="볼 수 없는 공고예요" desc="마감됐거나, 내 부문·지역의 공고가 아니거나, 아직 내 단계가 열리지 않았어요." />}
        {!hidden && <ErrorNotice error={posting.error} />}
        {notOpen && <Notice title="지금은 견적서를 보낼 수 없는 공고예요" desc={(send.error as ApiError).body.message} />}
        {p && !notOpen && <QuoteForm posting={p} sending={send.isPending} error={send.error} onSubmit={(body) => send.mutate(body)} />}
      </div>
    </>
  );
}

export function QuotePage() {
  const stageId = Number(useParams().stageId);
  const again = useSearchParams()[0].get("new") ?? "";
  // [다른 견적서 쓰기]로 ?new= 가 바뀌면 양식·보낸 결과를 새로 시작한다 (?chat= 은 그대로 둔다)
  return <Writer key={again} stageId={stageId} again={again} />;
}
