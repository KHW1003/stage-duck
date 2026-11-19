/**
 * 업체 프로필 (/suppliers/:id, #33). 목업 v4 supplier.html · FR-PROFILE-01 · AC-F5-15 (방문자도 본다).
 * 보이는 것: 상호·대표 이미지·승인 부문·입점일·소개·업체 정보·소개 글·등록 공간.
 * 전화번호·사업자 서류는 서버도 돌려주지 않는다 (CLAUDE.md 20).
 * 목업과 다르게 정한 것: "거래 n건"은 2번 함수가 생기면 붙인다, [관심 업체 저장]은 #32, 활동 지역은 서버 칸이 없어 뺐다.
 */
import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { PR_CATEGORY_LABEL, monthDay } from "../features/board/labels";
import { useSupplierProfile } from "../features/profile/api";
import { categoriesLabel, initialOf, yearMonth } from "../features/profile/labels";
import "../features/profile/profile.css";
import { usePageMeta } from "../features/seo/usePageMeta";
import type { VenueTypeCode } from "../features/venue/api";
import { shortSido, venuePhotos, won } from "../features/venue/view";
import { ApiError } from "../shared/api/client";
import type { SupplierProfile } from "../shared/api/types";
import { NotFound } from "../shared/layout/NotFound";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";

const UNKNOWN = "미확인";
const unit = (n: number | null, u: string) => (n == null ? UNKNOWN : `${n}${u}`);
const yesNo = (v: boolean | null, yes: string, no: string) => (v == null ? UNKNOWN : v ? yes : no);
const photoStyle = (url: string | null) => (url ? ({ "--img": `url('${url}')` } as CSSProperties) : undefined);

function InfoTable({ s }: { s: SupplierProfile }) {
  return (
    <div className="table-box">
      <table className="info-table">
        <tbody>
          <tr>
            <th scope="row">승인 부문</th>
            <td>{categoriesLabel(s.categories)}</td>
            <th scope="row">기본 설치</th>
            <td>{unit(s.setupMinutes, "분")}</td>
          </tr>
          <tr>
            <th scope="row">기본 철수</th>
            <td>{unit(s.teardownMinutes, "분")}</td>
            <th scope="row">엔지니어 경력</th>
            <td>{unit(s.engineerYears, "년")}</td>
          </tr>
          <tr>
            <th scope="row">밴드 공연 경험</th>
            <td>{yesNo(s.bandExperience, "있음", "없음")}</td>
            <th scope="row">배상책임보험</th>
            <td>
              {yesNo(s.hasLiabilityInsurance, "가입", "가입 안 함")} <span className="tag">업체 입력</span>
            </td>
          </tr>
          <tr>
            <th scope="row">음향 자격</th>
            <td colSpan={3}>{s.soundCertification ?? UNKNOWN}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function SupplierProfilePage() {
  const id = Number(useParams().id);
  const profile = useSupplierProfile(id);
  usePageMeta(profile.data?.companyName);

  if (!Number.isInteger(id) || (profile.error instanceof ApiError && profile.error.status === 404)) return <NotFound />;
  if (profile.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (profile.isError) {
    return (
      <div className="container main">
        <ErrorNotice error={profile.error} />
      </div>
    );
  }

  const s = profile.data;
  return (
    <>
      <div className="page-top">
        <div className="container page-top__inner">
          <div className="who">
            <span
              className="avatar avatar--lg"
              role={s.imageUrl ? "img" : undefined}
              aria-label={s.imageUrl ? `${s.companyName} 사진` : undefined}
              aria-hidden={s.imageUrl ? undefined : true}
              style={photoStyle(s.imageUrl)}
            >
              {initialOf(s.companyName)}
            </span>
            <div>
              <ol className="page-top__crumb" aria-label="현재 위치">
                <li>
                  <Link to="/board">업체 찾기</Link>
                </li>
                <li>업체 프로필</li>
              </ol>
              <h1>{s.companyName}</h1>
              <div className="page-top__meta">
                <span>{categoriesLabel(s.categories)}</span>
                <span>{yearMonth(s.joinedAt)} 입점</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container main">
        {s.intro && (
          <section className="sec">
            <div className="sec-head">
              <h2>
                <Ico name="info" />
                소개
              </h2>
            </div>
            <p className="desc profile-intro">{s.intro}</p>
          </section>
        )}
        <section className="sec">
          <div className="sec-head">
            <h2>
              <Ico name="building" />
              업체 정보
            </h2>
          </div>
          <InfoTable s={s} />
          <p className="field__hint mt-8">전화번호와 사업자 서류는 공개하지 않아요.</p>
        </section>
        {s.posts.length > 0 && (
          <section className="sec">
            <div className="sec-head">
              <h2>
                <Ico name="edit" />
                소개 글 <em>{s.posts.length}</em>
              </h2>
            </div>
            <div className="list" style={{ "--list-cols": "160px minmax(0,1fr) auto" } as CSSProperties}>
              {s.posts.map((p) => (
                <Link key={p.id} className="list__item" to={`/board/${p.id}`}>
                  <div className="photo" role="img" aria-label={`${s.companyName} 소개 글 사진`} style={photoStyle(p.thumbUrl)} />
                  <div>
                    <p className="list__title">
                      <span className="prefix">{PR_CATEGORY_LABEL[p.category]}</span>
                      {p.title}
                    </p>
                    <div className="list__meta">
                      <span>{monthDay(p.bumpedAt)} 끌어올림</span>
                    </div>
                  </div>
                  <span className="link">
                    보기
                    <Ico name="right" sm />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {s.venues.length > 0 && (
          <section className="sec">
            <div className="sec-head">
              <h2>
                <Ico name="venue" />
                등록 공간 <em>{s.venues.length}</em>
              </h2>
            </div>
            <div className="list" style={{ "--list-cols": "160px minmax(0,1fr) auto" } as CSSProperties}>
              {s.venues.map((v) => (
                <Link key={v.id} className="list__item" to={`/venues/${v.id}`}>
                  <div
                    className="photo"
                    role="img"
                    aria-label={`${v.name} 사진`}
                    style={photoStyle(venuePhotos({ id: v.id, venueType: v.venueType as VenueTypeCode })[0])}
                  />
                  <div>
                    <p className="list__title">{v.name}</p>
                    <div className="list__meta">
                      <span>
                        {shortSido(v.sido)} {v.sigungu}
                      </span>
                      <span>최대 {v.maxCapacity}명</span>
                      <span>{won(v.rentalFee)}</span>
                    </div>
                  </div>
                  <span className="link">
                    보기
                    <Ico name="right" sm />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
