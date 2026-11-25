import { describe, expect, it } from "vitest";
import { noticeLines } from "../src/shared/chat/ChatRoom";

/** 채팅 안내 카드 문장 줄바꿈 (11/25 해원 시안 P3) — 서버가 남기는 안내 문장 그대로 */
describe("noticeLines", () => {
  it("문장마다 한 줄로 나눈다", () => {
    expect(noticeLines("사용자가 다른 업체와 진행하기로 했어요. 이 공고의 견적서는 마감됐어요.")).toEqual([
      "사용자가 다른 업체와 진행하기로 했어요.",
      "이 공고의 견적서는 마감됐어요.",
    ]);
    expect(noticeLines("업체 사정으로 확정이 취소됐어요. 이 단계는 다시 모집해요.")).toEqual(["업체 사정으로 확정이 취소됐어요.", "이 단계는 다시 모집해요."]);
  });

  it("긴 문장은 이음말(하여·해서·지나) 뒤에서 한 번 더 나눈다", () => {
    expect(noticeLines("결제 마감이 지나 공연이 자동으로 취소됐어요.")).toEqual(["결제 마감이 지나", "공연이 자동으로 취소됐어요."]);
    expect(noticeLines("사용자가 다른 업체와 진행하기로 하여 이 공고의 견적서는 마감되었습니다.")).toEqual([
      "사용자가 다른 업체와 진행하기로 하여",
      "이 공고의 견적서는 마감되었습니다.",
    ]);
  });

  it("짧은 문장은 그대로 둔다", () => {
    expect(noticeLines("사용자가 공연을 취소했어요.")).toEqual(["사용자가 공연을 취소했어요."]);
  });
});
