/**
 * 업체 메인 (/partner). 목업: docs/design/mockup/partner.html — 계정 상태에 따라 세 화면 중 하나:
 * 방문자·사용자 = 입점 안내 / 심사 중·반려 업체 = 심사 화면 / 승인 업체 = 첫 화면(할 일·공고·일정).
 */
import { PartnerDashboard } from "../features/home/PartnerDashboard";
import { PartnerGuest } from "../features/home/PartnerGuest";
import { PartnerReview } from "../features/home/PartnerReview";
import { useApplication } from "../features/supplier/api";
import { layoutKindOf, useMe } from "../shared/auth/useMe";

function Review() {
  const app = useApplication();
  return <PartnerReview app={app.data ?? null} />;
}

export function PartnerPage() {
  const me = useMe();
  const kind = layoutKindOf(me.data);
  if (me.isLoading) return null;
  if (kind === "partner-review") return <Review />;
  if (kind === "partner") return <PartnerDashboard company={me.data!.nickname ?? me.data!.name} />;
  return <PartnerGuest />;
}
