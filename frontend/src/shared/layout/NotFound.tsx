/**
 * 찾을 수 없음 = 오류 화면 404 (mockup-v4/pages/error.html). 없는 주소와 권한 없는 화면을 같은 화면으로 보여 준다
 * — 있는지조차 알리지 않는다 (CLAUDE.md 10, FR-AUTH-07). 여러 화면이 이 이름으로 쓰고 있어 이름을 남겨 둔다.
 */
import { ErrorView } from "./ErrorView";
import { usePageMeta } from "../../features/seo/usePageMeta";

export function NotFound() {
  usePageMeta("화면을 찾을 수 없어요");
  return (
    <div className="container main">
      <ErrorView kind="404" />
    </div>
  );
}
