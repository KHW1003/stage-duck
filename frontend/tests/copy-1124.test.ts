/** 11/24 팀원 제보 문구 (내 공연 WAIT_QUOTES) */
import { describe, expect, it } from "vitest";
import { nextActionText } from "../src/features/performance/labels";
import type { StageSummary } from "../src/shared/api/types";

const stage = (quoteCount: number | null): StageSummary => ({ id: 1, stageType: "VENUE", seq: 1, status: "OPEN", quoteCount });

describe("내 공연 다음 할 일 문구", () => {
  it("견적서가 이미 왔으면 '기다리고 있어요' 대신 건수와 비교를 안내한다", () => {
    const text = nextActionText("WAIT_QUOTES", stage(2));
    expect(text).toContain("2건 왔어요");
    expect(text).not.toContain("기다리고 있어요");
  });

  it("아직 0건이면 기다린다고 안내한다", () => {
    expect(nextActionText("WAIT_QUOTES", stage(0))).toContain("기다리고 있어요");
    expect(nextActionText("WAIT_QUOTES", stage(null))).toContain("기다리고 있어요");
  });
});
