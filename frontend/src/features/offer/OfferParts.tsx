/**
 * 견적 요청·관심 업체 화면 조각 (이슈 #32, AC-F3-16~19). 공간 상세·소개 글·관심 업체·내 공연에서 같이 쓴다.
 * - FavoriteButton: 관심 업체 저장 (하트). 방문자는 로그인으로, 업체·관리자에게는 안 보인다
 * - OfferPicker: 내 공연 중 이 업체 부문의 단계가 열린 공연을 골라 [견적 요청하기] (n / 10곳, 이미 요청했으면 상태)
 * - OfferDialog: 한마디(선택)를 적어 보낸다. 연락처 모양이면 서버가 400 → 칸 아래에 그 문구
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { StageType } from "../../shared/api/types";
import { layoutKindOf, useMe } from "../../shared/auth/useMe";
import { ErrorNotice, fieldErrorOf } from "../../shared/ui/ErrorText";
import { Ico } from "../../shared/ui/Ico";
import { KitModal } from "../../shared/ui/KitModal";
import { useMyPerformances } from "../performance/api";
import { dateLabel } from "../performance/labels";
import { STAGE_LABEL } from "../request/codes";
import { OFFER_STATUS_LABEL, useFavorites, useSendOffer, useStageOffers, useToggleFavorite } from "./api";
import "./offer.css";
import { Select } from "../../shared/ui/Select";

const OPEN = ["OPEN", "NEGOTIATING"];

/** 관심 업체 저장 (볼더 없음, 호버하면 하트가 차고 저장하면 하트 방울이 떠오른다 — 11/19 피드백) */
export function FavoriteButton({ supplierId, next, className = "btn btn--sm" }: { supplierId: number; next: string; className?: string }) {
  const me = useMe();
  const kind = layoutKindOf(me.data);
  const user = kind === "user";
  const favorites = useFavorites(user);
  const toggle = useToggleFavorite();
  const navigate = useNavigate();
  const [burst, setBurst] = useState(0);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  if (kind !== "user" && kind !== "guest") return null;
  const saved = optimistic ?? !!favorites.data?.some((f) => f.supplierId === supplierId);

  const onClick = () => {
    if (!user) {
      navigate(`/login?next=${next}`);
      return;
    }
    const save = !saved;
    if (save) setBurst((n) => n + 1);
    setOptimistic(save);
    toggle.mutate({ supplierId, save }, { onSettled: () => setOptimistic(null) });
  };

  return (
    <button className={`${className} fav-btn`} type="button" aria-pressed={saved} onClick={onClick}>
      <span className="fav-btn__icon">
        <Ico name="heart" sm />
        {burst > 0 && saved && (
          <span className="fav-btn__burst" key={burst} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} />
            ))}
          </span>
        )}
      </span>
      {saved ? "관심 업체 저장됨" : "관심 업체 저장"}
    </button>
  );
}

export function OfferDialog({
  stageId, stageType, title, supplierId, companyName, onClose,
}: { stageId: number; stageType: StageType; title: string; supplierId: number; companyName: string; onClose: () => void }) {
  const send = useSendOffer(stageId);
  const [message, setMessage] = useState("");
  const messageError = fieldErrorOf(send.error, "message");
  if (send.isSuccess) {
    return (
      <KitModal
        title="견적 요청하기"
        onClose={onClose}
        foot={
          <button className="btn btn--primary" type="button" onClick={onClose}>
            확인
          </button>
        }
      >
        <p className="modal__lead">{companyName}에 견적을 요청했어요</p>
        <p>48시간 안에 업체가 견적서를 보내거나 거절해요. 견적서가 오면 단계별 비교에 "내가 요청한 업체"로 보여요.</p>
      </KitModal>
    );
  }
  return (
    <KitModal
      title="견적 요청하기"
      onClose={onClose}
      busy={send.isPending}
      foot={
        <>
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={send.isPending}
            onClick={() => send.mutate({ supplierId, message: message.trim() || undefined })}
          >
            견적 요청하기
          </button>
        </>
      }
    >
      <p className="modal__lead">{companyName}에 견적을 요청할까요?</p>
      <p>
        {title} · {STAGE_LABEL[stageType]} 단계 · 응답 기한 48시간
      </p>
      <label className="field mt-16">
        <span className="field__label">
          한마디<span className="opt">선택</span>
        </span>
        <textarea
          className="textarea"
          placeholder="예: 리허설 17시부터 가능한지 궁금해요."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
          aria-invalid={!!messageError}
        />
        <span className={messageError ? "field__error" : "field__hint"}>{messageError ?? "전화번호·계좌번호는 적을 수 없어요."}</span>
      </label>
      {send.error && !messageError && (
        <div className="mt-12">
          <ErrorNotice error={send.error} />
        </div>
      )}
    </KitModal>
  );
}

