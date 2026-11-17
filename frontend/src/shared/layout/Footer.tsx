/**
 * 바닥글 (DESIGN.md 5장). 출처: docs/design/mockup-v3/layout.js 바닥글 — 같은 항목·순서.
 * 주소는 specs/plan.md 6장 라우트 표 (#94). 아직 없는 화면은 누르면 "찾을 수 없어요"가 나온다.
 * 사업자 정보는 D-49: 지어내지 않고 "포트폴리오 프로젝트 · 실제 사업자가 아니에요"로 둔다.
 * FR-CS-01 1:1 문의 · FR-CS-02 공지사항 · FR-CS-03 자주 묻는 질문 · FR-CS-04 업체 이용 가이드(업체만)
 */
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

interface FooterLink {
  label: string;
  to: string;
  strong?: boolean;
  partnerOnly?: boolean;
}

const LINKS: FooterLink[] = [
  { label: "이용약관", to: "/terms/service" },
  { label: "개인정보처리방침", to: "/terms/privacy", strong: true },
  { label: "업체 이용약관", to: "/terms/supplier" },
  { label: "공지사항", to: "/notices" },
  { label: "자주 묻는 질문", to: "/faq" },
  { label: "업체 이용 가이드", to: "/guide/supplier", partnerOnly: true },
  { label: "1:1 문의", to: "/inquiries/new" },
];

export function Footer({ partner = false }: { partner?: boolean }) {
  return (
    <footer className={styles.footer}>
      <div className="sd-container">
        <div className={styles.top}>
          <img src={partner ? "/logo-partner.svg" : "/logo.svg"} alt="STAGE DUCK" />
          <nav aria-label="바닥글">
            <ul className={styles.links}>
              {LINKS.filter((l) => partner || !l.partnerOnly).map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.strong ? <b>{l.label}</b> : l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className={styles.biz}>
          포트폴리오 프로젝트 · 실제 사업자가 아니에요
          <br />
          STAGE DUCK은 통신판매중개자로서 거래 당사자가 아니에요. © 2026 STAGE DUCK
        </p>
      </div>
    </footer>
  );
}
