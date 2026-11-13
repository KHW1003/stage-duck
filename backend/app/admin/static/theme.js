// 관리자 화면 다크/라이트 전환. 기본은 다크, 고른 값은 이 브라우저에만 기억한다.
(function () {
  var KEY = "sd-admin-theme";
  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(theme) {
    document.documentElement.setAttribute("data-bs-theme", theme);
  }
  apply(saved() === "light" ? "light" : "dark");

  document.addEventListener("DOMContentLoaded", function () {
    var logout = document.querySelector(".navbar-vertical a[href$='/logout']");
    if (!logout) return; // 로그인 화면에는 버튼을 두지 않는다
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn sd-theme-toggle";
    function label() {
      var dark = document.documentElement.getAttribute("data-bs-theme") === "dark";
      btn.textContent = dark ? "☀ 라이트 모드" : "☾ 다크 모드";
      btn.setAttribute("aria-label", dark ? "라이트 모드로 바꾸기" : "다크 모드로 바꾸기");
    }
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* 저장 못 해도 화면은 바뀐다 */ }
      label();
    });
    label();
    logout.insertAdjacentElement("afterend", btn);
  });
})();
