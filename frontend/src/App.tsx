import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { SimulationBanner } from "./shared/SimulationBanner";

/**
 * 라우트 목록은 specs/plan.md 6장. 관리자 화면(/admin)은 React가 아니라 서버의 SQLAdmin이다.
 */
export function AppRoutes() {
  return (
    <>
      <SimulationBanner />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<p style={{ padding: 16 }}>페이지를 찾을 수 없어요.</p>} />
      </Routes>
    </>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
