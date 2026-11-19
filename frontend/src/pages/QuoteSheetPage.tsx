/**
 * 견적서 내역서 (/quotes/:quoteId · /quotes/by-version/:versionId). 목업 v4 quote.html 를 문서 한 장처럼 줄이고 인쇄할 수 있게.
 * - 채팅 견적서 카드의 [내역서 보기]는 버전 번호(refId)만 알아서 by-version 으로 연다
 * - 보는 사람: 그 공연의 사용자와 보낸 업체 (서버가 나머지는 404). 연락처·실명은 없다 (CLAUDE.md 20)
 * - 버전을 고르면 그 버전 내용을 보여 준다 (자동 검사는 지금 버전만)
 * - [인쇄하기]: 머리·바닥글·오른쪽 칸을 숨기고 종이만 A4 로 (quote-sheet.css @media print)
 * - [확정하기]·끝까지 읽기·남은 시간은 3번 #43 (최종 견적 카드)에서 붙인다
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { QuoteCheck, QuoteOut, QuoteVersionOut } from "../shared/api/types";
import { ApiError } from "../shared/api/client";
import { useMe } from "../shared/auth/useMe";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import { useQuote, useQuoteByVersion } from "../features/quote/api";
import { STAGE_LABEL } from "../features/request/codes";
import { usePageMeta } from "../features/seo/usePageMeta";
import "../features/quote/quote-sheet.css";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const hm = (t: string | null) => (t ? t.slice(0, 5) : "—");
const CHECK_LABEL: Record<QuoteCheck["result"], string> = { PASS: "통과", WARNING: "경고", NEEDS_INFO: "확인 필요", CONFLICT: "충돌" };
const CHECK_NAME: Record<string, string> = {
  "CHK-01": "수용 인원", "CHK-02": "설치 시간", "CHK-03": "공간 조건", "CHK-04": "입실·퇴실", "CHK-05": "설치 완료",
  "CHK-07": "장비 반입", "CHK-08": "엔지니어", "CHK-09": "일정", "CHK-10": "중복 장비", "CHK-11": "정보 부족", "CHK-12": "요청서 버전",
};

function dateKo(iso: string | null, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const base = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  return withTime ? `${base} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : base;
}

function plus(t: string | null, minutes: number | null) {
  if (!t || minutes == null) return null;
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function Doc({ q, v, isCurrent }: { q: QuoteOut; v: QuoteVersionOut; isCurrent: boolean }) {
  const includes = [v.includesEquipment && "장비", v.includesInstall && "설치", v.includesTransport && "운반", v.includesEngineer && "엔지니어"].filter(Boolean);
  const venue = v.venueSnapshot as { name?: string } | null;
  const setupEnd = plus(v.setupStart, v.setupMinutes);
  const lines: { name: string; detail: string; qty: number | null; amount: number }[] = v.items.map((it) => ({
    name: it.name, detail: it.category, qty: it.qty, amount: it.amount,
  }));
  const extra: [string, number][] = [
    ["운반", v.amountTransport],
    ["설치·철수", v.amountInstall],
    ["인력", v.amountLabor],
    ["기타", v.amountEtc],
  ];
  const subtotal = v.totalAmount + v.discountAmount;

  return (
    <article className="qs-doc" aria-label={`견적서 ${q.label} v${v.version}`}>
      {!isCurrent && <p className="qs-old qs-noprint">이전 버전(v{v.version})이에요. 지금 버전은 v{q.currentVersion}이에요.</p>}
      <div className="qs-doc__head">
        <h1>
          견적서<small>{q.label} · v{v.version}</small>
        </h1>
        <p className="qs-doc__no">
          <span className="qs-doc__brand">STAGE DUCK</span>
          견적서 번호 Q-{String(q.quoteId).padStart(5, "0")}-{v.version}
          <br />
          작성 {dateKo(v.createdAt, true)}
        </p>
      </div>

      <dl className="qs-meta">
        <div>
          <dt>공연</dt>
          <dd>{q.performanceTitle || "—"}</dd>
        </div>
        <div>
          <dt>공연일</dt>
          <dd>{dateKo(q.showDate)}</dd>
        </div>
        <div>
          <dt>단계</dt>
          <dd>{STAGE_LABEL[q.stageType] ?? q.stageType}</dd>
        </div>
        <div>
          <dt>업체</dt>
          <dd>{q.companyName || "—"}</dd>
        </div>
        {venue?.name && (
          <div>
            <dt>공간</dt>
            <dd>{venue.name}</dd>
          </div>
        )}
        <div>
          <dt>포함</dt>
          <dd>{includes.length ? includes.join(" · ") : "—"}</dd>
        </div>
        <div>
          <dt>유효 기한</dt>
          <dd>{dateKo(v.validUntil)}</dd>
        </div>
        <div>
          <dt>요청서</dt>
          <dd>v{v.basedOnPerfVersion} 기준</dd>
        </div>
      </dl>

      <h2 className="qs-h">항목</h2>
      <table className="qs-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>분류</th>
            <th className="r">수량</th>
            <th className="r">금액</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <b>{l.name}</b>
              </td>
              <td>{l.detail}</td>
              <td className="r">{l.qty ?? ""}</td>
              <td className="r">{won(l.amount)}</td>
            </tr>
          ))}
          {extra
            .filter(([, n]) => n > 0)
            .map(([name, n]) => (
              <tr key={name}>
                <td>
                  <b>{name}</b>
                </td>
                <td></td>
                <td className="r"></td>
                <td className="r">{won(n)}</td>
              </tr>
            ))}
        </tbody>
        <tfoot>
          {v.discountAmount > 0 && (
            <>
              <tr className="is-sub">
                <td colSpan={3}>항목 합계</td>
                <td className="r">{won(subtotal)}</td>
              </tr>
              <tr className="is-sub">
                <td colSpan={3}>업체할인</td>
                <td className="r">− {won(v.discountAmount)}</td>
              </tr>
            </>
          )}
          <tr className="is-total">
            <td colSpan={3}>합계 (부가세 포함)</td>
            <td className="r">{won(v.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      <h2 className="qs-h">설치·운영 조건</h2>
      <dl className="qs-meta">
        {v.checkinTime && (
          <div>
            <dt>입실</dt>
            <dd>{hm(v.checkinTime)}</dd>
          </div>
        )}
        <div>
          <dt>설치</dt>
          <dd>
            {hm(v.setupStart)} 시작{setupEnd ? ` · ${setupEnd} 완료` : ""}
          </dd>
        </div>
        <div>
          <dt>철수</dt>
          <dd>{v.teardownMinutes != null ? `${v.teardownMinutes}분` : "—"}</dd>
        </div>
        <div>
          <dt>인력</dt>
          <dd>{v.staff.length ? v.staff.map((s) => `${s.role} ${s.count}명 (${hm(s.start)}~${hm(s.end)})`).join(", ") : "—"}</dd>
        </div>
      </dl>
      {(v.extraCostNote || v.techNote) && (
        <p className="qs-note">
          {v.extraCostNote && <>추가 비용: {v.extraCostNote} </>}
          {v.techNote && <>· 기술 메모: {v.techNote}</>}
        </p>
      )}

      {isCurrent && q.checks.length > 0 && (
        <>
          <h2 className="qs-h">자동 검사</h2>
          <table className="qs-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>항목</th>
                <th>내용</th>
                <th className="r" style={{ width: 80 }}>
                  결과
                </th>
              </tr>
            </thead>
            <tbody>
              {q.checks.map((c) => (
                <tr key={c.id}>
                  <td>{CHECK_NAME[c.id] ?? c.id}</td>
                  <td>{c.message}</td>
                  <td className="r">
                    <span className={`qs-check qs-check--${c.result}`}>{CHECK_LABEL[c.result] ?? c.result}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="qs-note">소리 크기·장비 호환성은 자동으로 판단하지 않아요.</p>
        </>
      )}

      <p className="qs-foot">
        STAGE DUCK 포트폴리오 시연 서비스 · 테스트 견적서로 실제 청구되지 않습니다. 금액은 부가세 포함이며, 확정·결제 전에는 연락처가 공개되지 않아요.
      </p>
    </article>
  );
}

export function QuoteSheetPage() {
  const { quoteId, versionId } = useParams();
  const byId = useQuote(Number(quoteId), !!quoteId);
  const byVersion = useQuoteByVersion(Number(versionId), !!versionId);
  const query = quoteId ? byId : byVersion;
  const me = useMe();
  const [picked, setPicked] = useState<number | null>(null);
  usePageMeta(query.data ? `견적서 ${query.data.label}` : "견적서");

  if (query.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (!query.data)
    return (
      <main className="container main">
        <div className="empty">
          <Ico name="search" />
          <b>견적서를 찾을 수 없어요</b>
          <p>지워졌거나 볼 수 없는 견적서예요.</p>
          {!(query.error instanceof ApiError) && <ErrorNotice error={query.error} />}
        </div>
      </main>
    );

  const q = query.data;
  const versions = [...q.versions].sort((a, b) => b.version - a.version);
  const showing = versions.find((v) => v.version === (picked ?? q.currentVersion)) ?? q.current;
  const supplier = me.data?.role === "SUPPLIER";

  return (
    <main className="container main">
      <div className="qs-wrap">
        <Doc q={q} v={showing} isCurrent={showing.version === q.currentVersion} />
        <aside className="qs-side" aria-label="견적서 버전과 할 일">
          <div className="qs-side__box">
            <b>버전</b>
            <div className="qs-ver">
              {versions.map((v) => (
                <button key={v.version} type="button" aria-pressed={v.version === showing.version} onClick={() => setPicked(v.version)}>
                  <span>
                    v{v.version}
                    {v.version === q.currentVersion ? " · 지금" : ""}
                  </span>
                  <span>{won(v.totalAmount)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="qs-side__box">
            <button className="btn btn--primary btn--block" type="button" onClick={() => window.print()}>
              <Ico name="print" sm />
              인쇄하기
            </button>
            {supplier ? (
              q.status === "SENT" && (
                <Link className="btn btn--block mt-8" to={`/supplier/quotes/${q.quoteId}/edit`}>
                  견적서 고치기
                </Link>
              )
            ) : (
              <Link className="btn btn--block mt-8" to={`/performances/${q.performanceId}/compare`}>
                단계별 비교
              </Link>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
