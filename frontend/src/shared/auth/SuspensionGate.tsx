/**
 * 이용 정지 (AC-F5-18). 서버는 정지되는 순간부터 모든 요청을 막고, 화면은 여기서 바로 따라간다.
 * - 화면을 옮길 때마다, API 가 401·403 일 때, 정지 알림이 올 때 내 상태를 다시 확인한다 (이미 로그인해 둔 계정도)
 * - 정지 계정은 어느 화면이든 정지 안내만 본다. 1:1 문의·공지·약관은 볼 수 있다 (api-contract.md 6.1, D-48)
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useApplication } from "../../features/supplier/api";
import { api } from "../api/client";
import type { Me } from "../api/types";
import { ErrorView } from "../layout/ErrorView";
import { ME_KEY, useMe } from "./useMe";

const ALLOWED = ["/inquiries", "/notices", "/terms"];

const cachedMe = (qc: QueryClient) => qc.getQueryData<Me | null>(ME_KEY);

/** 계정 상태·업체 심사 상태가 바뀌었을 때만 내 정보를 바꾼다. 실패하면 그대로 둔다 (쓰던 화면을 지우지 않게) */
export async function syncStatus(qc: QueryClient): Promise<void> {
  if (!cachedMe(qc)) return;
  const fresh = await api<Me>("/me").catch(() => null);
  const now = cachedMe(qc); // 기다리는 사이 로그아웃했을 수 있다
  if (!fresh || !now || fresh.id !== now.id) return;
  if (fresh.status !== now.status || fresh.supplierReviewStatus !== now.supplierReviewStatus) qc.setQueryData(ME_KEY, fresh);
}

/** 화면 뼈대(AppLayout·HomeLayout)의 Outlet 자리 */
export function SuspensionGate() {
  const qc = useQueryClient();
  const me = useMe().data;
  const { pathname } = useLocation();
  useEffect(() => void syncStatus(qc), [qc, pathname]);

  const allowed = ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!me || allowed) return <Outlet />;
  if (me.status !== "SUSPENDED") return me.supplierReviewStatus === "SUSPENDED" ? <SupplierSuspended me={me} /> : <Outlet />;
  return (
    <div className="container main" data-sd-area="content">
      <ErrorView kind="suspended" rows={suspendedRows(me)} />
    </div>
  );
}
/** 관리자가 [업체 심사 → 정지]로 멈춘 업체. 계정은 살아 있어서 사유는 입점 신청에서 읽는다 */
function SupplierSuspended({ me }: { me: Me }) {
  const reason = useApplication().data?.rejectReason;
  return (
    <div className="container main" data-sd-area="content">
      <ErrorView
        kind="suspended"
        desc="업체 이용이 정지되어 공고·견적서·채팅을 쓸 수 없어요. 정지에 대해 궁금한 점은 1:1 문의로 알려 주세요."
        rows={[["계정", me.email], ...(reason ? ([["사유", reason]] as [string, string][]) : [])]}
      />
    </div>
  );
}

/** 정지 화면의 표 (mockup-v4 error.html suspended). 정지일·마지막 경고는 서버가 준 값 그대로 */
function suspendedRows(me: Me): [string, string][] {
  const s = me.suspension;
  if (!s) return [["계정", me.email]];
  const [, m, d] = s.suspendedAt.slice(0, 10).split("-");
  return [
    ["계정", me.email],
    ["정지일", `${Number(m)}월 ${Number(d)}일`],
    ["마지막 경고", s.lastWarningReason ?? s.reason],
    ["진행 중인 섭외", "관리자가 확인한 뒤 뮤지션에게 안내해요"],
  ];
}
