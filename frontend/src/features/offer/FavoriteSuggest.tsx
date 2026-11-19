/**
 * AC-F3-19: 관심 업체로 저장해 둔 업체의 부문 단계가 열리면 "저장한 업체에 견적을 요청할까요?" 안내.
 * 내 공연 화면(/performances/:id)의 지금 단계(STEP) 안에 놓는다. 저장한 업체가 없거나 그 부문 업체가 없으면 그리지 않는다.
 */
import { useState } from "react";
import type { StageSummary } from "../../shared/api/types";
import { STAGE_LABEL } from "../request/codes";
import { CATEGORY_STAGE, OFFER_STATUS_LABEL, useFavorites, useStageOffers, type Favorite } from "./api";
import { OfferDialog } from "./OfferParts";
import "./offer.css";

export function FavoriteSuggest({ stage, title }: { stage: StageSummary; title: string }) {
  const favorites = useFavorites(true);
  const offers = useStageOffers(stage.id);
  const [asking, setAsking] = useState<Favorite | null>(null);
  const matched = (favorites.data ?? []).filter((f) => f.categories.some((c) => CATEGORY_STAGE[c] === stage.stageType));
  if (matched.length === 0) return null;
  const full = !!offers.data && offers.data.activeCount >= offers.data.limit;

  return (
    <div className="offer-suggest" role="group" aria-label="저장한 업체에 견적 요청">
      <b>
        저장한 {STAGE_LABEL[stage.stageType]} 업체에 견적을 요청할까요?
        {offers.data && <span className="muted sd-num"> · {offers.data.activeCount} / {offers.data.limit}곳</span>}
      </b>
      <ul className="offer-list">
        {matched.map((f) => {
          const sent = offers.data?.items.find((o) => o.supplierId === f.supplierId);
          return (
            <li key={f.supplierId}>
              <div className="grow">
                <b>{f.companyName}</b>
              </div>
              {sent ? (
                <span className="state">{OFFER_STATUS_LABEL[sent.status]}</span>
              ) : (
                <button className="btn btn--sm btn--primary" type="button" disabled={full} onClick={() => setAsking(f)}>
                  견적 요청하기
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {asking && (
        <OfferDialog
          stageId={stage.id}
          stageType={stage.stageType}
          title={title}
          supplierId={asking.supplierId}
          companyName={asking.companyName}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}
