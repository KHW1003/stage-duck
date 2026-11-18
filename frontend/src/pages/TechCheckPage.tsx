/**
 * 기술 확인 (/supplier/tech/:performanceId). 목업: mockup-v4/pages/p-tech.html · FR-TECH-01 · AC-F3-25 · #49
 * 요약(전체·답변 완료·내가 답할 항목) + 확인 항목 표 + 항목 추가 창.
 * - 항목은 엔지니어(또는 엔지니어 포함 업체)가 정하고, 각 업체는 자기 담당 항목에만 답한다 (서버가 mine 으로 알려 준다)
 * - 내 항목: 답변 전이면 바로 입력칸(작성 중), 답변했으면 [고치기]로 다시 연다. 남의 항목은 "업체 C만 답할 수 있어요"
 * - 자동 판정 없음 — 답변은 참고용
 * /supplier/tech (공연 번호 없음)는 공고 목록에서 들어오라는 안내. 서버: backend/app/tech (#49)
 */
import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAddTechCheck, useAnswerTechCheck, useTechChecks, type TechCheckItem, type TechCheckList } from "../features/tech/api";
import { dateLabel } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { ApiError } from "../shared/api/client";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { NotFound } from "../shared/layout/NotFound";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import { KitModal } from "../shared/ui/KitModal";
import "./tech-check.css";

/** 항목 글자로 고르는 아이콘 (목업과 같은 모양). 맞는 게 없으면 공구 */
export function techIcon(item: string): KitIconName {
  if (/콘센트|전원|전기/.test(item)) return "plug";
  if (/반입|동선|엘리베이터|주차/.test(item)) return "elevator";
  if (/음량|소리|데시벨|민원/.test(item)) return "volume";
  if (/믹서|FOH|콘솔|자리/.test(item)) return "sliders";
  if (/마이크|마이킹|채널/.test(item)) return "mic";
  return "tool";
}

function AnswerCell({ row, performanceId }: { row: TechCheckItem; performanceId: number }) {
  const answer = useAnswerTechCheck(performanceId);
  const answered = row.answer !== "UNCONFIRMED";
  const [editing, setEditing] = useState(!answered);
  const [memo, setMemo] = useState(row.memo ?? "");
  const err = answer.error instanceof ApiError ? answer.error.body.message : null;

  if (!row.mine) {
    return (
      <>
        <td className="l">{answered ? row.memo : "아직 답변 전"}</td>
        <td>
          <span className={answered ? "state state--done" : "state state--on"}>{answered ? "답변함" : "대기"}</span>
        </td>
        <td className="small">{answered ? "" : `${row.ownerLabel.replace(/\s*\(.*\)$/, "")}만 답할 수 있어요`}</td>
      </>
    );
  }
  if (!editing) {
    return (
      <>
        <td className="l">{row.memo}</td>
        <td>
          <span className="state state--done">답변함</span>
        </td>
        <td>
          <button className="btn btn--xs" type="button" onClick={() => setEditing(true)}>
            고치기
          </button>
        </td>
      </>
    );
  }
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!memo.trim()) return;
    answer.mutate({ id: row.id, memo: memo.trim() }, { onSuccess: () => setEditing(false) });
  };
  return (
    <>
      <td className="l">
        <form id={`tech-${row.id}`} onSubmit={save}>
          <input className="input tech__input" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label={`${row.item} 답변`} maxLength={500} />
        </form>
        {err && (
          <p className="field__error mt-4" role="alert">
            <Ico name="warn" sm />
            {err}
          </p>
        )}
      </td>
      <td>
        <span className="state state--on">작성 중</span>
      </td>
      <td>
        <button className="btn btn--xs btn--primary" type="submit" form={`tech-${row.id}`} disabled={answer.isPending || !memo.trim()}>
          답변 저장
        </button>
      </td>
    </>
  );
}

