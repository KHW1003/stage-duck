/**
 * 보호 라우트 (FR-AUTH-07). 화면에서 막는 것은 보조이고, 진짜 검사는 서버가 한다 (CLAUDE.md 9).
 * - 로그인 안 함 → /login?next=지금 주소 (로그인 뒤 돌아온다)
 * - 역할이 다름 → "찾을 수 없어요" (서버의 404 처럼 있는지조차 알리지 않는다, CLAUDE.md 10)
 * - approvedOnly: 승인된 업체만 (공고 목록 등). 심사 중이면 입점·심사 화면으로 보낸다
 *
 * 사용: <Route element={<RequireAuth roles={["USER"]} />}> ...자식 라우트... </Route>
 */
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Role } from "../api/types";
import { NotFound } from "../layout/NotFound";
import { ErrorNotice } from "../ui/ErrorText";
import { useMe } from "./useMe";

export const ONBOARDING_PATH = "/supplier/onboarding";

interface Props {
  roles?: Role[];
  approvedOnly?: boolean;
}

export function RequireAuth({ roles, approvedOnly = false }: Props) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;
  if (me.isError) return <ErrorNotice error={me.error} />;
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (roles && !roles.includes(me.data.role)) return <NotFound />;
  if (approvedOnly && me.data.role === "SUPPLIER" && me.data.supplierReviewStatus !== "APPROVED") {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }
  return <Outlet />;
}
