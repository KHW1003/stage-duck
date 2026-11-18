/** 요청서 수정 (/performances/:id/edit, #40·#37). 현재 버전을 불러와 요청서 화면을 수정 모드로 연다 */
import { useParams } from "react-router-dom";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { usePerformance } from "../features/performance/api";
import { RequestPage } from "./RequestPage";
import { usePageMeta } from "../features/seo/usePageMeta";

export function RequestEditPage() {
  const id = Number(useParams().id);
  const perf = usePerformance(id);
  usePageMeta("요청서 수정");
  if (perf.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (!perf.data) return <ErrorNotice error={perf.error} />;
  return <RequestPage key={perf.data.id} edit={perf.data} />;
}
