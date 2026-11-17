/**
 * 찾을 수 없음. 출처: docs/design/mockup-v3/pages/notice.html (kind=notfound) — 같은 문구·버튼.
 * 없는 주소와 권한 없는 화면을 같은 화면으로 보여 준다 — 있는지조차 알리지 않는다 (CLAUDE.md 10, FR-AUTH-07).
 */
import { useNavigate } from "react-router-dom";
import { Button, ButtonLink } from "../ui/Button";
import { Icon } from "../ui/Icon";
import styles from "./NotFound.module.css";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <section className={styles.gate}>
      <span className={styles.icon}>
        <Icon name="search" />
      </span>
      <h1>페이지를 찾을 수 없어요</h1>
      <p>주소가 바뀌었거나, 볼 수 없는 화면이에요.</p>
      <div className={styles.btns}>
        <Button size="lg" onClick={() => navigate(-1)}>
          이전 화면
        </Button>
        <ButtonLink to="/" variant="primary" size="lg">
          처음으로
        </ButtonLink>
      </div>
    </section>
  );
}
