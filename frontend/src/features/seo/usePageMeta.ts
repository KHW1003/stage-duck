import { useEffect } from "react";

const SITE = "STAGE DUCK";

/**
 * 화면 안에서 주소를 옮길 때 탭 제목만 바꾼다 (specs/seo.md 1장).
 * 처음 받는 HTML 의 head 는 서버(app/seo)가 채운다. title 이 없으면(불러오는 중) 바꾸지 않는다.
 */
export function usePageMeta(title?: string | null) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title.includes(SITE) ? title : `${title} · ${SITE}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
