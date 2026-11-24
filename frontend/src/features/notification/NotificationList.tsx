/** 알림 줄 목록 (머리 종 패널·알림 화면이 같이 쓴다). 안 읽은 줄은 점, 누르면 읽음 처리 후 이동 */
import type { NotificationItem } from "./api";
import { timeAgo, useOpenNotification } from "./api";
import "./notification.css";

export function NotificationList({ items, label, onOpen }: { items: NotificationItem[]; label: string; onOpen?: () => void }) {
  const open = useOpenNotification();
  return (
    <ul className="noti-list" aria-label={label}>
      {items.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className={n.read ? "noti-row" : "noti-row is-unread"}
            onClick={() => {
              open(n);
              onOpen?.();
            }}
          >
            <span className="noti-row__dot" aria-label={n.read ? undefined : "안 읽음"} />
            <span className="noti-row__text">
              <b>{n.title}</b>
              {n.body && <span>{n.body}</span>}
            </span>
            <time className="noti-row__time" dateTime={n.createdAt}>
              {timeAgo(n.createdAt)}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
}
