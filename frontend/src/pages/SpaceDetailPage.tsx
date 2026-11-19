/**
 * 공간 상세 (/venues/:id). 목업: mockup-v4/pages/space.html · FR-SPACE-01·03 · FR-OFFER-01 · AC-F3-16
 * 사진(큰 사진 + 작은 사진 줄) · 요약표 · 오른쪽 견적 요청 상자(스크롤을 따라옴) · 탭(공간 조건 / 기본 장비·인력 / 소개 / 이용 안내).
 * - 작은 사진을 누르면 큰 사진이 바뀐다
 * - 탭을 누르면 그 구역으로 내려가고, 스크롤하면 지금 보이는 구역의 탭에 표시가 옮겨 간다
 * - 견적 요청 상자: 로그인한 사용자의 공연 중 공연장 단계가 열린 공연만 고를 수 있다 (내 공연 API).
 *   [견적 요청하기]는 POST /stages/{id}/offers (#32). 신고(공간)는 서버 API 가 아직 없어 창까지만 연다
 * 연락처는 보이지 않는다. 서버 GET /venues/{id} — 조건의 null 은 "미확인". 사진은 공간 유형별 기본 사진 (features/venue/view).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { FavoriteButton, OfferPicker } from "../features/offer/OfferParts";
import type { StageType } from "../shared/api/types";
import { usePageMeta } from "../features/seo/usePageMeta";
import { useVenue, type VenueDetail } from "../features/venue/api";
import { TYPE_LABEL, hm, shortSido, venuePhotos, won, yesNo } from "../features/venue/view";
import { ApiError } from "../shared/api/client";
import { NotFound } from "../shared/layout/NotFound";
import { Ico } from "../shared/ui/Ico";
import { KitModal } from "../shared/ui/KitModal";

const VENUE_STAGE: StageType[] = ["VENUE"];
import "./space-detail.css";

const TABS = [
  { id: "cond", label: "공간 조건" },
  { id: "gear", label: "기본 장비·인력" },
  { id: "intro", label: "소개" },
  { id: "notice", label: "이용 안내" },
];

function Gallery({ name, photos }: { name: string; photos: string[] }) {
  const [cur, setCur] = useState(0);
  return (
    <div className="gallery">
      <div className="photo gallery__main" role="img" aria-label={`${name} 사진 ${cur + 1}`} style={{ "--img": `url('${photos[cur]}')` } as CSSProperties}>
        <span className="gallery__count">
          <b>{cur + 1}</b> / {photos.length}
        </span>
      </div>
      <div className="gallery__thumbs" style={{ "--cols": 5 } as CSSProperties}>
        {photos.map((p, i) => (
          <button
            key={p}
            type="button"
            aria-current={i === cur ? "true" : undefined}
            aria-label={`사진 ${i + 1}`}
            style={{ "--img": `url('${p}')` } as CSSProperties}
            onClick={() => setCur(i)}
          />
        ))}
      </div>
    </div>
  );
}

/** 스크롤하면 지금 보이는 구역의 탭을 고른다 */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

function OfferBox({ v }: { v: VenueDetail }) {
  return (
    <aside className="side-box offer-fixed" aria-label="견적 요청하기">
      <div className="side-box__sec">
        <p className="side-box__title">이 업체에 견적 요청하기</p>
        <p className="small muted">내 공고를 먼저 보여 줘요. 업체는 48시간 안에 견적서를 보내거나 거절해요.</p>
      </div>
      <div className="side-box__sec">
        <OfferPicker supplierId={v.supplierId} companyName={v.companyName} stageTypes={VENUE_STAGE} next={`/venues/${v.id}`} />
      </div>
    </aside>
  );
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const [reason, setReason] = useState("연락처·외부 거래 유도");
  const [tried, setTried] = useState(false);
  return (
    <KitModal
      title="신고하기"
      onClose={onClose}
      foot={
        <>
          <button className="btn" type="button" onClick={onClose}>
            취소
          </button>
          <button className="btn btn--primary" type="button" onClick={() => setTried(true)}>
            신고하기
          </button>
        </>
      }
    >
      <p className="modal__lead">무엇이 문제인가요?</p>
      <p>관리자가 확인한 뒤 경고나 숨김 처리를 해요.</p>
      <div className="stack mt-16" style={{ "--gap": "8px" } as CSSProperties} role="radiogroup">
        {["연락처·외부 거래 유도", "사실과 다른 정보", "기타"].map((r) => (
          <label key={r} className="check">
            <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
            {r}
          </label>
        ))}
      </div>
      <textarea className="textarea mt-12" aria-label="내용" />
      {tried && (
        <div className="notice mt-12" role="status">
          <Ico name="info" />
          <div>공간 신고는 곧 열려요. 급하면 1:1 문의로 알려 주세요.</div>
        </div>
      )}
    </KitModal>
  );
}

