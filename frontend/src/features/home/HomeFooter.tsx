/**
 * 바닥글 (mockup/home.html · partner.html 의 .footer). 11/25 해원: 메인·안쪽 화면 모두 이 바닥글 하나로 통일.
 * 주소는 specs/plan.md 6장. 화면이 없는 곳(회사 소개·채용·SNS 계정)은 가짜 링크라 넣지 않는다.
 * 사업자·고객센터 정보는 shared/site/company.ts 한 곳에서 읽는다. 빈 칸은 "준비 중" (D-49: 지어내지 않는다, 11/25).
 */
import { COMPANY, PENDING, bizRows, hasCompanyInfo } from "../../shared/site/company";
import { Link } from "react-router-dom";
import { cx } from "./cx";
import s from "./home.module.css";

type Col = { title: string; links: { label: string; to: string }[] };

function columns(partner: boolean): Col[] {
  return [
    {
      title: "서비스",
      links: [
        { label: "공연 요청서 쓰기", to: "/performances/new" },
        { label: "공간 찾기", to: "/venues" },
        { label: "업체 찾기", to: "/board" },
        { label: "커뮤니티", to: "/community" },
        { label: "이용 방법", to: "/#flow" },
      ],
    },
    {
      title: "업체",
      links: partner
        ? [
            { label: "공고 보기", to: "/supplier/postings" },
            { label: "업체 이용 가이드", to: "/guide/supplier" },
            { label: "정산·이용료 안내", to: "/guide/supplier" },
            { label: "업체 메인", to: "/partner" },
          ]
        : [
            { label: "업체로 입점하기", to: "/partner" },
            { label: "업체 이용 가이드", to: "/guide/supplier" },
            { label: "정산·이용료 안내", to: "/guide/supplier" },
          ],
    },
    {
      title: "고객지원",
      links: [
        { label: "공지사항", to: "/notices" },
        { label: "자주 묻는 질문", to: "/faq" },
        { label: "1:1 문의", to: "/inquiries/new" },
        { label: "신고·제재 안내", to: "/faq" },
      ],
    },
    {
      title: "내 계정",
      links: partner
        ? [
            { label: "받은 견적 요청", to: "/supplier/offers" },
            { label: "예약 현황", to: "/supplier/reservations" },
            { label: "업체 정보", to: "/supplier/profile" },
            { label: "마이페이지", to: "/mypage" },
          ]
        : [
            { label: "내 공연 현황", to: "/me/performances" },
            { label: "내 문의", to: "/me/inquiries" },
            { label: "저장한 글", to: "/community/saved" },
            { label: "마이페이지", to: "/mypage" },
          ],
    },
  ];
}

const LEGAL = [
  { label: "이용약관", to: "/terms/service" },
  { label: "개인정보처리방침", to: "/terms/privacy", strong: true },
  { label: "업체 이용약관", to: "/terms/supplier" },
  { label: "제휴 문의", to: "/inquiries/new" },
];

export function HomeFooter({ partner = false }: { partner?: boolean }) {
  return (
    <footer className={s.footer}>
      <div className={s.wrap}>
        <div className={s.footerTop}>
          <div className={s.footerBrand}>
            <Link className={s.logo} to={partner ? "/partner" : "/"}>
              <img className={s.logoImg} src={partner ? "/logo-partner.svg" : "/logo.svg"} alt="STAGE DUCK" />
            </Link>
            <p>
              작은 공연의 시작부터 끝까지.
              <br />
              요청서 한 장으로 공연장 → 장비 → 엔지니어를
              <br />
              차례로 비교하고 한 번에 결제하세요.
            </p>
          </div>
          <nav className={s.footerCols} aria-label="푸터 메뉴">
            {columns(partner).map((c) => (
              <div key={c.title}>
                <h3>{c.title}</h3>
                {c.links.map((l) => (
                  <Link key={l.label} to={l.to}>
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className={s.footerCs}>
            <h3>고객센터</h3>
            <p className={s.footerTel}>{COMPANY.tel ?? <span className={s.tbd}>{PENDING}</span>}</p>
            <p>{COMPANY.csHours ?? "운영 시간 준비 중"}</p>
            <Link className={cx(s.pill, s.pillDark)} to="/inquiries/new">
              1:1 문의 남기기
            </Link>
          </div>
        </div>
        <div className={s.footerLegal}>
          {LEGAL.map((l) => (
            <Link key={l.label} to={l.to}>
              {l.strong ? <b>{l.label}</b> : l.label}
            </Link>
          ))}
        </div>
        <div className={s.footerBiz}>
          <p>
            {bizRows().map(([k, v], i) => (
              <span key={k}>
                {i > 0 && " · "}
                {k} {v === PENDING ? <span className={s.tbd}>{v}</span> : v}
              </span>
            ))}
          </p>
          {!hasCompanyInfo() && <p className={s.footerNotice}>포트폴리오·시연용 서비스입니다. 실제 결제는 이루어지지 않습니다.</p>}
          <p className={s.footerNotice}>
            STAGE DUCK은 통신판매중개자로서 거래 당사자가 아니며, 업체가 등록한 서비스 정보와 거래에 대한 책임은 각 업체에 있습니다. 결제금은 공연이 끝날 때까지 STAGE DUCK이 보관한 뒤 업체에 정산합니다.
          </p>
          <p className={s.footerCopy}>© 2026 STAGE DUCK. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
