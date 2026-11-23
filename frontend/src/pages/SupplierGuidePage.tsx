/**
 * 업체 이용 가이드 (/guide/supplier). 목업: mockup-v4/pages/guide.html · FR-CS-04
 * 내용은 화면 코드에 둔다. 업체 홈·업체 바닥글·FAQ 에서 연결. 비로그인도 볼 수 있다 (입점 전 업체).
 */
import { Link } from "react-router-dom";
import { usePageMeta } from "../features/seo/usePageMeta";
import { OUTSIDE_PAYMENT_NOTICE } from "../features/support/terms";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { Ico } from "../shared/ui/Ico";
import "../features/support/support.css";

interface Step {
  title: string;
  desc: string;
  key?: boolean; // 핵심 단계 (파란 번호)
  action?: { label: string; to: string };
}

const STEPS: Step[] = [
  {
    title: "계정 만들기",
    desc: "이메일과 담당자 이름·휴대폰으로 업체 계정을 만듭니다. 담당자가 바뀌어도 쓸 수 있게 회사 공용 이메일을 추천합니다.",
    action: { label: "업체 가입", to: "/signup/supplier" },
  },
  { title: "사업자 정보 내기", desc: "상호, 사업자 등록번호, 대표자, 사업자 서류를 올립니다. 내 부문(공연장·장비·엔지니어)과 활동 지역도 고릅니다." },
  {
    title: "관리자 확인",
    desc: "관리자가 서류를 확인하고 승인하거나 반려합니다. 결과는 알림으로 알려 드립니다. 반려되면 사유를 보고 고쳐서 다시 낼 수 있습니다.",
  },
  {
    title: "서비스 등록",
    desc: "공연장은 공간(수용 인원, 입실 가능 시각, 공간 조건), 장비는 보유 장비와 기본 설치·철수 시간을 등록합니다. 소개 글도 하나 올려 두면 사용자가 먼저 견적을 요청할 수 있습니다.",
    action: { label: "서비스 등록", to: "/supplier/onboarding" },
  },
  {
    title: "공고 보고 견적서 보내기",
    desc: "내 부문·지역 공고가 열리면 알림이 옵니다. 품목·인력·일정·금액을 적어 견적서를 보내면 사용자 견적함에 도착하고 채팅방이 열립니다.",
    key: true,
    action: { label: "공고 목록", to: "/supplier/postings" },
  },
  {
    title: "채팅으로 조율하고 확정 받기",
    desc: "조율한 내용은 견적서를 고쳐 새 버전으로 보냅니다. 깎아 주는 금액은 업체할인 칸에 적습니다. 마지막에 최종 견적을 보내면 사용자가 확정합니다.",
    key: true,
  },
  {
    title: "결제 뒤 공연 준비",
    desc: "사용자가 모든 단계를 확정하고 결제하면 최종 담당표에서 일정·담당 범위·연락처를 함께 봅니다. 내 예약에서 공연별 현장 준비 사항도 정리할 수 있습니다.",
    action: { label: "내 예약", to: "/supplier/reservations" },
  },
  { title: "공연 뒤 정산", desc: "공연이 끝나면 보관 중이던 결제금이 정산 예정 금액으로 바뀝니다. 입점비와 수수료는 없습니다." },
];

export function SupplierGuidePage() {
  usePageMeta("업체 이용 가이드");
  return (
    <>
      <KitPageTop
        title="업체 이용 가이드"
        crumbs={[{ label: "고객지원" }]}
        desc="입점부터 정산까지, 업체가 하는 일을 순서대로 정리했습니다."
        narrow
      />
      <main className="container container--narrow main">
        <div className="guide">
          <ol className="guide__steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className={s.key ? "is-key" : undefined}>
                <span className="guide__no">{i + 1}</span>
                <div>
                  <b>{s.title}</b>
                  <p>{s.desc}</p>
                </div>
                {s.action && (
                  <Link className="btn btn--sm" to={s.action.to}>
                    {s.action.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <div className="notice notice--line mt-24">
            <Ico name="info" />
            <div>
              {OUTSIDE_PAYMENT_NOTICE} 자세한
              규칙은{" "}
              <Link className="link link--point" to="/terms/supplier">
                업체 이용약관
              </Link>
              에 있습니다.
            </div>
          </div>
          <p className="field__hint mt-16">
            더 궁금한 점은{" "}
            <Link className="link link--point" to="/faq?tab=supplier">
              자주 묻는 질문
            </Link>
            이나{" "}
            <Link className="link link--point" to="/inquiries/new">
              1:1 문의
            </Link>
            로 알려 주십시오.
          </p>
        </div>
      </main>
    </>
  );
}
