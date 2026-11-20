/**
 * 알림 화면 아래 "메일로도 받기" (notifications.md 10장). 끄면 사이트 알림만 남는다.
 */
import { useNotificationSettings, useSetMailNotification } from "./api";
import { Ico } from "../../shared/ui/Ico";

export function MailSetting() {
  const settings = useNotificationSettings();
  const save = useSetMailNotification();
  if (!settings.data) return null;
  const on = save.isPending && save.variables !== undefined ? save.variables : settings.data.emailEnabled;
  return (
    <section className="noti-mail" aria-labelledby="noti-mail-title">
      <Ico name="mail" />
      <div className="noti-mail__text">
        <b id="noti-mail-title">중요한 알림은 메일로도 받기</b>
        <p>
          결제 마감·청구서·최종 견적·견적 요청처럼 놓치면 안 되는 알림만 <span className="sd-num">{settings.data.email}</span>(으)로 보내 드려요.
        </p>
      </div>
      <label className="noti-mail__switch">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          aria-labelledby="noti-mail-title"
        />
        <span aria-hidden="true">{on ? "켬" : "끔"}</span>
      </label>
    </section>
  );
}
