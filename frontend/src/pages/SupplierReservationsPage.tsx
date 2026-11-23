import { Link } from "react-router-dom";
import { useSupplierReservations, type SupplierReservation } from "../features/payment/api";
import { dateLabel, hm, STAGE_NAME } from "../features/performance/labels";
import { usePageMeta } from "../features/seo/usePageMeta";
import { useMe } from "../shared/auth/useMe";
import { KitPageTop } from "../shared/layout/KitPageTop";
import { ErrorNotice } from "../shared/ui/ErrorText";
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

function ReservationCard({ reservation }: { reservation: SupplierReservation }) {
  const { performanceId, title, showDate, showStart, showEnd, sido, sigungu, stageTypes, amount, status } = reservation;
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
        </div>
      )}
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
