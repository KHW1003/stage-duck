/**
 * 결제 마감 안내 (D-57, AC-F5-22). 처음 컨펌 뒤 결제 전에만 보인다. 결제 안내문이라 합니다체.
 * 마감이 지나면 확정한 업체 일정이 해제되고 공연이 자동 취소된다 (서버 1분마다).
 */
import { Ico } from "./Ico";

function when(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function left(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "마감 시각이 지났습니다";
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 남음`;
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.floor(ms / 60000))}분 남음`;
}

export function DeadlineNotice({ deadline, what = "남은 업체 선택과 결제" }: { deadline: string | null | undefined; what?: string }) {
  if (!deadline) return null;
  return (
    <div className="notice notice--warn mt-12" role="note" aria-label="결제 마감">
      <Ico name="clock" />
      <div>
        <b>
          {when(deadline)}까지 {what}를 마쳐 주십시오 · {left(deadline)}
        </b>
        <br />
        마감이 지나면 확정한 업체 일정이 해제되고 공연이 자동 취소됩니다.
      </div>
    </div>
  );
}
