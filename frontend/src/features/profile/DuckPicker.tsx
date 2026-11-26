/**
 * 프로필 사진 바꾸기 창 (11/26): 내 역할의 오리 중에서 고르고, 아래 [사진 올리기]로 내 사진도 쓸 수 있다.
 * 오리를 고르면 사진은 빠진다 (서버가 저장, 화면은 서버가 준 값만 보여 준다).
 */
import { duckDataUrl, duckPicks, type Duck } from "../../shared/ui/duck";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { Ico } from "../../shared/ui/Ico";
import { KitModal } from "../../shared/ui/KitModal";

interface Props {
  duck: Duck;
  /** 지금 사진을 쓰는 중이면 어떤 오리도 고른 상태가 아니다 */
  hasPhoto: boolean;
  busy: boolean;
  error: unknown;
  onPick: (pick: string) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
}

export function DuckPicker({ duck, hasPhoto, busy, error, onPick, onUpload, onClose }: Props) {
  const picks = duckPicks(duck.role);
  return (
    <KitModal
      title="프로필 사진 바꾸기"
      onClose={onClose}
      busy={busy}
      foot={
        <>
          <label className="btn profile-photo">
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              aria-label="사진 올리기"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onUpload(file);
              }}
            />
            <Ico name="upload" sm />
            {busy ? "저장하는 중" : "사진 올리기"}
          </label>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            닫기
          </button>
        </>
      }
    >
      <p className="duck-picker__desc">오리를 고르면 바로 프로필 사진이 바뀌어요. 내 사진을 쓰려면 [사진 올리기]를 눌러 주세요.</p>
      <div className="duck-grid" role="group" aria-label="오리 고르기">
        {picks.map((pick, i) => (
          <button
            key={pick}
            type="button"
            className="duck-pick"
            aria-label={`오리 ${i + 1}`}
            aria-pressed={!hasPhoto && pick === duck.pick}
            disabled={busy}
            onClick={() => onPick(pick)}
          >
            <img src={duckDataUrl({ seed: duck.seed, role: duck.role, pick, size: 144 })} alt="" />
          </button>
        ))}
      </div>
      <ErrorNotice error={error} />
    </KitModal>
  );
}
