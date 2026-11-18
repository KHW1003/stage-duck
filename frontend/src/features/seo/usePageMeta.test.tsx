import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageMeta } from "./usePageMeta";

describe("usePageMeta", () => {
  it("화면 이름 뒤에 서비스 이름을 붙이고, 나가면 되돌린다", () => {
    document.title = "STAGE DUCK";
    const { unmount } = renderHook(() => usePageMeta("커뮤니티"));
    expect(document.title).toBe("커뮤니티 · STAGE DUCK");
    unmount();
    expect(document.title).toBe("STAGE DUCK");
  });

  it("이미 서비스 이름이 들어 있으면 그대로, 비어 있으면 바꾸지 않는다", () => {
    renderHook(() => usePageMeta("[질문] 리허설 · STAGE DUCK 커뮤니티"));
    expect(document.title).toBe("[질문] 리허설 · STAGE DUCK 커뮤니티");
    document.title = "STAGE DUCK";
    renderHook(() => usePageMeta(undefined));
    expect(document.title).toBe("STAGE DUCK");
  });
});
