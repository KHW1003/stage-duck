/**
 * 공간 찾기 (/venues). 목업: mockup-v4/pages/spaces.html · FR-SPACE-03 · AC-F5-01
 * 분류 타일 + 조건표(지역·관객 수·공간 유형·조건·공연 날짜) → [공간 찾기]를 눌러야 결과가 바뀐다 (고르는 중에는 그대로).
 * 타일·정렬은 누르면 바로 바뀐다. 날짜를 넣어도 사이트는 판정하지 않는다 — "업체 확인 전" (CLAUDE.md 4장).
 * 서버 GET /venues (지역·관객 수·밴드·정렬) + 받은 목록에서 유형 여러 개·나머지 조건을 거른다. 메인에서 고른 조건(?sido=&type=&audience=)을 받는다.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePageMeta } from "../features/seo/usePageMeta";
import { useVenues, type VenueListItem, type VenueTypeCode } from "../features/venue/api";
import { CONDITIONS, DEFAULT_COND, SORTS, condFromQuery, condSummary, filterVenues, toQuery, type Cond, type Condition, type Sort } from "../features/venue/filter";
import { REGIONS, TILE_TYPES, TYPE_LABEL, cardSpecs, shortSido, venuePhotos, won } from "../features/venue/view";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { DateField, yearsFromNow } from "../shared/ui/DateField";
import { Ico, type KitIconName } from "../shared/ui/Ico";
import "./spaces.css";

const TILE_ICON: Partial<Record<VenueTypeCode, KitIconName>> = { CONCERT_HALL: "ticket", CULTURE_SPACE: "building", ROOFTOP: "sun", GARDEN: "tree", WAREHOUSE: "warehouse" };

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function VenueCard({ v }: { v: VenueListItem }) {
  return (
    <Link className="item-card" to={`/venues/${v.id}`}>
      <div className="photo" role="img" aria-label={`${v.name} ${TYPE_LABEL[v.venueType]} 사진`} style={{ "--img": `url('${venuePhotos(v)[0]}')` } as CSSProperties}>
        {v.hasResidentEngineer && <span className="photo__tag tag tag--fill">풀스펙</span>}
      </div>
      <p className="item-card__meta">
        {shortSido(v.sido)} {v.sigungu} · {TYPE_LABEL[v.venueType]} · {v.companyName}
      </p>
      <p className="item-card__title">{v.name}</p>
      <div className="item-card__specs">
        {cardSpecs(v).map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <p className="item-card__price">
        {won(v.rentalFee)}
        <small>{v.hasResidentEngineer ? "공간·장비·엔지니어" : "대관료 · 부가세 포함"}</small>
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
  const [tile, setTile] = useState<VenueTypeCode | null>(null);
  const [sort, setSort] = useState<Sort>("price");
  // 11/25 해원: 조건표가 자리를 많이 차지해 기본은 접고 [상세 조건]을 누르면 아래로 펼친다
  const [open, setOpen] = useState(false);
  const activeCount =
    (applied.region !== "전체" ? 1 : 0) +
    (Number(applied.audience) > 0 ? 1 : 0) +
    (applied.types.length < TILE_TYPES.length ? 1 : 0) +
    applied.conditions.length +
    (applied.date ? 1 : 0);

  const venues = useVenues(toQuery(applied, sort));
  const list = venues.data?.items ?? [];
  const results = useMemo(() => filterVenues(list, applied, tile), [list, applied, tile]);
  const countOf = (t: VenueTypeCode | null) => filterVenues(list, { ...applied, types: [...TILE_TYPES] }, t).length;
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
            {TILE_TYPES.map((t) => (
              <button key={t} type="button" aria-pressed={tile === t} onClick={() => setTile(t)}>
                <Ico name={TILE_ICON[t] ?? "layers"} />
                {TYPE_LABEL[t]}
                <small>{countOf(t)}곳</small>
              </button>
            ))}
          </div>
          <button type="button" className="cond-toggle" aria-expanded={open} aria-controls="cond-panel" onClick={() => setOpen((o) => !o)}>
            <Ico name="sliders" sm />
            <b>상세 조건</b>
            {activeCount > 0 && <span className="cond-toggle__count">{activeCount}</span>}
            <span className="cond-toggle__sum">{condSummary(applied, null)}{applied.date ? ` · ${applied.date}` : ""}</span>
            <span className="cond-toggle__act">
              {open ? "접기" : "펼치기"}
              <Ico name="down" sm className="cond-toggle__chev" />
            </span>
          </button>
          <div id="cond-panel" className="cond-slide" data-open={open || undefined} {...(open ? {} : { inert: "" })}>
          <div className="cond-slide__inner">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(draft);
              setOpen(false);
            }}
          >
            <div className="cond">
              <div>
                <span className="cond__th">지역</span>
                <span className="cond__td">
                  <span className="filters" role="group" aria-label="지역">
                    {REGIONS.map(({ label }) => (
                      <button key={label} type="button" aria-pressed={draft.region === label} onClick={() => setDraft((d) => ({ ...d, region: label }))}>
                        {label}
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
                  {TILE_TYPES.map((t) => (
                    <label key={t} className="check">
                      <input type="checkbox" checked={draft.types.includes(t)} onChange={() => setDraft((d) => ({ ...d, types: toggle(d.types, t) }))} />
                      {TYPE_LABEL[t]}
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
                  <DateField aria-label="공연 날짜" value={draft.date} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} min={yearsFromNow(0)} max={yearsFromNow(2)} />
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
          </div>
          </div>
        </section>

        <section className="sec" aria-live="polite">
          <div className="list-top">
            <p className="desc">
              {condSummary(applied, tile)} <b>{venues.isPending ? "…" : `${results.length}곳`}</b> {results.length > 0 && <span className="tag">업체 확인 전</span>}
            </p>
            <div className="filters" role="group" aria-label="정렬">
              {SORTS.map((s) => (
                <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <ErrorNotice error={venues.error} />
          {venues.isPending ? (
            <p className="sd-sr-only">불러오는 중이에요</p>
          ) : results.length > 0 ? (
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
