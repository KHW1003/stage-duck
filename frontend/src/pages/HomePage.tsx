import { useQuery } from "@tanstack/react-query";
import { api } from "../shared/api/client";

interface Health {
  status: string;
  env: string;
  simulation: boolean;
}

export function HomePage() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health"), retry: false });

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
      <h1>STAGE DUCK 🦆</h1>
      <p>공연장 → 장비 → 엔지니어를 순서대로 섭외하고, 한 번에 결제하는 소규모 공연 준비 플랫폼</p>
      <p>
        서버 상태:{" "}
        {health.isLoading ? "확인 중…" : health.isError ? "연결 안 됨" : `정상 (${health.data?.env})`}
      </p>
    </main>
  );
}
