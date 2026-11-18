/**
 * 메인 (/). 목업: docs/design/mockup/home.html — 히어로 → 공간 둘러보기 → 이용 방법 → 자주 묻는 질문.
 * 머리·바닥글은 features/home/HomeLayout. 로그인한 사용자는 히어로 오른쪽에 진행 중인 공연이 보인다.
 */
import { FaqSection } from "../features/home/FaqSection";
import { FlowSection } from "../features/home/FlowSection";
import { Hero } from "../features/home/Hero";
import { SpacesSection } from "../features/home/SpacesSection";
import { HOME_FAQ } from "../features/home/content";
import { useMyPerformances } from "../features/performance/api";
import { layoutKindOf, useMe } from "../shared/auth/useMe";

function UserHero({ name }: { name: string }) {
  const mine = useMyPerformances();
  const perf = mine.isLoading ? undefined : (mine.data?.active[0] ?? null);
  return <Hero userName={name} perf={perf} />;
}

export function HomePage() {
  const me = useMe();
  const user = layoutKindOf(me.data) === "user" ? me.data! : null;
  return (
    <>
      {user ? <UserHero name={user.nickname ?? user.name} /> : <Hero />}
      <SpacesSection />
      <FlowSection />
      <FaqSection id="faq" title="자주 묻는 질문" desc="찾는 답이 없으면 1:1 문의를 남겨주세요." ask="1:1 문의하기" items={HOME_FAQ} />
    </>
  );
}
