/**
 * 광고 자리 (시연용 더미 배너). 상세 화면 양쪽 여백에 세로 배너(sky 140×600), 오른쪽 칸 아래 네모 배너(rect 320×250).
 * - 지어낸 업체 8곳이 사진을 배경으로 쓰고 저마다 다른 꾸밈(스티커·쿠폰·네온·녹화 표시·체크 목록·빈티지 띠)을 한다 (11/23 해원: "별짓거리 다 해서").
 * - 광고는 남의 콘텐츠라 사이트 디자인 규칙(그라데이션·그림자 금지 등)의 예외로 둔다. 대신 실제 업체·실제 혜택이 아님을 늘 함께 적는다.
 * - 누를 수 없는 상자다 (연결할 광고가 없다). 따라오지 않는다. seed 로 여러 개 중 하나를 고른다.
 */
import { Ico } from "./Ico";
import s from "./AdSlot.module.css";

type Variant = "sound" | "room" | "poster" | "film" | "insure" | "mic" | "studio" | "lesson";

interface Ad {
  variant: Variant;
  brand: string;
  /** 배경 사진 여러 장 — seed 로 돌려 쓴다 (같은 광고도 화면마다 사진이 다르게) */
  photos: string[];
  /** 줄마다 한 칸 (줄바꿈 위치를 정해 둔다) */
  head: string[];
  sub: string[];
  cta: string;
}

const P = (id: string) => `/photos/photo-${id}.jpg`;

const ADS: Ad[] = [
  {
    variant: "sound", brand: "소리창고", cta: "렌탈 둘러보기",
    head: ["SOUND", "RENTAL"], sub: ["스피커·믹서·마이크", "하루만 빌려도 돼요"],
    photos: [P("1545454675-3531b543be5d"), P("1574517947730-55cb23e608c2"), P("1618609377864-68609b857e90"), P("1535406208535-1429839cfd13")],
  },
  {
    variant: "room", brand: "합주곳간", cta: "빈 방 보기",
    head: ["오늘 저녁,", "합주실", "비어 있어요"], sub: ["공연 전 마지막 맞춰 보기"],
    photos: [P("1514320291840-2e0a9bf2a9ae"), P("1512053459797-38c3a066cabd"), P("1718946918946-f4fa72f6abec"), P("1730987878974-631dcaeae26c")],
  },
  {
    variant: "poster", brand: "포스터공방", cta: "작업 예시 보기",
    head: ["포스터 한 장에", "객석이", "찬다"], sub: ["공연 포스터 · SNS 카드"],
    photos: [P("1508700115892-45ecd05ae2ad"), P("1450044804117-534ccd6e6a3a"), P("1768054190173-0ae32692f5a3"), P("1583795484071-3c453e3a7c71")],
  },
  {
    variant: "film", brand: "무대기록", cta: "촬영 문의",
    head: ["오늘 무대,", "다시 보고", "싶지 않나요?"], sub: ["멀티캠 공연 촬영·편집"],
    photos: [P("1598387993441-a364f854c3e1"), P("1613870948964-7125fa3e1aab"), P("1522158637959-30385a09e0da"), P("1577648884063-1d3d1477b8a7")],
  },
  {
    variant: "insure", brand: "든든행사보험", cta: "보험 알아보기",
    head: ["공연 중 사고,", "미리 대비"], sub: ["소규모 공연 행사 보험"],
    photos: [P("1540039155733-5bb30b53aa14"), P("1533174072545-7a4b6ad7a6c3"), P("1603190287605-e6ade32fa852"), P("1767977907864-5f70847b2c79")],
  },
  {
    variant: "mic", brand: "마이크하우스", cta: "체험 신청",
    head: ["목소리가", "주인공인 날"], sub: ["보컬 마이크 체험 대여"],
    photos: [P("1511671782779-c97d3d27a1d4"), P("1531651008558-ed1740375b39"), P("1698769676386-7984304c8261")],
  },
  {
    variant: "studio", brand: "어반룸 레코딩", cta: "녹음실 예약",
    head: ["공연 전에", "음원부터"], sub: ["라이브 합주 녹음 · 믹싱"],
    photos: [P("1760780567530-389d8a3fba75"), P("1758336717046-c475fc6f45ce"), P("1636226570637-3fbda7ca09dc"), P("1784126689440-fd3fa2ac3745"), P("1621976975813-10e88ae6e450"), P("1681683967405-7efef2cd810c")],
  },
  {
    variant: "lesson", brand: "줄과건반 레슨", cta: "체험 레슨",
    head: ["무대 체질로", "바꿔 드려요"], sub: ["기타·건반·보컬 1:1 레슨"],
    photos: [P("1511379938547-c1f69419868d"), P("1481886756534-97af88ccb438")],
  },
];

function Extra({ v }: { v: Variant }) {
  switch (v) {
    case "sound":
      return (
        <span className={s.sticker}>
          당일
          <br />
          출고
        </span>
      );
    case "room":
      return (
        <span className={s.coupon}>
          <small>첫 예약</small>
          <b>1시간 무료</b>
        </span>
      );
    case "film":
      return (
        <>
          <span className={s.rec}>
            <i /> REC <em>00:03:27</em>
          </span>
          <span className={s.frame} />
        </>
      );
    case "insure":
      return (
        <ul className={s.checks}>
          <li>
            <Ico name="check" sm /> 관객 부상
          </li>
          <li>
            <Ico name="check" sm /> 장비 파손
          </li>
          <li>
            <Ico name="check" sm /> 행사 취소
          </li>
        </ul>
      );
    case "mic":
      return <span className={s.ribbon}>SINCE 1987</span>;
    case "poster":
      return <span className={s.neonTag}>NEW</span>;
    case "studio":
      return <span className={s.onAir}>ON AIR</span>;
    case "lesson":
      return <span className={s.stamp}>1:1</span>;
  }
}

export function AdSlot({ kind, seed = 0, className }: { kind: "sky" | "rect"; seed?: number; className?: string }) {
  const n = Math.abs(seed);
  const ad = ADS[n % ADS.length];
  const photo = ad.photos[Math.floor(n / ADS.length) % ad.photos.length];
  return (
    <div
      className={[s.ad, kind === "sky" ? s.sky : s.rect, s[ad.variant], className].filter(Boolean).join(" ")}
      role="note"
      aria-label={`광고 예시: ${ad.brand}, ${ad.head.join(" ")}. 시연용 가상 업체예요`}
    >
      <span className={s.bg} style={{ backgroundImage: `url('${photo}')` }} aria-hidden="true" />
      <span className={s.shade} aria-hidden="true" />
      <div className={s.body} aria-hidden="true">
        <span className={s.tag}>AD · 예시</span>
        <span className={s.brand}>{ad.brand}</span>
        <Extra v={ad.variant} />
        <b className={s.head}>{ad.head.map((l) => <span key={l}>{l}</span>)}</b>
        <p className={s.sub}>{ad.sub.map((l) => <span key={l}>{l}</span>)}</p>
        <span className={s.cta}>
          {ad.cta} <Ico name="right" sm />
        </span>
        <p className={s.note}>가상 업체 · 실제 광고가 아니에요</p>
      </div>
    </div>
  );
}
