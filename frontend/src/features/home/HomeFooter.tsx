/**
 * 메인 바닥글 (mockup/home.html · partner.html 의 .footer). 안쪽 화면 바닥글(shared/layout/Footer)보다 크다.
 * 주소는 specs/plan.md 6장. 아직 화면이 없는 곳(회사 소개 등)은 목업처럼 자리만 둔다.
 * 사업자 정보는 목업대로 "내용 미정" 표시 (D-49: 지어내지 않는다).
 */
import { Link } from "react-router-dom";
import { HomeIcon, type HomeIconName } from "./icons";
import { cx } from "./cx";
import s from "./home.module.css";

const SNS: { label: string; icon: HomeIconName }[] = [
  { label: "인스타그램", icon: "instagram" },
  { label: "유튜브", icon: "youtube" },
  { label: "네이버 블로그", icon: "blog" },
  { label: "카카오톡 채널", icon: "kakao" },
  { label: "X", icon: "x" },
];

type Col = { title: string; links: { label: string; to: string }[] };

function columns(partner: boolean): Col[] {
  return [
    {
      title: "서비스",
      links: [
        { label: "공간 찾기", to: "/venues" },
        { label: "공연 요청", to: "/performances/new" },
        { label: "업체 찾기", to: "/board" },
        { label: "이용 방법", to: "/#flow" },
      ],
    },
    {
      title: "업체",
      links: [
        { label: "입점 신청", to: partner ? "/signup/supplier" : "/partner" },
        { label: "업체 이용 가이드", to: "/guide/supplier" },
        { label: "정산 안내", to: "/guide/supplier" },
        { label: partner ? "이용료 안내" : "수수료 안내", to: "/faq" },
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
      title: "회사",
      links: [
        { label: "회사 소개", to: "/" },
        { label: "제휴 문의", to: "/inquiries/new" },
        { label: "채용", to: "/" },
      ],
    },
  ];
}

const LEGAL = [
  { label: "이용약관", to: "/terms/service" },
  { label: "개인정보처리방침", to: "/terms/privacy", strong: true },
  { label: "업체 이용약관", to: "/terms/supplier" },
  { label: "안전 결제 이용약관", to: "/terms/service" },
  { label: "청소년 보호정책", to: "/terms/service" },
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
              공간·음향·엔지니어를 한 번에 비교하세요.
            </p>
            <div className={s.sns}>
              {SNS.map((n) => (
                <a key={n.label} href="#" aria-label={n.label} onClick={(e) => e.preventDefault()}>
                  <HomeIcon name={n.icon} />
                </a>
              ))}
            </div>
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
            <p className={s.footerTel}>
              <span className={s.tbd}>내용 미정</span>
            </p>
            <p>운영 시간은 팀이 정해요</p>
            <Link className={cx(s.pill, s.pillDark)} to="/inquiries/new">
              1:1 문의하기
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
            <span>상호 · 대표 · 사업자등록번호 · 통신판매업 신고</span>
            <span className={s.tbd}>내용 미정</span>
          </p>
          <p className={s.footerNotice}>
            STAGE DUCK은 통신판매중개자로서 거래 당사자가 아니며, 업체가 등록한 서비스 정보와 거래에 대한 책임은 각 업체에 있어요.
          </p>
          <p className={s.footerCopy}>© 2026 STAGE DUCK. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
