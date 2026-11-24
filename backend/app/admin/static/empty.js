// 목록이 비었을 때 머리줄만 남지 않게 안내 한 줄을 넣고 "전체 0건 중 1–0" 페이지 바를 숨긴다 (11/24 디자인 검수)
(function () {
  var MSG = {
    report: "처리할 신고가 없어요.", sanction: "제재 이력이 없어요.", supplier: "심사할 업체가 없어요.",
    inquiry: "들어온 문의가 없어요.", notice: "등록된 공지가 없어요."
  };
  document.addEventListener("DOMContentLoaded", function () {
    var m = location.pathname.match(/\/admin\/([^/]+)\/list/);
    if (!m) return;
    var table = document.querySelector(".card table");
    var body = table && table.querySelector("tbody");
    if (!body || body.querySelector("tr")) return;
    var searching = new URLSearchParams(location.search).get("search");
    var cols = table.querySelectorAll("thead th").length || 1;
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = cols;
    td.className = "sd-empty";
    td.textContent = searching ? "검색 결과가 없어요." : (MSG[m[1]] || "아직 항목이 없어요.");
    tr.appendChild(td);
    body.appendChild(tr);
    var footer = table.closest(".card").querySelector(".card-footer");
    if (footer) footer.style.setProperty("display", "none", "important"); // d-flex 가 !important 라 같이 준다
  });
})();