/** 부대 시설 한 줄: "대기실 있음 · 무대 단상 있음 · 주차 미확인" */
function facilities(v: VenueDetail): string {
  return [
    `대기실 ${yesNo(v.hasWaitingRoom, "있음", "없음")}`,
    `무대 단상 ${yesNo(v.hasStagePlatform, "있음", "없음")}`,
    `주차 ${yesNo(v.hasParking, "있음", "없음")}`,
  ].join(" · ");
}

export function SpaceDetailPage() {
  const id = Number(useParams().id);
  const venue = useVenue(id);
  const v = venue.data;
  usePageMeta(v ? `${v.name} · ${v.sigungu} ${v.maxCapacity}명 공연 공간` : null);
  const active = useActiveSection(useMemo(() => TABS.map((t) => t.id), []));
  const [modal, setModal] = useState<{ kind: "report" } | null>(null);
  if (!Number.isInteger(id) || (venue.error instanceof ApiError && venue.error.status === 404)) return <NotFound />;
  if (!v) return <p className="sd-sr-only">불러오는 중이에요</p>;
  const photos = venuePhotos(v);
  const region = shortSido(v.sido);

  return (
    <div className="space-page">
      <div className="page-top">
        <div className="container page-top__inner space__crumb-row">
          <ol className="page-top__crumb" aria-label="현재 위치">
            <li>
              <Link to="/venues">공간 찾기</Link>
            </li>
            <li>
              <Link to={`/venues?sido=${encodeURIComponent(region)}`}>{region}</Link>
            </li>
            <li>{v.name}</li>
          </ol>
        </div>
      </div>
      <div className="space-wrap">
        <main className="container main">
          <div className="detail-top">
            <Gallery name={v.name} photos={photos} />
            <div>
              <p className="detail-top__meta">
                {region} {v.sigungu} · {TYPE_LABEL[v.venueType]}
              </p>
              <h1>{v.name}</h1>
              <div className="chips-ico mt-16">
                <div>
                  <span className="ico-box ico-box--sm">
                    <Ico name="users" />
                  </span>
                  <div>
                    <span>수용 인원</span>
                    <b>{v.maxCapacity}명</b>
                  </div>
                </div>
                <div>
                  <span className="ico-box ico-box--sm">
                    <Ico name="door" />
                  </span>
                  <div>
                    <span>입실</span>
                    <b>{hm(v.checkinTime)}</b>
                  </div>
                </div>
                <div>
                  <span className="ico-box ico-box--sm">
                    <Ico name="music" />
                  </span>
                  <div>
                    <span>밴드 공연</span>
                    <b>{yesNo(v.bandAllowed)}</b>
                  </div>
                </div>
              </div>
              <table className="info-table">
                <tbody>
                  <tr>
                    <th>업체</th>
                    <td>
                      <span className="link link--point">{v.companyName}</span>
                    </td>
                  </tr>
                  <tr>
                    <th>퇴실 마감</th>
                    <td className="num">{hm(v.checkoutTime)}</td>
                  </tr>
                  <tr>
                    <th>장비 설치</th>
                    <td className="num">{hm(v.checkinTime)}부터 가능</td>
                  </tr>
                  <tr>
                    <th>{v.hasResidentEngineer ? "이용료" : "대관료"}</th>
                    <td className="strong num">
                      {won(v.rentalFee)} <span className="muted small space__vat">부가세 포함</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="btns mt-16">
                <FavoriteButton supplierId={v.supplierId} next={`/venues/${v.id}`} />
                <button className="btn btn--sm btn--ghost" type="button" onClick={() => setModal({ kind: "report" })}>
                  <Ico name="flag" sm />
                  신고
                </button>
              </div>
            </div>
          </div>
        </main>
        <div className="band" />
        <div className="tab-bar space__tabs">
          <div className="container">
            <nav className="tabs" aria-label="공간 정보">
              {TABS.map((t) => (
                <a key={t.id} href={`#${t.id}`} aria-current={active === t.id ? "page" : undefined}>
                  {t.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
        <div className="container main">
          <section className="sec" id="cond">
            <div className="sec-head">
              <h2>
                <Ico name="venue" />
                공간 조건
              </h2>
            </div>
            <table className="info-table space__cond">
              <tbody>
                <tr>
                  <th>수용 인원</th>
                  <td>최대 {v.maxCapacity}명</td>
                  <th>공연장 등록</th>
                  <td>
                    {yesNo(v.hallRegistered, "등록", "미등록")} <span className="tag">업체 입력</span>
                  </td>
                </tr>
                <tr>
                  <th>입실</th>
                  <td className="num">{hm(v.checkinTime)}</td>
                  <th>퇴실 마감</th>
                  <td className="num">{hm(v.checkoutTime)}</td>
                </tr>
                <tr>
                  <th>외부 장비 반입</th>
                  <td>{yesNo(v.externalEquipmentAllowed)}</td>
                  <th>외부 엔지니어</th>
                  <td>{yesNo(v.externalEngineerAllowed, "허용", "불가")}</td>
                </tr>
                <tr>
                  <th>상주 엔지니어</th>
                  <td>{v.hasResidentEngineer ? "있음 (장비·엔지니어 포함)" : "없음"}</td>
                  <th>부대 시설</th>
                  <td>{facilities(v)}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section className="sec" id="gear">
            <div className="sec-head">
              <h2>
                <Ico name="speaker" />
                기본 장비·인력
              </h2>
              <p>업체가 적은 내용이에요. 공연 가능 여부는 업체 확인 뒤에 정해져요.</p>
            </div>
            {v.equipment.length > 0 ? (
              <div className="table-box">
                <table className="table table--fit">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>내용</th>
                      <th>수량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.equipment.map((g) => (
                      <tr key={`${g.category}-${g.name}`}>
                        <td>{g.category}</td>
                        <td className="l">{g.name}</td>
                        <td>{g.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="desc muted">기본 장비가 없어요. 장비·엔지니어는 다음 단계에서 따로 견적서를 받아요.</p>
            )}
          </section>
          <section className="sec" id="intro">
            <div className="sec-head">
              <h2>
                <Ico name="info" />
                소개
              </h2>
            </div>
            <p className="desc space__intro">
              {TYPE_LABEL[v.venueType]} · {region} {v.sigungu} · 최대 {v.maxCapacity}명. 입실 {hm(v.checkinTime)}, 퇴실 마감 {hm(v.checkoutTime)}.
              {v.bandAllowed === null && " 밴드 공연 가능 여부는 업체에 확인이 필요해요."}
            </p>
          </section>
          <section className="sec" id="notice">
            <div className="sec-head">
              <h2>
                <Ico name="info" />
                이용 안내
              </h2>
            </div>
            <ul className="bullets">
              <li>공간을 고른다고 예약되지 않아요. 요청서를 올리고 업체 견적서를 확정해야 정해져요.</li>
              <li>확정할 때의 공간 조건은 따로 보관돼요. 업체가 나중에 정보를 바꿔도 내 공연에는 그대로 남아요.</li>
              <li>결제 전에는 업체 연락처가 공개되지 않아요.</li>
            </ul>
          </section>
        </div>
        <div className="offer-col">
          <OfferBox v={v} />
        </div>
      </div>
      {modal?.kind === "report" && <ReportModal onClose={() => setModal(null)} />}
    </div>
  );
}
