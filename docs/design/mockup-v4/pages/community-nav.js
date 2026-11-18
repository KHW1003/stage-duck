/* 목업 전용: GNB의 '커뮤니티' 탭을 현재 화면으로 표시한다. layout.js MENU에 커뮤니티가 들어간 뒤로는 표시만 바꾼다 (없으면 붙인다). */
document.querySelectorAll('.gnb__menu').forEach(function (m) {
  m.querySelectorAll('[aria-current]').forEach(function (x) { x.removeAttribute('aria-current'); });
  var a = m.querySelector('a[href="community.html"]');
  if (!a) { a = document.createElement('a'); a.href = 'community.html'; a.textContent = '커뮤니티'; m.appendChild(a); }
  a.setAttribute('aria-current', 'page');
});
