import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CommunityPage } from "./pages/CommunityPage";
import { CommunityPostPage } from "./pages/CommunityPostPage";
import { CommunitySavedPage } from "./pages/CommunitySavedPage";
import { CommunityWritePage } from "./pages/CommunityWritePage";
import { BoardPage } from "./pages/BoardPage";
import { HomePage } from "./pages/HomePage";
import { PartnerPage } from "./pages/PartnerPage";
import { LoginPage } from "./pages/LoginPage";
import { PasswordForgotPage, PasswordResetPage } from "./pages/PasswordPage";
import { SignupPage } from "./pages/SignupPage";
import { SpacesPage } from "./pages/SpacesPage";
import { SpaceDetailPage } from "./pages/SpaceDetailPage";
import { NextStagePage } from "./pages/NextStagePage";
import { FaqPage } from "./pages/FaqPage";
import { InquiryListPage, InquiryPostPage, InquiryWritePage } from "./pages/InquiryPages";
import { NoticeDetailPage, NoticeListPage } from "./pages/NoticePages";
import { SupplierGuidePage } from "./pages/SupplierGuidePage";
import { TermsPage } from "./pages/TermsPage";
import { TechCheckIndexPage, TechCheckPage } from "./pages/TechCheckPage";
import { ComparePage } from "./pages/ComparePage";
import { InvoicePage } from "./pages/InvoicePage";
import { PaymentPage } from "./pages/PaymentPage";
import { HomeLayout } from "./features/home/HomeLayout";
import { MyPerformancesPage } from "./pages/MyPerformancesPage";
import { MyPostPage } from "./pages/MyPostPage";
import { PerformancePage } from "./pages/PerformancePage";
import { PostPage } from "./pages/PostPage";
import { PostingPage } from "./pages/PostingPage";
import { PostingsPage } from "./pages/PostingsPage";
import { QuotePage } from "./pages/QuotePage";
import { QuoteEditPage } from "./pages/QuoteEditPage";
import { RequestEditPage } from "./pages/RequestEditPage";
import { RequestPage } from "./pages/RequestPage";
import { SupplierOnboardingPage } from "./pages/SupplierOnboardingPage";
import { SupplierSignupPage } from "./pages/SupplierSignupPage";
import { RequireAuth } from "./shared/auth/RequireAuth";
import { AppLayout } from "./shared/layout/AppLayout";
import { NotFound } from "./shared/layout/NotFound";

/**
 * 라우트 목록은 specs/plan.md 6장. 관리자 화면(/admin)은 React가 아니라 서버의 SQLAdmin이다.
 * 메인(/)·업체 메인(/partner)은 HomeLayout, 나머지 화면은 AppLayout 안에 둔다. 로그인이 필요한 화면은 <Route element={<RequireAuth roles={[...]} />}> 로 감싼다.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* 메인·업체 메인은 머리·바닥글 모양이 달라 HomeLayout (mockup/home.html · partner.html) */}
      <Route element={<HomeLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/partner" element={<PartnerPage />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/password/forgot" element={<PasswordForgotPage />} />
        <Route path="/password/reset" element={<PasswordResetPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/signup/supplier" element={<SupplierSignupPage />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route element={<RequireAuth roles={["USER", "SUPPLIER"]} />}>
          <Route path="/community/write" element={<CommunityWritePage />} />
          <Route path="/community/saved" element={<CommunitySavedPage />} />
          <Route path="/community/:id/edit" element={<CommunityWritePage />} />
        </Route>
        <Route path="/community/:id" element={<CommunityPostPage />} />
        <Route path="/venues" element={<SpacesPage />} />
        <Route path="/venues/:id" element={<SpaceDetailPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/board/:id" element={<PostPage />} />
        <Route path="/notices" element={<NoticeListPage />} />
        <Route path="/notices/:id" element={<NoticeDetailPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/guide/supplier" element={<SupplierGuidePage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/terms/:type" element={<TermsPage />} />
        <Route element={<RequireAuth roles={["USER", "SUPPLIER"]} />}>
          <Route path="/inquiries" element={<InquiryListPage />} />
          <Route path="/inquiries/new" element={<InquiryWritePage />} />
          <Route path="/inquiries/:id" element={<InquiryPostPage />} />
          <Route path="/inquiries/:id/edit" element={<InquiryWritePage />} />
        </Route>
        <Route element={<RequireAuth roles={["SUPPLIER"]} />}>
          <Route path="/supplier/onboarding" element={<SupplierOnboardingPage />} />
        </Route>
        <Route element={<RequireAuth roles={["SUPPLIER"]} approvedOnly />}>
          <Route path="/supplier/posts" element={<MyPostPage />} />
          <Route path="/supplier/postings" element={<PostingsPage />} />
          <Route path="/supplier/postings/:stageId" element={<PostingPage />} />
          <Route path="/supplier/postings/:stageId/quote" element={<QuotePage />} />
          <Route path="/supplier/quotes/:quoteId/edit" element={<QuoteEditPage />} />
          <Route path="/supplier/tech" element={<TechCheckIndexPage />} />
          <Route path="/supplier/tech/:performanceId" element={<TechCheckPage />} />
        </Route>
        <Route element={<RequireAuth roles={["USER"]} />}>
          <Route path="/performances/new" element={<RequestPage />} />
          <Route path="/me/performances" element={<MyPerformancesPage />} />
          <Route path="/performances/:id" element={<PerformancePage />} />
          <Route path="/performances/:id/edit" element={<RequestEditPage />} />
          <Route path="/performances/:id/next" element={<NextStagePage />} />
          <Route path="/performances/:id/compare" element={<ComparePage />} />
          <Route path="/performances/:id/order" element={<InvoicePage />} />
          <Route path="/performances/:id/pay" element={<PaymentPage />} />
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
