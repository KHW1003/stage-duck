/** 채팅 목록·대화방이 같이 쓰는 작은 조각 (아바타 글자, 핀 아이콘·메뉴, 시각 글) */

export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

/** mockup-v3 chat-widget.js PIN */
export function PinIcon() {
  return (
    <svg className="cw-pin" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4h6l-1 6 3 3H7l3-3z" />
      <path d="M12 16v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PinMenuItem({ pinned, onClick }: { pinned: boolean; onClick: () => void }) {
  return (
    <button className="cw-menu__item cw-menu__item--point" type="button" role="menuitem" onClick={onClick}>
      <PinIcon />
      {pinned ? "고정 해제" : "상단에 고정"}
    </button>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 말풍선 옆 시각 "13:24" */
export function msgTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 날짜 줄 "11월 13일 (금)" */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`;
}

/** 목록 오른쪽 시각: 오늘이면 "13:24", 아니면 "11월 13일" */
export function listTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString() ? msgTime(iso) : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