function AddModal({ data, onClose }: { data: TechCheckList; onClose: () => void }) {
  const add = useAddTechCheck(data.performance.id);
  const [item, setItem] = useState("");
  const [detail, setDetail] = useState("");
  const [owner, setOwner] = useState(data.owners[0]?.supplierId ?? 0);
  const err = add.error instanceof ApiError ? add.error.body.message : null;
  return (
    <KitModal
      title="항목 추가"
      onClose={onClose}
      busy={add.isPending}
      foot={
        <>
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={!item.trim() || !owner || add.isPending}
            onClick={() => add.mutate({ item: item.trim(), detail: detail.trim(), ownerSupplierId: owner }, { onSuccess: onClose })}
          >
            추가
          </button>
        </>
      }
    >
      <div className="stack" style={{ "--gap": "14px" } as CSSProperties}>
        <label className="field">
          <span className="field__label">항목</span>
          <input className="input" value={item} onChange={(e) => setItem(e.target.value)} maxLength={200} placeholder="예: 무대 콘센트 위치·구 수" />
        </label>
        <label className="field">
          <span className="field__label">
            설명<span className="opt">선택</span>
          </span>
          <input className="input" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={200} placeholder="예: 믹서와 스피커 전원을 따로 쓰고 싶어요" />
        </label>
        <label className="field">
          <span className="field__label">답할 업체</span>
          <select className="select" value={owner} onChange={(e) => setOwner(Number(e.target.value))}>
            {data.owners.map((o) => (
              <option key={o.supplierId} value={o.supplierId}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {err && (
          <p className="field__error" role="alert">
            <Ico name="warn" sm />
            {err}
          </p>
        )}
      </div>
    </KitModal>
  );
}

export function TechCheckView({ data }: { data: TechCheckList }) {
  const [adding, setAdding] = useState(false);
  const total = data.items.length;
  const done = data.items.filter((i) => i.answer !== "UNCONFIRMED").length;
  const mineLeft = data.items.filter((i) => i.mine && i.answer === "UNCONFIRMED").length;
  return (
    <>
      <KitPageTop
        title="기술 확인"
        crumbs={[{ label: "기술 확인" }]}
        meta={[data.performance.title, dateLabel(data.performance.showDate), data.performance.statusLabel, `항목 담당: ${data.creator?.name ?? "엔지니어 확정 전"}`]}
        actions={
          data.canAdd && (
            <button className="btn btn--sm btn--primary" type="button" onClick={() => setAdding(true)}>
              <Ico name="plus" sm />
              항목 추가
            </button>
          )
        }
      />
      <main className="container main">
        <div className="summary" style={{ "--cols": 3 } as CSSProperties}>
          {(
            [
              ["list", "전체 항목", total, false],
              ["pass", "답변 완료", done, false],
              ["edit", "내가 답할 항목", mineLeft, true],
            ] as [KitIconName, string, number, boolean][]
          ).map(([icon, label, n, on]) => (
            <div key={label} className={on ? "has-ico is-on" : "has-ico"}>
              <span className="ico-box">
                <Ico name={icon} />
              </span>
              <div>
                <span>{label}</span>
                <b>
                  {n}
                  <small>개</small>
                </b>
              </div>
            </div>
          ))}
        </div>
        <section className="sec mt-40">
          <div className="sec-head">
            <h2>
              <Ico name="list" />
              확인 항목
            </h2>
            <p>공연 전에 업체끼리 확인할 것들이에요.</p>
          </div>
          {total === 0 ? (
            <div className="empty">
              <Ico name="list" />
              <b>아직 확인 항목이 없어요</b>
              <p>
                {data.canAdd
                  ? "[항목 추가]로 공연 전에 확인할 것을 정해 주세요."
                  : data.creator
                    ? `${data.creator.name}가 항목을 정하면 여기에 보여요.`
                    : "엔지니어(또는 엔지니어를 포함한 장비 업체)가 확정되면 항목을 정할 수 있어요."}
              </p>
            </div>
          ) : (
            <div className="table-box">
              <table className="table tech__table">
                <thead>
                  <tr>
                    <th>항목</th>
                    <th className="tech__owner">담당</th>
                    <th>답변</th>
                    <th className="tech__state">상태</th>
                    <th className="tech__act">
                      <span className="sr-only">할 일</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id} className={row.mine && row.answer === "UNCONFIRMED" ? "is-on" : !row.mine && row.answer === "UNCONFIRMED" ? "is-off" : undefined}>
                      <td className="l">
                        <div className="with-thumb">
                          <span className="ico-box ico-box--sm">
                            <Ico name={techIcon(row.item)} />
                          </span>
                          <div>
                            <b>{row.item}</b>
                            {row.detail && <small>{row.detail}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {row.ownerLabel.replace(/\s*\(나\)$/, "")}
                        {row.mine && " (나)"}
                      </td>
                      <AnswerCell row={row} performanceId={data.performance.id} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="bullets mt-16">
            <li>답변은 참고용이에요. 소리 크기나 장비 호환성은 STAGE DUCK이 판정하지 않아요.</li>
            <li>결제 뒤에는 최종 담당표에서 서로 연락할 수 있어요.</li>
          </ul>
        </section>
      </main>
      {adding && <AddModal data={data} onClose={() => setAdding(false)} />}
    </>
  );
}

export function TechCheckPage() {
  usePageMeta("기술 확인");
  const id = Number(useParams().performanceId);
  const list = useTechChecks(id);
  if (!Number.isInteger(id) || (list.error instanceof ApiError && list.error.status === 404)) return <NotFound />;
  if (!list.data) return <p className="sd-sr-only">불러오는 중이에요</p>;
  return <TechCheckView data={list.data} />;
}

/** /supplier/tech: 공연을 고르지 않고 들어왔을 때 */
export function TechCheckIndexPage() {
  usePageMeta("기술 확인");
  return (
    <>
      <KitPageTop title="기술 확인" crumbs={[{ label: "기술 확인" }]} />
      <main className="container main">
        <div className="empty">
          <Ico name="tool" />
          <b>공연을 먼저 골라 주세요</b>
          <p>컨펌한 공고의 상세에서 [기술 확인]으로 들어오면 그 공연의 확인 항목이 보여요.</p>
          <Link className="btn btn--sm" to="/supplier/postings">
            공고 목록
          </Link>
        </div>
      </main>
    </>
  );
}
