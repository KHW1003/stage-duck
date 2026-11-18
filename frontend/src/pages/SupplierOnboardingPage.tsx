/**
 * 입점 신청·심사 상태 (/supplier/onboarding, #26). 업체 역할만 (App.tsx 의 RequireAuth).
 * - 신청 전: 2단계 사업자 정보 입력 (AC-F1-17·18)
 * - 심사 중: 안내만 (공고 목록이 열리지 않는다)
 * - 반려: 사유를 보여 주고 고쳐서 다시 신청 (AC-F1-20)
 * - 승인: 공고 목록으로 (3단계 서비스 등록 화면은 분담이 정해진 뒤 붙인다)
 * - 정지: 사유만 보여 준다
 */
import type { SupplierApplication } from "../shared/api/types";
import { useLogout } from "../shared/auth/useMe";
import { PageTop } from "../shared/layout/PageTop";
import { Button, ButtonLink } from "../shared/ui/Button";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { ApplicationForm } from "../features/supplier/ApplicationForm";
import { useApplication } from "../features/supplier/api";
import { Steps } from "../features/supplier/Steps";
import styles from "../features/supplier/Supplier.module.css";
import { usePageMeta } from "../features/seo/usePageMeta";

const TYPE_LABEL = { SOLE_PROPRIETOR: "개인사업자", CORPORATION: "법인사업자", INDIVIDUAL: "개인 (프리랜서)" } as const;

function appliedAt(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Pending({ app }: { app: SupplierApplication }) {
  const logout = useLogout();
  return (
    <>
      <div className={styles.notice} role="status">
        <b>입점 심사 중이에요</b>
        관리자가 사업자 정보를 확인하고 있어요. 승인되면 알림으로 알려 드려요. 심사 중에는 공고 목록이 보이지 않고 견적서를
        보낼 수 없어요.
      </div>
      <dl className={styles.summary}>
        <dt>신청</dt>
        <dd className="sd-num">{appliedAt(app.appliedAt)}</dd>
        <dt>상호</dt>
        <dd>{app.companyName}</dd>
        <dt>사업자 유형</dt>
        <dd>{TYPE_LABEL[app.businessType]}</dd>
      </dl>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => logout.mutate()} loading={logout.isPending}>
          로그아웃
        </Button>
      </div>
    </>
  );
}

export function SupplierOnboardingPage() {
  const app = useApplication();
  usePageMeta("입점 신청");

  if (app.isPending) return <p className="sd-sr-only">불러오는 중이에요</p>;

  const data = app.data ?? null;
  const status = data?.reviewStatus;
  const step = status === "APPROVED" ? 3 : status === "PENDING" ? 2 : 1;

  return (
    <>
      <PageTop
        title="입점 신청"
        crumbs={[{ label: "STAGE DUCK 파트너" }]}
        desc="관리자 심사를 거쳐 승인되면 서비스를 등록하고 공고를 볼 수 있어요."
      />
      <div className={`sd-container ${styles.wrap}`}>
        <Steps now={step} />
        {app.isError && <ErrorNotice error={app.error} />}

        {!app.isError && (data === null || status === "REJECTED") && (
          <>
            {status === "REJECTED" && (
              <div className={`${styles.notice} ${styles.rejected}`} role="alert">
                <b>입점 신청이 반려됐어요.</b>
                사유: {data?.rejectReason}
                <br />
                고쳐서 다시 신청해 주세요.
              </div>
            )}
            <ApplicationForm initial={data} resubmit={status === "REJECTED"} />
          </>
        )}

        {status === "PENDING" && data && <Pending app={data} />}

        {status === "APPROVED" && (
          <div className={`${styles.notice} ${styles.approved}`} role="status">
            <b>입점이 승인됐어요.</b>
            내 부문의 공고를 볼 수 있어요.
            <div className={styles.actions}>
              <ButtonLink to="/supplier/postings" variant="primary">
                공고 목록 보기
              </ButtonLink>
            </div>
          </div>
        )}

        {status === "SUSPENDED" && (
          <div className={`${styles.notice} ${styles.rejected}`} role="alert">
            <b>업체 이용이 정지됐어요.</b>
            사유: {data?.rejectReason}
          </div>
        )}
      </div>
    </>
  );
}
