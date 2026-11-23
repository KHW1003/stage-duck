import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useOrder } from "../src/features/payment/api";

/** 청구서 조회 — 서버가 거절(4xx)하면 다시 시도하지 않고 바로 안내한다 (AC-F5-03) */
it("AC-F5-03 청구서를 만들 수 없으면(409) 다시 시도하지 않고 바로 오류를 준다", async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const status = init?.method === "POST" ? 409 : 404;
    return new Response(JSON.stringify({ code: status === 409 ? "INVALID_STATE" : "NOT_FOUND", message: "", fieldErrors: [] }), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient(); // 앱과 같은 기본 재시도 설정
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  const { result } = renderHook(() => useOrder(1), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  vi.unstubAllGlobals();
});
