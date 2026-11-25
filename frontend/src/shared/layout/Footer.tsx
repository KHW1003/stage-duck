/**
 * 안쪽 화면 바닥글. 11/25 해원: 메인과 같은 바닥글(features/home/HomeFooter)로 통일했다.
 * 메인 바닥글은 home.module.css 의 .root 안에서 쓰는 값(여백·글꼴)을 쓰므로 .footer-host 로 감싼다.
 * 업체 계정이면 업체용 바로가기·로고를 쓴다.
 */
import { HomeFooter } from "../../features/home/HomeFooter";
import s from "../../features/home/home.module.css";

export function Footer({ partner = false }: { partner?: boolean }) {
  return (
    <div className={s.footerHost}>
      <HomeFooter partner={partner} />
    </div>
  );
}
