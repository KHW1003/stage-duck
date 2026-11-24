/**
 * 알림 (/notifications, 사용자·업체). specs/notifications.md 6장, 이슈 #45, 목업 v4 notifications.html.
 * - 분류 탭 7개(전체 + 6), 오늘 / 이전 묶음, 안 읽은 줄은 점. 누르면 읽음 처리 후 이동 (채팅 알림은 채팅 창)
 * - [모두 읽음], 20개씩 [더 보기]
 * - 아래에 "중요한 알림은 메일로도 받기" 켜기·끄기 (10장)
 */
import { useState } from "react";
import { CATEGORY_TABS, isToday, useMarkRead, useNotifications, type NotificationCategory } from "../features/notification/api";
import { MailSetting } from "../features/notification/MailSetting";
import { NotificationList } from "../features/notification/NotificationList";
import { usePageMeta } from "../features/seo/usePageMeta";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { Ico } from "../shared/ui/Ico";
import "../features/notification/notification.css";

export function NotificationsPage() {
  usePageMeta("알림");
  const [tab, setTab] = useState<NotificationCategory | null>(null);
  const list = useNotifications(tab);
  const read = useMarkRead();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unreadCount ?? 0;
  const today = items.filter((n) => isToday(n.createdAt));
  const before = items.filter((n) => !isToday(n.createdAt));

  return (
    <>
      <KitPageTop
        title="알림"
        crumbs={[{ label: "알림" }]}
        actions={
          unread > 0 && (
            <button className="btn btn--sm" type="button" disabled={read.isPending} onClick={() => read.mutate({ all: true })}>
              모두 읽음
            </button>
          )
        }
      />
      <main className="container main">
        <div className="noti-page__tabs filters" role="group" aria-label="알림 분류">
          {CATEGORY_TABS.map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {list.isError && <ErrorNotice error={list.error} />}
        {list.isPending && <p className="sd-sr-only">불러오는 중이에요</p>}
        {list.isSuccess && items.length === 0 && (
          <div className="empty">
            <Ico name="bell" />
            <b>새 알림이 없어요</b>
            <p>견적서·견적 요청·결제 소식이 오면 여기에 쌓여요.</p>
          </div>
        )}
        {today.length > 0 && (
          <>
            <h2 className="noti-page__group">오늘</h2>
            <div className="noti-page__box">
              <NotificationList items={today} label="오늘 알림" />
            </div>
          </>
        )}
        {before.length > 0 && (
          <>
            <h2 className="noti-page__group">이전</h2>
            <div className="noti-page__box">
              <NotificationList items={before} label="이전 알림" />
            </div>
          </>
        )}
        {list.hasNextPage && (
          <div className="mt-16" style={{ textAlign: "center" }}>
            <button className="btn btn--sm" type="button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              더 보기
            </button>
          </div>
        )}
        <MailSetting />
      </main>
    </>
  );
}
