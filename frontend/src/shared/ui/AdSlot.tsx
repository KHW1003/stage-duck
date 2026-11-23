/**
 * 광고 자리 (시연용 더미). 상세 화면 양쪽 여백에 세로 광고(sky), 오른쪽 칸 아래 네모 광고(rect).
 * - 실제 광고·제휴사가 아니다. 가짜 상호·숫자를 쓰지 않고(DESIGN.md 8장), "광고 예시"를 늘 함께 적는다.
 * - 누를 수 없는 상자다 (연결할 광고가 없다). 읽어 주는 프로그램에는 "광고 예시"로 알린다.
 * - seed 로 여러 개 중 하나를 고른다 (화면마다 같은 광고만 보이지 않게).
 */
import { Ico, type KitIconName } from "./Ico";
import s from "./AdSlot.module.css";

interface Ad {
  icon: KitIconName;
  title: string;
  desc: string;
}

const ADS: Ad[] = [
  { icon: "speaker", title: "음향 장비 렌탈", desc: "공연 규모에 맞는 스피커·믹서를 빌려 보세요" },
  { icon: "venue", title: "연습실·합주실", desc: "공연 전 합주할 곳을 찾고 있다면" },
  { icon: "ticket", title: "공연 홍보", desc: "포스터·SNS 홍보를 맡겨 보세요" },
  { icon: "image", title: "공연 영상 촬영", desc: "오늘 무대를 영상으로 남겨 보세요" },
  { icon: "shield", title: "행사 보험 안내", desc: "공연 중 사고에 대비한 보험을 알아보세요" },
];

export function AdSlot({ kind, seed = 0, className }: { kind: "sky" | "rect"; seed?: number; className?: string }) {
  const ad = ADS[Math.abs(seed) % ADS.length];
  return (
    <div className={[s.ad, kind === "sky" ? s.sky : s.rect, className].filter(Boolean).join(" ")} role="note" aria-label={`광고 예시: ${ad.title}`}>
      <span className={s.tag}>광고 · 예시</span>
      <span className={s.icon} aria-hidden="true">
        <Ico name={ad.icon} />
      </span>
      <b className={s.title}>{ad.title}</b>
      <p className={s.desc}>{ad.desc}</p>
      <p className={s.note}>시연용 자리예요. 실제 광고가 아니에요.</p>
    </div>
  );
}
