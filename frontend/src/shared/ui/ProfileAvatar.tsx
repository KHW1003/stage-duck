/**
 * 프로필 그림 (11/26 오리 프로필): 사진이 있으면 사진, 없으면 그 계정의 오리, 오리 정보도 없으면 이름 첫 글자.
 * 오리는 화면에서 그린 SVG 를 <img src="data:..."> 로 넣는다 (서버 글자를 HTML 로 넣지 않는다, CLAUDE.md 24).
 */
import type { CSSProperties } from "react";
import { duckDataUrl, type Duck } from "./duck";

interface Props {
  name: string;
  src?: string | null;
  duck?: Duck | null;
  /** 겉 칸 클래스 (기본 kit.css .avatar). 화면별 모듈 클래스를 넘겨도 된다 */
  className?: string;
  /** 그림 픽셀 크기 — 48 미만이면 오리를 굵고 단순하게 그린다 */
  size?: number;
  /** 있으면 그림을 읽어 준다 (없으면 장식) */
  label?: string;
}

export function ProfileAvatar({ name, src, duck, className = "avatar", size = 48, label }: Props) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  if (src) {
    const style = { "--img": `url('${src}')`, backgroundImage: `url('${src}')`, backgroundSize: "cover", backgroundPosition: "center" } as CSSProperties;
    return <span className={className} style={style} {...a11y} />;
  }
  if (duck) {
    return (
      <span className={`${className} avatar--duck`} {...a11y}>
        <img className="avatar__duck" src={duckDataUrl({ ...duck, size: size * 2 < 96 ? size : size * 2 })} alt="" />
      </span>
    );
  }
  return (
    <span className={className} {...a11y}>
      {name.replace(/^업체\s*/, "").slice(0, 1)}
    </span>
  );
}
