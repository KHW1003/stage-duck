import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CommunityPage } from "./pages/CommunityPage";
import { CommunityPostPage } from "./pages/CommunityPostPage";
import { CommunitySavedPage } from "./pages/CommunitySavedPage";
import { CommunityWritePage } from "./pages/CommunityWritePage";
import { HomePage } from "./pages/HomePage";
import { MyPerformancesPage } from "./pages/MyPerformancesPage";
import { PerformancePage } from "./pages/PerformancePage";
import { RequestEditPage } from "./pages/RequestEditPage";
import { RequestPage } from "./pages/RequestPage";
import { SupplierOnboardingPage } from "./pages/SupplierOnboardingPage";
import { SupplierSignupPage } from "./pages/SupplierSignupPage";
import { RequireAuth } from "./shared/auth/RequireAuth";
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
        <Route path="/signup/supplier" element={<SupplierSignupPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route element={<RequireAuth roles={["USER", "SUPPLIER"]} />}>
          <Route path="/community/write" element={<CommunityWritePage />} />
          <Route path="/community/saved" element={<CommunitySavedPage />} />
          <Route path="/community/:id/edit" element={<CommunityWritePage />} />
        </Route>
        <Route path="/community/:id" element={<CommunityPostPage />} />
        <Route element={<RequireAuth roles={["SUPPLIER"]} />}>
          <Route path="/supplier/onboarding" element={<SupplierOnboardingPage />} />
        </Route>
        <Route element={<RequireAuth roles={["USER"]} />}>
          <Route path="/performances/new" element={<RequestPage />} />
          <Route path="/me/performances" element={<MyPerformancesPage />} />
          <Route path="/performances/:id" element={<PerformancePage />} />
          <Route path="/performances/:id/edit" element={<RequestEditPage />} />
        </Route>
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
