import { useState } from "react";
import { Link } from "react-router-dom";
import { useSupplierCancel, useSupplierReservations, type SupplierReservation } from "../features/payment/api";
import { dateLabel, hm, STAGE_NAME } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { useMe } from "../shared/auth/useMe";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
import { KitModal } from "../shared/ui/KitModal";
import { MoneyText } from "../shared/ui/MoneyText";
import "./supplier-reservations.css";

const STATUS: Record<SupplierReservation["status"], string> = {
  ASSIGNING: "공연팀 섭외 진행 중",
  AWAITING_PAYMENT: "결제 대기",
  PAID: "결제 완료",
  COMPLETED: "공연 완료",
  NEEDS_REVIEW: "일정 재확인 필요",
  CANCELLED: "예약 취소",
};

const CANCELABLE: SupplierReservation["status"][] = ["ASSIGNING", "AWAITING_PAYMENT", "PAID"];

/** 업체 사정 취소 확인 창. 결제 전·후에 따라 결과 안내가 다르다 (D-57, AC-F5-10). 경고 1회는 둘 다 */
function SupplierCancelModal({ reservation, onClose }: { reservation: SupplierReservation; onClose: () => void }) {
  const cancel = useSupplierCancel();
  const [reason, setReason] = useState("");
  const paid = reservation.status === "PAID";
  return (
    <KitModal
      title="업체 사정으로 취소"
      busy={cancel.isPending}
      onClose={onClose}
      foot={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={cancel.isPending}>돌아가기</button>
          <button className="btn btn--primary" type="button" disabled={!reason.trim() || cancel.isPending}
            onClick={() => cancel.mutate({ performanceId: reservation.performanceId, reason: reason.trim() }, { onSuccess: onClose })}>
            취소하기
          </button>
        </>
      }
    >
      <p className="modal__lead">{reservation.title} 예약을 취소할까요?</p>
      <ul className="bullets mt-8">
        {paid ? (
          <li>공연팀에게 플랫폼 이용료까지 전액 환불돼요.</li>
        ) : (
          <>
            <li>맡은 단계만 다시 모집하고, 공연팀의 결제 마감이 48시간 늘어나요.</li>
            <li>다른 업체의 예약은 그대로예요.</li>
          </>
        )}
        <li>업체 사정 취소는 경고 1회로 기록돼요. 경고가 3회 쌓이면 이용이 정지돼요.</li>
      </ul>
      <label className="field mt-16">
        <span className="field__label">취소 사유<span className="req">*</span></span>
        <textarea className="textarea" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {cancel.isError && <div className="mt-16"><ErrorNotice error={cancel.error} /></div>}
    </KitModal>
  );
}

function ReservationCard({ reservation }: { reservation: SupplierReservation }) {
  const { performanceId, title, showDate, showStart, showEnd, sido, sigungu, stageTypes, amount, status } = reservation;
  const [asking, setAsking] = useState(false);
  return (
    <li className="supplier-reservation">
      <div className="supplier-reservation__identity">
        <div className="supplier-reservation__heading">
          <h2>{title}</h2>
          <span className={"tag tag--soft" + (status === "PAID" ? " tag--point" : "")}>{STATUS[status]}</span>
        </div>
        <p>{dateLabel(showDate)} {hm(showStart)}~{hm(showEnd)} · {sido} {sigungu}</p>
      </div>
      <dl className="supplier-reservation__details">
        <div><dt>담당</dt><dd>{stageTypes.map((type) => STAGE_NAME[type]).join(" · ")}</dd></div>
        <div><dt>견적 금액</dt><dd><MoneyText value={amount} strong /></dd></div>
      </dl>
      {status !== "CANCELLED" && (
        <div className="btns supplier-reservation__actions">
          {status !== "COMPLETED" && (
            <Link className="btn btn--sm" to={"/supplier/tech/" + performanceId}>현장 준비 확인</Link>
          )}
          <Link className="btn btn--sm btn--primary" to={"/performances/" + performanceId + "/sheet"}>담당표 보기</Link>
          {CANCELABLE.includes(status) && (
            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setAsking(true)}>업체 사정 취소</button>
          )}
        </div>
      )}
      {asking && <SupplierCancelModal reservation={reservation} onClose={() => setAsking(false)} />}
    </li>
  );
}

export function SupplierReservationsPage() {
  usePageMeta("내 예약");
  const userId = useMe().data?.id;
  const reservations = useSupplierReservations(userId);
  return (
    <>
      <KitPageTop title="내 예약" desc="맡은 공연의 일정과 담당 업무를 확인해요." />
      <main className="container main">
        {reservations.isError ? (
          <ErrorNotice error={reservations.error} />
        ) : !reservations.data ? (
          <p className="muted" role="status">예약을 불러오는 중이에요.</p>
        ) : reservations.data.length === 0 ? (
          <div className="empty">
            <b>아직 맡은 공연이 없어요.</b>
            <p>공연팀이 우리 업체의 견적을 확정하면 여기에 표시돼요.</p>
            <Link className="btn btn--sm" to="/supplier/postings">공고 목록 보기</Link>
          </div>
        ) : (
          <ul className="supplier-reservations" aria-label="맡은 공연">
            {reservations.data.map((reservation) => (
              <ReservationCard key={reservation.performanceId} reservation={reservation} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
