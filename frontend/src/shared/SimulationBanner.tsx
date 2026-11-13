/** 모든 화면에 시뮬레이션임을 표시한다 (constitution 8, NFR-UX-05). */
export function SimulationBanner() {
  return (
    <div
      role="note"
      style={{ background: "#fff4e5", color: "#7a4b00", padding: "6px 16px", fontSize: 13, textAlign: "center" }}
    >
      포트폴리오 시뮬레이션 — 실제 거래가 아닙니다. 업체·가격은 모두 가상이며 결제는 테스트로만 동작해요.
    </div>
  );
}
