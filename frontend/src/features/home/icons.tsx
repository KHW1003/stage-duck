/** 메인 목업(home.html·partner.html)의 선 아이콘 그대로. 안쪽 화면 아이콘(shared/ui/Icon)과 모양이 달라 따로 둔다 */
import type { ReactNode } from "react";

const PATHS = {
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  chat: <path d="M5 5h14v10H9l-4 4V5Z" />,
  prev: <path d="m14 6-6 6 6 6" />,
  next: <path d="m10 6 6 6-6 6" />,
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 6l10 6-10 6Z" />,
  pass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 15-6v14L3 13Z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  card: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 15h3" />
    </>
  ),
  house: (
    <>
      <path d="M5 19V9l7-4 7 4v10" />
      <path d="M9 19v-5h6v5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  bubble: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r=".8" className="fill" />
    </>
  ),
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="m10 9 5 3-5 3Z" className="fill" />
    </>
  ),
  blog: (
    <>
      <rect x="3.5" y="4.5" width="17" height="13" rx="3" />
      <path d="m10 17.5 2 2.5 2-2.5" />
      <path d="M9 13.5v-5l6 5v-5" />
    </>
  ),
  kakao: <path d="M12 4.5c-4.7 0-8.5 2.9-8.5 6.5 0 2.3 1.6 4.4 4 5.5l-.9 3.3 3.8-2.4c.5.1 1 .1 1.6.1 4.7 0 8.5-2.9 8.5-6.5S16.7 4.5 12 4.5Z" />,
  x: <path d="m5 4.5 14 15M19 4.5l-14 15" />,
} satisfies Record<string, ReactNode>;

export type HomeIconName = keyof typeof PATHS;

export function HomeIcon({ name, decorative = true }: { name: HomeIconName; decorative?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={decorative || undefined}>
      {PATHS[name]}
    </svg>
  );
}