/** 이 업체(부문 stageTypes)에게 보낼 수 있는 내 공연을 고르고 [견적 요청하기] */
export function OfferPicker({ supplierId, companyName, stageTypes, next }: { supplierId: number; companyName: string; stageTypes: StageType[]; next: string }) {
  const me = useMe();
  const user = layoutKindOf(me.data) === "user";
  const mine = useMyPerformances({ enabled: user });
  const open = useMemo(
    () =>
      (mine.data?.active ?? []).flatMap((p) =>
        p.stages.filter((s) => stageTypes.includes(s.stageType) && OPEN.includes(s.status)).map((s) => ({ perf: p, stage: s })),
      ),
    [mine.data, stageTypes],
  );
  const [pick, setPick] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const chosen = open.find((o) => o.stage.id === pick) ?? open[0];
  const offers = useStageOffers(chosen?.stage.id ?? null);
  const already = offers.data?.items.find((o) => o.supplierId === supplierId);
  const full = !!offers.data && offers.data.activeCount >= offers.data.limit;
  const stageName = stageTypes.map((t) => STAGE_LABEL[t]).join("·");

  if (!user) {
    // 이미 로그인한 업체·관리자에게는 [로그인]을 보여 주지 않는다 (11/26)
    return (
      <div className="offer-pick">
        {me.data ? (
          <p className="small muted">견적 요청은 공연을 준비하는 뮤지션 계정만 할 수 있어요.</p>
        ) : (
          <>
            <p className="small muted">공연을 준비하는 뮤지션으로 로그인하면 견적을 요청할 수 있어요.</p>
            <Link className="btn btn--primary btn--lg btn--block mt-12" to={`/login?next=${next}`}>
              로그인
            </Link>
          </>
        )}
      </div>
    );
  }
  if (mine.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (!chosen) {
    return (
      <div className="offer-pick">
        <p className="small muted">{stageName} 단계가 열린 공연이 없어요. 관심 업체로 저장해 두면 그 단계가 열릴 때 내 공연 화면에서 바로 요청할 수 있어요.</p>
        <Link className="btn btn--lg btn--block mt-12" to="/performances/new">
          요청서 쓰기
        </Link>
      </div>
    );
  }

  return (
    <div className="offer-pick">
      <label className="field">
        <span className="field__label">내 공연</span>
        <Select
          value={String(chosen.stage.id)}
          options={open.map((o) => ({ value: String(o.stage.id), label: `${o.perf.title} · ${STAGE_LABEL[o.stage.stageType]} 단계` }))}
          onChange={(v) => setPick(Number(v))}
        />
      </label>
      <dl className="sum-rows mt-12">
        <div>
          <dt>공연 날짜</dt>
          <dd>{dateLabel(chosen.perf.showDate)}</dd>
        </div>
        <div>
          <dt>관객</dt>
          <dd>{chosen.perf.audience}명</dd>
        </div>
        <div>
          <dt>이 단계 견적 요청</dt>
          <dd className="sd-num">{offers.data ? `${offers.data.activeCount} / ${offers.data.limit}곳` : "—"}</dd>
        </div>
      </dl>
      {already ? (
        <p className="offer-pick__done mt-12" role="status">
          <Ico name="pass" sm />
          이미 요청했어요 · {OFFER_STATUS_LABEL[already.status]}
        </p>
      ) : (
        <button className="btn btn--primary btn--lg btn--block mt-12" type="button" disabled={full} onClick={() => setAsking(true)}>
          견적 요청하기
        </button>
      )}
      {full && !already && <p className="field__hint mt-8">한 단계에 동시에 10곳까지 요청할 수 있어요.</p>}
      <p className="field__hint mt-8">연락처는 결제 뒤 최종 담당표에서 공개돼요.</p>
      {asking && (
        <OfferDialog
          stageId={chosen.stage.id}
          stageType={chosen.stage.stageType}
          title={chosen.perf.title}
          supplierId={supplierId}
          companyName={companyName}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}
