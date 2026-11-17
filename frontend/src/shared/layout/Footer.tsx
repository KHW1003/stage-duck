/**
 * 바닥글 (DESIGN.md 5장, 목업 layout.css .footer). 약관·문의 화면은 아직 없어서 글자만 둔다.
 * 사업자 정보는 내용 미정 (DESIGN.md 6장 규칙: 비어 있으면 "내용 미정" 라벨).
 */
import styles from "./Footer.module.css";

const LINKS = ["이용약관", "개인정보처리방침", "업체 이용약관", "공지사항", "1:1 문의"];

export function Footer({ partner = false }: { partner?: boolean }) {
  return (
    <footer className={styles.footer}>
      <div className="sd-container">
        <div className={styles.top}>
          <img src={partner ? "/logo-partner.svg" : "/logo.svg"} alt="STAGE DUCK" />
          <ul className={styles.links} aria-label="바닥글">
            {LINKS.map((l) => (
              <li key={l}>{l === "개인정보처리방침" ? <b>{l}</b> : l}</li>
            ))}
          </ul>
        </div>
        <p className={styles.biz}>
          사업자 정보 <span className={styles.tbd}>내용 미정</span>
          <br />
          STAGE DUCK은 통신판매중개자로서 거래 당사자가 아니에요. © 2026 STAGE DUCK
        </p>
      </div>
    </footer>
  );
}
