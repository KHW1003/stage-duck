/**
 * 메인 커뮤니티 최신 글 3개 (2026-11-24 사용자 요청, 목업에는 없는 구역). GET /free-posts 는 방문자도 본다 (AC-F4-12).
 * 글이 없거나 불러오지 못하면 구역을 통째로 숨긴다. 서버가 20개씩만 주어 앞의 3개만 쓴다.
 */
import { Link } from "react-router-dom";
import { DEFAULT_PARAMS, useFreePosts } from "../community/api";
import { CATEGORY_LABEL, shortDate } from "../community/labels";
import { cx } from "./cx";
import s from "./home.module.css";

export function CommunitySection() {
  const posts = useFreePosts(DEFAULT_PARAMS);
  const items = posts.data?.items.slice(0, 3) ?? [];
  if (!posts.isPending && items.length === 0) return null;
  const today = new Date();
  return (
    <section className={s.community} aria-labelledby="home-community">
      <div className={s.wrap}>
        <div className={s.secHead}>
          <h2 className={s.secTitle} id="home-community">커뮤니티</h2>
          <Link className={s.more} to="/community">
            전체 보기 <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className={cx(s.postList, posts.isPending && s.postListLoading)} aria-busy={posts.isPending}>
          {items.map((p) => (
            <li key={p.id}>
              <Link className={s.postRow} to={`/community/${p.id}`}>
                <span className={s.muted}>{CATEGORY_LABEL[p.category]}</span>
                <span className={s.postRowTitle}>
                  <b>{p.title}</b>
                  {p.commentCount > 0 && <span className={s.postRowCount}>[{p.commentCount}]</span>}
                </span>
                <span className={s.muted}>{shortDate(p.createdAt, today)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
