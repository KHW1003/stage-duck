/**
 * 안쪽 화면 제목 (mockup-v4 .page-top 마크업 그대로, kit.css). 화면마다 맨 위에 하나.
 * crumbs: 현재 위치, desc: 설명 한 줄, meta: 작은 정보 줄(| 로 나뉨), actions: 오른쪽 버튼
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface Crumb {
  label: string;
  to?: string;
}

interface Props {
  title: ReactNode;
  crumbs?: Crumb[];
  desc?: ReactNode;
  meta?: ReactNode[];
  actions?: ReactNode;
  narrow?: boolean;
}

export function KitPageTop({ title, crumbs, desc, meta, actions, narrow = false }: Props) {
  return (
    <div className="page-top">
      <div className={narrow ? "container container--narrow page-top__inner" : "container page-top__inner"}>
        <div>
          {crumbs && crumbs.length > 0 && (
            <ol className="page-top__crumb" aria-label="현재 위치">
              {crumbs.map((c) => (
                <li key={c.label}>{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</li>
              ))}
            </ol>
          )}
          <h1>{title}</h1>
          {desc && <p className="page-top__desc">{desc}</p>}
          {meta && meta.length > 0 && (
            <p className="page-top__meta">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </p>
          )}
        </div>
        {actions && <div className="page-top__actions">{actions}</div>}
      </div>
    </div>
  );
}
