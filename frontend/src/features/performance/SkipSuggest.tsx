/** AC-F3-05·23: 확정한 앞 단계 견적서에 다음 단계가 들어 있으면 경고와 함께 건너뛰기를 제안한다 (새로고침해도 보인다) */
import type { PerformanceDetail, StageSummary, StageType } from "../../shared/api/types";
import { Ico } from "../../shared/ui/Ico";
import { useStageQuotes } from "../compare/api";
import { STAGE_NAME } from "./labels";

export function SkipSuggest({ performance, next }: { performance: PerformanceDetail; next: StageSummary }) {
  const idOf = (type: StageType) => performance.stages.find((s) => s.stageType === type && s.status === "CONFIRMED")?.id;
  const venue = useStageQuotes(idOf("VENUE")).data?.find((q) => q.status === "CONFIRMED");
  const equipment = useStageQuotes(idOf("EQUIPMENT")).data?.find((q) => q.status === "CONFIRMED");
  const included = next.stageType === "EQUIPMENT" ? venue?.isFullSpec : venue?.includesEngineer || equipment?.includesEngineer;
  if (!included) return null;
  const what = next.stageType === "EQUIPMENT" ? "장비와 엔지니어가" : "엔지니어가";
  return (
    <div className="notice notice--warn mt-16" role="status">
      <Ico name="warn" />
      <div>
        <b>경고</b> 확정한 견적서에 {what} 이미 포함되어 있어요. {STAGE_NAME[next.stageType]} 단계는 건너뛰는 것을 제안해요.
      </div>
    </div>
  );
}
