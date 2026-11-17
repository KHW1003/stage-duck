/**
 * 안쪽 화면 제목 (목업 v3: 흰 바탕 제목 + 설명 + 오른쪽 행동). 화면마다 맨 위에 하나.
 * 제목은 명세서의 화면 이름을 쓴다. 문구가 정해지지 않은 화면은 tbd 로 "내용 미정" 라벨을 단다 (DESIGN.md 6장).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./PageTop.module.css";

interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  title: string;
  desc?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  tbd?: boolean;
}

export function PageTop({ title, desc, crumbs, actions, tbd = false }: Props) {
  return (
    <div className={styles.pageTop}>
      <div className={`sd-container ${styles.inner}`}>
        <div>
          {crumbs && crumbs.length > 0 && (
            <ol className={styles.crumb} aria-label="현재 위치">
              {crumbs.map((c) => (
                <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>
              ))}
            </ol>
          )}
          <h1>
            {title}
            {tbd && <span className={styles.tbd}>내용 미정</span>}
          </h1>
          {desc && <p className={styles.desc}>{desc}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
