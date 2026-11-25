/**
 * 관심 업체 (/favorites, 사용자). 이슈 #32, AC-F3-16·19.
 * - 저장한 업체 목록 (최근 저장 순) · 업체 프로필로 가기 · [빼기]
 * - 내 공연에 그 업체 부문의 단계가 열려 있으면 바로 [견적 요청하기] (AC-F3-19 "저장한 업체에 요청할까요?")
 */
import { type CSSProperties, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_STAGE, OFFER_STATUS_LABEL, useFavorites, useStageOffers, useToggleFavorite, type Favorite } from "../features/offer/api";
import { OfferDialog } from "../features/offer/OfferParts";
import { useMyPerformances } from "../features/performance/api";
import { STAGE_LABEL } from "../features/request/codes";
import { usePageMeta } from "../features/seo/usePageMeta";
import type { StageType } from "../shared/api/types";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import "../features/offer/offer.css";

const OPEN = ["OPEN", "NEGOTIATING"];
const CATEGORY_LABEL: Record<string, string> = { VENUE: "공연장", EQUIPMENT: "장비", INSTALL: "설치", ENGINEER: "엔지니어" };

interface OpenStage {
  stageId: number;
  stageType: StageType;
  title: string;
}

function Row({ f, open }: { f: Favorite; open: OpenStage | undefined }) {
  const remove = useToggleFavorite();
  const offers = useStageOffers(open?.stageId ?? null);
  const [asking, setAsking] = useState(false);
  const already = offers.data?.items.find((o) => o.supplierId === f.supplierId);
  return (
    <li>
      <span className="avatar" aria-hidden="true" style={f.imageUrl ? ({ "--img": `url('${f.imageUrl}')` } as CSSProperties) : undefined}>
        {f.imageUrl ? null : f.companyName.replace(/^업체\s*/, "").slice(0, 1)}
      </span>
      <div className="grow">
        <Link to={`/suppliers/${f.supplierId}`}>
          <b>{f.companyName}</b>
        </Link>
        <small>{f.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(" · ")}</small>
        {open && <small>{open.title} · {STAGE_LABEL[open.stageType]} 단계가 열려 있어요</small>}
      </div>
      {open &&
        (already ? (
          <span className="state">{OFFER_STATUS_LABEL[already.status]}</span>
        ) : (
          <button className="btn btn--sm btn--primary" type="button" onClick={() => setAsking(true)}>
            견적 요청하기
          </button>
        ))}
      <button
        className="btn btn--sm btn--ghost"
        type="button"
        disabled={remove.isPending}
        aria-label={`${f.companyName} 관심 업체에서 빼기`}
        onClick={() => remove.mutate({ supplierId: f.supplierId, save: false })}
      >
        빼기
      </button>
      {asking && open && (
        <OfferDialog
          stageId={open.stageId}
          stageType={open.stageType}
          title={open.title}
          supplierId={f.supplierId}
          companyName={f.companyName}
          onClose={() => setAsking(false)}
        />
      )}
    </li>
  );
}

export function FavoritesPage() {
  usePageMeta("관심 업체");
  const favorites = useFavorites(true);
  const mine = useMyPerformances();
  // 지금 열린 단계 (공연마다 하나). 같은 부문이 여러 공연에서 열려 있으면 공연일이 가까운 것 먼저
  const openStages: OpenStage[] = (mine.data?.active ?? [])
    .flatMap((p) => p.stages.filter((s) => OPEN.includes(s.status)).map((s) => ({ stageId: s.id, stageType: s.stageType, title: p.title, showDate: p.showDate })))
    .sort((a, b) => a.showDate.localeCompare(b.showDate));
  const openFor = (f: Favorite) => openStages.find((o) => f.categories.some((c) => CATEGORY_STAGE[c] === o.stageType));

  return (
    <>
      <KitPageTop title="관심 업체" crumbs={[{ label: "마이페이지", to: "/mypage" }, { label: "관심 업체" }]} desc="저장한 업체의 부문 단계가 열리면 여기서 바로 견적을 요청할 수 있어요." />
      <main className="container main">
        {favorites.isError && <ErrorNotice error={favorites.error} />}
        {favorites.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {favorites.data?.length === 0 && (
          <div className="empty">
            <Ico name="heart" />
            <b>저장한 업체가 없어요</b>
            <p>공간 찾기·업체 찾기에서 [관심 업체 저장]을 눌러 두세요.</p>
            <div className="btns mt-12">
              <Link className="btn btn--sm" to="/venues">
                공간 찾기
              </Link>
              <Link className="btn btn--sm" to="/board">
                업체 찾기
              </Link>
            </div>
          </div>
        )}
        {!!favorites.data?.length && (
          <ul className="offer-list" aria-label="관심 업체 목록">
            {favorites.data.map((f) => (
              <Row key={f.supplierId} f={f} open={openFor(f)} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
