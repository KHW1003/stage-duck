/**
 * 메인 공간 둘러보기 (mockup/home.html 3번 구역): 지역·유형·관객 수 고르기 → 공간 찾기(/venues?...), 예시 공간 3곳.
 * 고른 값은 화면 안 상태로 들고 있다가 [공간 찾기]에서 쿼리로 넘긴다 (공간 찾기 화면이 같은 이름으로 읽는다).
 */
import { useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEARCH_OPTIONS, SPACES, type SpaceSample } from "./content";
import { cx } from "./cx";
import s from "./home.module.css";

type Field = keyof typeof SEARCH_OPTIONS;
const LABELS: Record<Field, string> = { region: "지역", type: "공간 유형", audience: "관객 수" };

export function SpaceSearch() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Record<Field, string>>({ region: "전국", type: "전체 공간", audience: "상관없음" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (picked.region !== SEARCH_OPTIONS.region[0]) q.set("sido", picked.region);
    if (picked.type !== SEARCH_OPTIONS.type[0]) q.set("type", picked.type);
    if (picked.audience !== SEARCH_OPTIONS.audience[0]) q.set("audience", picked.audience);
    const qs = q.toString();
    navigate(qs ? `/venues?${qs}` : "/venues");
  };

  return (
    <form className={s.search} onSubmit={submit} role="search">
      {(Object.keys(SEARCH_OPTIONS) as Field[]).map((f) => (
        <label key={f} className={s.searchField}>
          <span>{LABELS[f]}</span>
          <select value={picked[f]} onChange={(e) => setPicked((p) => ({ ...p, [f]: e.target.value }))}>
            {SEARCH_OPTIONS[f].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      ))}
      <button className={cx(s.btn, s.btnPrimary, s.searchBtn)} type="submit">
        공간 찾기
      </button>
    </form>
  );
}

export function SpaceCard({ space }: { space: SpaceSample }) {
  return (
    <Link className={s.spaceCard} to="/venues">
      <div className={s.photo} style={{ "--img": `url('${space.photo}')` } as CSSProperties}>
        <span className={cx(s.chip, s.chipPhoto)}>{space.capacity}</span>
      </div>
      <p className={s.spaceCardMeta}>{space.meta}</p>
      <h3>{space.name}</h3>
      <p className={s.spaceCardDesc}>{space.desc}</p>
      <p className={s.price}>
        {space.price} <small>{space.priceUnit}</small>
      </p>
    </Link>
  );
}

export function SpacesSection() {
  return (
    <section className={s.spaces} id="spaces">
      <div className={s.wrap}>
        <div className={s.secHead}>
          <div>
            <h2 className={s.secTitle}>어떤 공간에서 공연하고 싶나요?</h2>
            <p className={s.secDesc}>공간 조건과 기본 장비를 먼저 살펴보세요.</p>
          </div>
          <Link className={s.more} to="/venues">
            공간 전체 보기 <span aria-hidden="true">→</span>
          </Link>
        </div>
        <SpaceSearch />
        <div className={s.listHead}>
          <span>공간 예시 {SPACES.length}곳</span>
          <span className={s.muted}>시연용 공간 · 금액은 부가세 포함</span>
        </div>
        <div className={s.spaceGrid}>
          {SPACES.map((sp) => (
            <SpaceCard key={sp.name} space={sp} />
          ))}
        </div>
      </div>
    </section>
  );
}
