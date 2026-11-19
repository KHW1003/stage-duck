/**
 * 약관 3종 내용 (FR-CS-05, D-49). 시연용 요약본 — 실제 서비스 약관이 아니다. 문구 출처: mockup-v4/pages/terms.html
 * 버전은 가입 때 저장하는 terms_agreements.terms_version(backend auth/service.TERMS_VERSION = "v1")과 같은 판이다.
 * 규칙(결제 기한·위약금·이용료 등)이 바뀌면 faq.ts 와 같이 고치고, 새 판이면 VERSIONS 에 한 줄 더한다.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type TermsType = "service" | "supplier" | "privacy";

export const OUTSIDE_PAYMENT_NOTICE = "플랫폼 밖에서 직접 결제한 거래에는 STAGE DUCK의 결제금 보관 및 환불 절차가 적용되지 않습니다.";

export const TERMS_TABS: { type: TermsType; label: string }[] = [
  { type: "service", label: "이용약관" },
  { type: "supplier", label: "업체 이용약관" },
  { type: "privacy", label: "개인정보 처리방침" },
];

export interface Article {
  id: string;
  title: string;
  p?: ReactNode;
  ol?: ReactNode[];
}

export interface Chapter {
  title?: string;
  articles: Article[];
}

export interface TermsDoc {
  title: string;
  version: string;
  effective: string;
  versionLabel: string;
  chapters: Chapter[];
  addendum: string;
}

const EFFECTIVE = "2026년 11월 17일";
const VERSION_LABEL = "2026.11.17 시행 (현재)";
const inquiry = (
  <Link className="link link--point" to="/inquiries/new">
    1:1 문의
  </Link>
);

const PENALTY: [string, string][] = [
  ["결제 전 (직접 취소 · 결제 기한이 지나 자동 취소)", "없음"],
  ["결제 후 12시간 안", "없음 (이용료도 환불)"],
  ["공연 30일 전 이전", "없음 (이용료도 환불)"],
  ["공연 29~15일 전", "10%"],
  ["공연 14~8일 전", "30%"],
  ["공연 7~2일 전", "50%"],
  ["공연 1일 전", "70%"],
  ["공연 당일", "100%"],
];

export function CancellationPenaltyTable() {
  return (
    <div className="tm-table table-box">
      <table className="table table--fit" aria-label="취소 시점별 위약금">
        <thead>
          <tr>
            <th>취소 시점</th>
            <th className="r">위약금 (업체 금액 기준)</th>
          </tr>
        </thead>
        <tbody>
          {PENALTY.map(([when, rate]) => (
            <tr key={when}>
              <td>{when}</td>
              <td className="r">{rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CANCELLATION_TERMS: Article = {
  id: "service-7",
  title: "제7조 (취소와 위약금)",
  ol: [
    <>
      사용자 사정으로 취소하면 업체 금액에 아래 비율을 적용한 위약금을 업체들에게 금액 비율대로 나눠 드립니다. 위약금이 붙는 구간에서는 플랫폼 이용료를 돌려 드리지
      않습니다.
      <CancellationPenaltyTable />
    </>,
    "결제 전 취소, 결제 기한 만료, 결제 후 취소가 90일 안에 3번이면 경고 1회가 기록됩니다.",
    "업체 사정으로 취소되면 플랫폼 이용료를 포함한 기존 결제액을 모두 돌려 드립니다. 다른 업체의 예약은 유지되고, 취소된 단계만 다시 모집할 수 있습니다.",
  ],
};

export const PAYMENT_DEADLINE_TERMS: Article = {
  id: "service-5",
  title: "제5조 (요청과 결제 기한)",
  ol: [
    "공연 요청은 공연 14일 전까지 올릴 수 있습니다.",
    "처음 업체를 컨펌한 때부터 7일 안에(공연까지 13일 이하면 48시간 안에) 남은 업체 선택과 결제를 끝내야 합니다. 마감은 공연 5일 전 0시를 넘지 않고, 마감 전에 알림을 보내 드립니다.",
    "마감까지 결제하지 않으면 컨펌한 업체 일정이 풀리고 공연이 취소됩니다. 이때 위약금은 없지만, 채팅을 시작한 공연이면 반려 1회로 기록됩니다.",
  ],
};

export const PAYMENT_HOLD_TERMS: Article = {
  id: "service-6",
  title: "제6조 (결제와 보관)",
  ol: [
    "통합 청구서 한 장으로 한 번에 결제합니다.",
    "결제금은 공연이 끝날 때까지 STAGE DUCK이 보관하고, 공연이 끝나면 업체별로 정산합니다.",
    "시연 환경의 결제는 테스트 결제라 실제로 청구되지 않습니다.",
    OUTSIDE_PAYMENT_NOTICE,
  ],
};

const SERVICE: TermsDoc = {
  title: "STAGE DUCK 이용약관",
  version: "1.0",
  effective: EFFECTIVE,
  versionLabel: VERSION_LABEL,
  addendum: `이 약관은 ${EFFECTIVE}부터 시행합니다.`,
  chapters: [
    {
      title: "제1장 총칙",
      articles: [
        {
          id: "service-1",
          title: "제1조 (목적)",
          p: "이 약관은 공연을 준비하는 사용자와 공연장·장비·엔지니어 업체를 이어 주는 STAGE DUCK을 쓰는 방법과 서로의 권리·책임을 정합니다.",
        },
        {
          id: "service-2",
          title: "제2조 (용어)",
          ol: [
            <><b>사용자</b>: 공연을 준비하며 공간·장비·인력을 찾는 회원입니다.</>,
            <><b>업체</b>: 관리자 확인을 거쳐 승인된 공연장·장비·엔지니어 회원입니다.</>,
            <><b>견적서</b>: 업체가 공고를 보고 보내는 금액·조건 문서입니다.</>,
            <><b>확정</b>: 사용자가 견적서를 최종 선택하는 것입니다.</>,
            <><b>플랫폼 이용료</b>: 사용자가 업체 금액 합계의 5%를 STAGE DUCK에 내는 금액입니다.</>,
          ],
        },
        {
          id: "service-3",
          title: "제3조 (서비스의 성격)",
          ol: ["STAGE DUCK은 거래를 중개하고 결제금을 보관합니다.", "공연장 대관·장비·엔지니어 서비스를 직접 제공하지 않으며 거래 당사자가 아닙니다."],
        },
      ],
    },
    {
      title: "제2장 회원",
      articles: [{ id: "service-4", title: "제4조 (가입)", ol: ["만 14세 이상이면 가입할 수 있습니다.", "이메일·네이버로 가입하고, 한 사람이 계정 하나를 씁니다."] }],
    },
    {
      title: "제3장 요청·결제·취소",
      articles: [
        PAYMENT_DEADLINE_TERMS,
        PAYMENT_HOLD_TERMS,
        CANCELLATION_TERMS,
      ],
    },
    {
      title: "제4장 이용 규칙",
      articles: [
        {
          id: "service-8",
          title: "제8조 (하면 안 되는 일)",
          ol: [
            "공개 게시물에 전화번호·계좌번호·외부 링크를 올리는 일",
            "견적서·확정한 조건과 다르게 이행하는 일",
            "다른 사람 정보로 가입하거나 거짓 내용을 올리는 일",
          ],
        },
        {
          id: "service-9",
          title: "제9조 (제재)",
          ol: ["신고를 받아 관리자가 확인하면 경고를 기록합니다.", "경고가 3회 쌓이면 이용이 정지됩니다. 정지된 계정도 1:1 문의는 쓸 수 있습니다."],
        },
        {
          id: "service-10",
          title: "제10조 (게시물)",
          ol: ["업체 찾기·커뮤니티 글과 댓글은 쓴 사람에게 책임이 있습니다.", "규칙을 어긴 글은 관리자가 가리고 경고를 기록할 수 있습니다."],
        },
      ],
    },
    {
      title: "제5장 기타",
      articles: [{ id: "service-11", title: "제11조 (문의)", p: <>궁금한 점이나 다툼은 {inquiry}로 알려 주십시오.</> }],
    },
  ],
};

export const SUPPLIER_SETTLEMENT_TERMS: Article = {
  id: "supplier-5",
  title: "제5조 (정산)",
  ol: [
    "결제금은 공연이 끝날 때까지 보관되고, 공연이 끝나면 정산 예정 금액으로 바뀝니다.",
    OUTSIDE_PAYMENT_NOTICE,
    "사용자가 공연 29일 전부터 취소하면 위약금을 업체 금액 비율대로 받습니다. 결제 전 취소, 결제 기한 만료, 결제 후 12시간 안·공연 30일 전 이전 취소는 위약금이 없습니다.",
  ],
};

export const SUPPLIER_CANCELLATION_TERMS: Article = {
  id: "supplier-6",
  title: "제6조 (업체 사정 취소)",
  ol: [
    "업체 사정으로 취소하면 공연팀에 기존 결제액 전액을 환불하고, 취소한 업체에 경고 1회를 기록합니다.",
    "한 업체가 취소해도 다른 업체의 예약은 유지합니다. 다른 업체가 약속한 서비스를 제공하면 해당 계약에 따라 정산합니다.",
    "취소로 생긴 추가 비용은 취소 사유와 책임을 확인해 누가 부담할지 정합니다.",
  ],
};

const SUPPLIER: TermsDoc = {
  title: "STAGE DUCK 업체 이용약관",
  version: "1.0",
  effective: EFFECTIVE,
  versionLabel: VERSION_LABEL,
  addendum: `이 약관은 ${EFFECTIVE}부터 시행합니다.`,
  chapters: [
    {
      title: "제1장 입점",
      articles: [
        {
          id: "supplier-1",
          title: "제1조 (입점)",
          ol: ["계정을 만들고 사업자 정보를 내면 관리자가 확인합니다.", "승인되면 승인받은 부문(공연장·장비·엔지니어)의 공고만 보고 견적서를 보낼 수 있습니다."],
        },
        { id: "supplier-2", title: "제2조 (업체가 내는 돈)", p: "입점비와 수수료는 없습니다. 플랫폼 이용료는 사용자가 냅니다." },
      ],
    },
    {
      title: "제2장 견적과 이행",
      articles: [
        {
          id: "supplier-3",
          title: "제3조 (견적서)",
          ol: ["금액은 부가세를 포함한 원 단위로 적고, 최종 합계는 10,000원 이상이어야 합니다.", "채팅으로 조율하며 업체할인을 넣을 수 있고, 고치면 새 버전으로 발송됩니다."],
        },
        { id: "supplier-4", title: "제4조 (확정과 이행)", ol: ["사용자가 확정한 견적서의 내용·시간대로 이행합니다.", "확정한 조건은 최종 담당표에 그대로 보관됩니다."] },
        SUPPLIER_SETTLEMENT_TERMS,
        SUPPLIER_CANCELLATION_TERMS,
      ],
    },
    {
      title: "제3장 연락과 게시",
      articles: [
        { id: "supplier-7", title: "제7조 (연락처)", ol: ["사용자와 업체의 연락처는 결제가 끝난 뒤 최종 담당표에서만 서로 보입니다.", "그 전에는 채팅으로만 연락합니다."] },
        { id: "supplier-8", title: "제8조 (업체 찾기)", ol: ["부문마다 게시글 1개를 올릴 수 있고, 끌어올리기는 7일에 한 번입니다.", "규칙을 어긴 글은 가려지고 경고가 기록됩니다."] },
      ],
    },
  ],
};

const PRIVACY_ROWS: [string, string, string][] = [
  ["사용자", "이름, 전화번호, 이메일, 생년월일, 닉네임, 비밀번호(암호화), 가입 목적", "뮤지션 유형, 가입 경로, 프로필 사진"],
  ["업체", "이메일, 비밀번호(암호화), 담당자 이름·휴대폰, 사업자 정보·서류", "마케팅 수신 동의"],
  ["네이버 로그인", "네이버 회원 식별값, 이메일", "-"],
];

const PRIVACY: TermsDoc = {
  title: "STAGE DUCK 개인정보 처리방침",
  version: "1.0",
  effective: EFFECTIVE,
  versionLabel: VERSION_LABEL,
  addendum: `이 방침은 ${EFFECTIVE}부터 시행합니다.`,
  chapters: [
    {
      articles: [
        {
          id: "privacy-1",
          title: "1. 받는 정보",
          p: (
            <>
              가입과 거래에 필요한 정보만 받습니다.
              <span className="tm-table table-box" style={{ display: "block" }}>
                <table className="table table--fit">
                  <thead>
                    <tr>
                      <th>누구</th>
                      <th>필수</th>
                      <th>선택</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRIVACY_ROWS.map(([who, req, opt]) => (
                      <tr key={who}>
                        <td>{who}</td>
                        <td className="l">{req}</td>
                        <td className="l">{opt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </span>
            </>
          ),
        },
        { id: "privacy-2", title: "2. 쓰는 곳", p: "가입·로그인, 견적·채팅·결제 진행, 결제 뒤 최종 담당표, 신고 처리와 1:1 문의 답변에만 씁니다." },
        {
          id: "privacy-3",
          title: "3. 다른 회원에게 보이는 정보",
          ol: [
            "업체에게는 닉네임·프로필 사진·가입일·이용 횟수·반려 횟수만 보입니다.",
            "이름·전화번호·이메일은 결제가 끝난 뒤 그 공연에서 확정된 업체에게만 최종 담당표로 보입니다.",
          ],
        },
        { id: "privacy-4", title: "4. 보관 기간", ol: ["탈퇴하면 바로 지웁니다.", "시연 환경의 데이터는 시연 데이터를 초기화할 때 삭제됩니다."] },
        { id: "privacy-5", title: "5. 로그인 쿠키", p: "로그인 상태를 지키기 위한 쿠키만 씁니다. 광고·추적 쿠키는 쓰지 않습니다." },
        { id: "privacy-6", title: "6. 내 권리", p: <>마이페이지에서 내 정보를 보고 고칠 수 있고, 지우고 싶으면 {inquiry}로 요청할 수 있습니다.</> },
      ],
    },
  ],
};

export const TERMS: Record<TermsType, TermsDoc> = { service: SERVICE, supplier: SUPPLIER, privacy: PRIVACY };

function groupTerms(doc: TermsDoc, cancellationIds: readonly string[]) {
  const articles = doc.chapters.flatMap((chapter) => chapter.articles);
  return {
    transaction: articles.filter((article) => !cancellationIds.includes(article.id)),
    cancellation: articles.filter((article) => cancellationIds.includes(article.id)),
  };
}

export const SERVICE_TERM_GROUPS = groupTerms(SERVICE, ["service-7", "service-11"]);
export const SUPPLIER_TERM_GROUPS = groupTerms(SUPPLIER, ["supplier-6", "supplier-7", "supplier-8"]);

export function isTermsType(v: string | undefined): v is TermsType {
  return v === "service" || v === "supplier" || v === "privacy";
}
