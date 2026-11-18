/**
 * 공간 찾기 (/venues). 목업: mockup-v4/pages/spaces.html · FR-SPACE-03 · AC-F5-01
 * 분류 타일 + 조건표(지역·관객 수·공간 유형·조건·공연 날짜) → [공간 찾기]를 눌러야 결과가 바뀐다 (고르는 중에는 그대로).
 * 타일·정렬은 누르면 바로 바뀐다. 날짜를 넣어도 사이트는 판정하지 않는다 — "업체 확인 전" (CLAUDE.md 4장).
 * 지금 값은 features/venue/samples.ts (공개 공간 API 가 생기면 바꾼다). 메인에서 고른 조건(?sido=&type=&audience=)을 받는다.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePageMeta } from "../features/seo/usePageMeta";
import { DEFAULT_COND, SORTS, condFromQuery, condSummary, filterVenues, type Cond, type Sort } from "../features/venue/filter";
import { CONDITIONS, REGIONS, VENUES, VENUE_TYPES, won, type Condition, type VenueSample, type VenueType } from "../features/venue/samples";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import "./spaces.css";

const TILE_ICON: Record<VenueType, KitIconName> = { "전문 공연장": "ticket", 복합문화공간: "building", 루프탑: "sun", 정원: "tree", 창고: "warehouse" };

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function VenueCard({ v }: { v: VenueSample }) {
  return (
    <Link className="item-card" to={`/venues/${v.id}`}>
      <div className="photo" role="img" aria-label={`${v.name} ${v.type} 사진`} style={{ "--img": `url('${v.photos[0]}')` } as CSSProperties}>
        {v.fullSpec && <span className="photo__tag tag tag--fill">풀스펙</span>}
      </div>
      <p className="item-card__meta">
        {v.sido} {v.sigungu} · {v.type} · {v.company}
      </p>
      <p className="item-card__title">{v.name}</p>
      <div className="item-card__specs">
        {v.specs.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <p className="item-card__price">
        {won(v.price)}
        <small>{v.priceNote}</small>
      </p>
    </Link>
  );
}

export function SpacesPage() {
  usePageMeta("공간 찾기");
  const [query] = useSearchParams();
  const initial = useMemo(() => condFromQuery(query), [query]);
  const [draft, setDraft] = useState<Cond>(initial);
  const [applied, setApplied] = useState<Cond>(initial);
  const [tile, setTile] = useState<VenueType | null>(null);
  const [sort, setSort] = useState<Sort>("price");

  const results = useMemo(() => filterVenues(VENUES, applied, tile, sort), [applied, tile, sort]);
  const countOf = (t: VenueType | null) => filterVenues(VENUES, { ...applied, types: [...VENUE_TYPES] }, t, sort).length;
  const reset = () => {
    setDraft({ ...DEFAULT_COND, types: [...DEFAULT_COND.types] });
    setApplied({ ...DEFAULT_COND, types: [...DEFAULT_COND.types] });
    setTile(null);
  };

  return (
    <>
      <KitPageTop title="공간 찾기" crumbs={[{ label: "공간 찾기" }]} desc="수용 인원과 입실 시각, 기본 장비를 먼저 살펴보세요." />
      <main className="container main">
        <section className="sec">
          <div className="cat-tiles mb-16" role="group" aria-label="공간 유형">
            <button type="button" aria-pressed={tile === null} onClick={() => setTile(null)}>
              <Ico name="layers" />
              전체<small>{countOf(null)}곳</small>
            </button>
            {VENUE_TYPES.map((t) => (
              <button key={t} type="button" aria-pressed={tile === t} onClick={() => setTile(t)}>
                <Ico name={TILE_ICON[t]} />
                {t}
                <small>{countOf(t)}곳</small>
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(draft);
            }}
          >
            <div className="cond">
              <div>
                <span className="cond__th">지역</span>
                <span className="cond__td">
                  <span className="filters" role="group" aria-label="지역">
                    {REGIONS.map((r) => (
                      <button key={r} type="button" aria-pressed={draft.region === r} onClick={() => setDraft((d) => ({ ...d, region: r }))}>
                        {r}
                      </button>
                    ))}
                  </span>
                </span>
              </div>
              <div>
                <span className="cond__th">관객 수</span>
                <span className="cond__td">
                  <span className="unit cond__unit">
                    <input
                      className="input input--num"
                      inputMode="numeric"
                      aria-label="관객 수"
                      value={draft.audience}
                      onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    />
                    <span>명 이상</span>
                  </span>
                </span>
              </div>
              <div>
                <span className="cond__th">공간 유형</span>
                <span className="cond__td">
                  {VENUE_TYPES.map((t) => (
                    <label key={t} className="check">
                      <input type="checkbox" checked={draft.types.includes(t)} onChange={() => setDraft((d) => ({ ...d, types: toggle(d.types, t) }))} />
                      {t}
                    </label>
                  ))}
                </span>
              </div>
              <div>
                <span className="cond__th">조건</span>
                <span className="cond__td">
                  {CONDITIONS.map((k) => (
                    <label key={k} className="check">
                      <input
                        type="checkbox"
                        checked={draft.conditions.includes(k)}
                        onChange={() => setDraft((d) => ({ ...d, conditions: toggle<Condition>(d.conditions, k) }))}
                      />
                      {k}
                    </label>
                  ))}
                </span>
              </div>
              <div>
                <span className="cond__th">공연 날짜</span>
                <span className="cond__td">
                  <input className="input cond__date" type="date" aria-label="공연 날짜" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                  <span className="field__hint">날짜를 넣어도 업체 확인 전이에요.</span>
                </span>
              </div>
            </div>
            <div className="cond__foot">
              <button className="btn cond__reset" type="button" onClick={reset}>
                초기화
              </button>
              <button className="btn btn--primary cond__submit" type="submit">
                <Ico name="search" sm />
                공간 찾기
              </button>
            </div>
          </form>
        </section>

        <section className="sec" aria-live="polite">
          <div className="list-top">
            <p className="desc">
              {condSummary(applied, tile)} <b>{results.length}곳</b> {results.length > 0 && <span className="tag">업체 확인 전</span>}
            </p>
            <div className="filters" role="group" aria-label="정렬">
              {SORTS.map((s) => (
                <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {results.length > 0 ? (
            <>
              <div className="grid">
                {results.map((v) => (
                  <VenueCard key={v.id} v={v} />
                ))}
              </div>
              <nav className="pagination" aria-label="쪽">
                <span aria-current="page">1</span>
              </nav>
            </>
          ) : (
            <div className="empty">
              <Ico name="search" />
              <b>조건에 맞는 공간이 없어요</b>
              <p>관객 수를 줄이거나 공간 유형을 더 골라 보세요.</p>
              <button className="btn btn--sm" type="button" onClick={reset}>
                조건 초기화
              </button>
            </div>
          )}
        </section>

        <section className="sec">
          <div className="feature-row">
            {(
              [
                ["doc", "요청서 한 장", "공연 조건을 한 번 적으면 공연장·장비·엔지니어 업체가 같은 내용을 봐요."],
                ["pass", "같은 기준으로 비교", "설치 시간·수용 인원을 자동 검사해 견적서를 나란히 보여 줘요."],
                ["shield", "공연 뒤 정산", "결제 금액은 공연이 끝날 때까지 보관돼요. 연락처는 결제 뒤에 공개돼요."],
              ] as [KitIconName, string, string][]
            ).map(([icon, title, desc]) => (
              <div key={title}>
                <span className="ico-box ico-box--lg">
                  <Ico name={icon} />
                </span>
                <span>
                  <b>{title}</b>
                  <p>{desc}</p>
                </span>
              </div>
            ))}
          </div>
          <div className="btns btns--center mt-24">
            <Link className="btn btn--primary btn--lg spaces__cta" to="/performances/new">
              요청서 쓰기
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
