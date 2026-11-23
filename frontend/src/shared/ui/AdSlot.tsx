/**
 * 광고 자리 (시연용 더미 배너). 상세 화면 양쪽 여백에 세로 배너(sky 140×600), 오른쪽 칸 아래 네모 배너(rect 320×250).
 * - 실제 광고·제휴사가 아니다. 브랜드 이름은 지어낸 것이고 숫자·혜택은 쓰지 않는다. "광고 · 예시"와 안내를 늘 함께 적는다.
 * - 누를 수 없는 상자다 (연결할 광고가 없다). [자세히 보기]도 모양만 있다.
 * - 따라오지 않는다 (11/23 해원). seed 로 여러 개 중 하나를 고른다.
 */
import { Ico, type KitIconName } from "./Ico";
import s from "./AdSlot.module.css";

interface Ad {
  brand: string;
  icon: KitIconName;
  head: string;
  sub: string;
  cta: string;
  tone: "navy" | "teal" | "plum" | "mustard" | "sand";
}

const ADS: Ad[] = [
  { brand: "소리창고", icon: "speaker", head: "공연 장비,\n하루만 빌리세요", sub: "스피커·믹서·마이크를 한 번에", cta: "렌탈 둘러보기", tone: "navy" },
  { brand: "합주곳간", icon: "music", head: "오늘 저녁\n합주실 비어 있어요", sub: "공연 전 마지막 맞춰 보기", cta: "빈 방 보기", tone: "mustard" },
  { brand: "포스터공방", icon: "image", head: "포스터 한 장으로\n객석을 채우세요", sub: "공연 포스터·SNS 카드 디자인", cta: "작업 예시 보기", tone: "plum" },
  { brand: "무대기록", icon: "eye", head: "오늘 무대를\n영상으로 남겨요", sub: "공연 촬영·편집", cta: "촬영 문의", tone: "teal" },
  { brand: "든든행사보험", icon: "shield", head: "공연 중 사고,\n미리 대비하세요", sub: "소규모 공연 행사 보험 안내", cta: "보험 알아보기", tone: "sand" },
];

export function AdSlot({ kind, seed = 0, className }: { kind: "sky" | "rect"; seed?: number; className?: string }) {
  const ad = ADS[Math.abs(seed) % ADS.length];
  return (
    <div
      className={[s.ad, kind === "sky" ? s.sky : s.rect, s[ad.tone], className].filter(Boolean).join(" ")}
      role="note"
      aria-label={`광고 예시: ${ad.brand} ${ad.head.replace("\n", " ")}`}
    >
      <span className={s.tag}>광고 · 예시</span>
      <span className={s.brand}>
        <span className={s.icon} aria-hidden="true">
          <Ico name={ad.icon} />
        </span>
        {ad.brand}
      </span>
      <b className={s.head}>{ad.head}</b>
      <p className={s.sub}>{ad.sub}</p>
      <span className={s.cta} aria-hidden="true">
        {ad.cta}
      </span>
      <p className={s.note}>시연용 광고 예시예요. 실제 광고가 아니에요.</p>
    </div>
  );
}
