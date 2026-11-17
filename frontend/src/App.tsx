import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AppLayout } from "./shared/layout/AppLayout";
import { NotFound } from "./shared/layout/NotFound";

/**
 * 라우트 목록은 specs/plan.md 6장. 관리자 화면(/admin)은 React가 아니라 서버의 SQLAdmin이다.
 * 모든 화면은 AppLayout 안에 둔다. 로그인이 필요한 화면은 <Route element={<RequireAuth roles={[...]} />}> 로 감싼다.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
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
