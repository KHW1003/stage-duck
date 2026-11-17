/* 목업 전용: layout.js(공통)를 고치지 않고 GNB에 '커뮤니티' 탭을 붙인다. 확정되면 layout.js MENU에 옮긴다. */
document.querySelectorAll('.gnb__menu').forEach(function (m) {
  m.querySelectorAll('[aria-current]').forEach(function (x) { x.removeAttribute('aria-current'); });
  var a = document.createElement('a');
  a.href = 'community-list-a.html';
  a.textContent = '커뮤니티';
  a.setAttribute('aria-current', 'page');
  m.appendChild(a);
});
