/** 공고 게시 확인 창 (목업 v4 request-2.html 아래 #publish). 모집 순서는 "필요해요"인 단계만 보여 준다 (AC-F2-08). */
import type { StageType } from "../../shared/api/types";
import { ErrorNotice } from "../../shared/ui/ErrorText";
import { KitModal } from "../../shared/ui/KitModal";
import { STAGE_LABEL } from "./codes";

interface Props {
  title: string;
  formLabel: string;
  when: string;
  where: string;
  stages: StageType[];
  error: unknown;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PublishModal({ title, formLabel, when, where, stages, error, loading, onClose, onConfirm }: Props) {
  return (
    <KitModal
      title="공고 게시"
      onClose={onClose}
      busy={loading}
      foot={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={loading}>
            더 고칠게요
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirm} disabled={loading}>
            게시하기
          </button>
        </>
      }
    >
      <p className="modal__lead">이 내용으로 공고를 올릴까요?</p>
      <p>게시한 뒤 고치면 새 버전이 생기고, 업체에게 바뀐 항목이 보여요.</p>
      <table className="info-table mt-16">
        <tbody>
          <tr>
            <th>공연</th>
            <td>
              {title} · {formLabel}
            </td>
          </tr>
          <tr>
            <th>날짜 · 시간</th>
            <td className="num">{when}</td>
          </tr>
          <tr>
            <th>지역 · 관객</th>
            <td>{where}</td>
          </tr>
          <tr>
            <th>모집 순서</th>
            <td>
              <ol className="track-line">
                {stages.map((s, i) => (
                  <li key={s} className={i === 0 ? "is-now" : undefined}>
                    {i === 0 ? `${STAGE_LABEL[s]} · 지금 모집` : STAGE_LABEL[s]}
                  </li>
                ))}
              </ol>
            </td>
          </tr>
        </tbody>
      </table>
      <ErrorNotice error={error} />
    </KitModal>
  );
}
