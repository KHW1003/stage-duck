/* 목업 공통 스크립트 (페이지 맨 아래에서 불러온다).
   React 대응:
   - banner/gnb/footer → shared/layout/AppLayout.tsx (<SimulationBanner/><Gnb role/><Footer/>)
   - ICONS → shared/ui/Icon.tsx (24 격자, 선 1.5. DESIGN.md 2.4 아이콘 세트 미정이라 Lucide 모양을 따라 그림)
   - data-open / data-close → Modal·Drawer open 상태, data-pop → 드롭다운
   - .mock-switch + data-when → 목업 전용 (옮기지 않는다)
   body 속성: data-layout="guest | user | partner | partner-review", data-nav="메뉴 키" */
(function () {
  var I = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a7 7 0 0 0-4-6.3"/>',
    right: '<path d="m9 6 6 6-6 6"/>', left: '<path d="m15 6-6 6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pass: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    conflict: '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', plus: '<path d="M12 5v14"/><path d="M5 12h14"/>', min: '<path d="M5 12h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    clip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    venue: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
    speaker: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M12 6h.01"/>',
    engineer: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z"/><path d="M3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2Z"/>',
    receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    up: '<path d="m18 15-6-6-6 6"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    offer: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    skip: '<path d="m5 4 10 8-10 8Z"/><path d="M19 5v14"/>',
    expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    print: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>'
  };
  window.icon = function (n, c) { return '<svg class="icon' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };

  var body = document.body, q = new URLSearchParams(location.search);
  var layout = body.dataset.layout || 'guest';
  if (q.get('as') === 'partner') { layout = 'partner'; body.dataset.layout = 'partner'; }
  var partner = layout.indexOf('partner') === 0;
  if (partner && !document.querySelector('link[href*="theme-partner"]')) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../css/theme-partner.css'; document.head.appendChild(l);
  }
  var nav = body.dataset.nav || '';

  var MENU = {
    guest: [['spaces', '공간 찾기', 'spaces.html'], ['board', 'PR 게시판', 'board.html'], ['how', '이용 방법', '../../home.html#flow']],
    user: [['my', '내 공연', 'my.html'], ['inbox', '견적함', 'inbox.html'], ['chat', '채팅', 'chat.html'], ['spaces', '공간 찾기', 'spaces.html'], ['board', 'PR 게시판', 'board.html']],
    partner: [['jobs', '공고 목록', 'p-jobs.html'], ['chat', '채팅', 'p-chat.html'], ['tech', '기술 확인', 'p-tech.html'], ['board', 'PR 게시판', 'board.html']],
    'partner-review': []
  };

  /* 알림 (notifications 테이블 모양: type, payload, read_at) */
  window.NOTIS = {
    user: [
      ['견적·채팅', '업체 D가 <b>견적 내역 확인 카드</b>를 보냈어요', '장비 · 견적서 v2 · 1,350,000원 · 48시간 안에 컨펌', '3분 전', 1, 'chat.html'],
      ['견적·채팅', '업체 E가 <b>견적서</b>를 보냈어요', '장비 · 확인 필요 1개', '1시간 전', 1, 'inbox.html'],
      ['공고', '공연장 단계를 <b>컨펌</b>했어요', '공간 C · 500,000원', '어제', 0, 'my.html'],
      ['공고', '공고를 게시했어요', '가을밤 밴드 공연 · 공연장 업체에게 보여요', '11월 12일', 0, 'my.html']
    ],
    partner: [
      ['견적·채팅', '<b>가을밤밴드</b>님이 채팅을 시작했어요', '장비 · 견적서 v1', '5분 전', 1, 'p-chat.html'],
      ['오퍼', '<b>오퍼</b>를 받았어요', '연말 합동 공연 · 응답 기한 47시간', '2시간 전', 1, 'p-jobs.html'],
      ['견적·채팅', '견적서가 <b>컨펌</b>됐어요', '재즈 트리오 공연 · 700,000원', '어제', 0, 'p-jobs.html'],
      ['공고', '사용자가 다른 업체와 진행하기로 했어요', '포크 페스티벌 · 견적서 마감', '11월 11일', 0, 'p-jobs.html']
    ]
  };
  window.notiHTML = function (n) {
    return '<a class="noti' + (n[4] ? ' is-unread' : '') + '" href="' + n[5] + '"><span></span><span class="noti__text"><span class="noti__cat">' + n[0] + '</span>' + n[1] + '<small>' + n[2] + '</small></span><span class="noti__time">' + n[3] + '</span></a>';
  };

  var logo = partner ? '../../logo-partner.svg' : '../../logo.svg';
  var home = partner ? (layout === 'partner' ? 'p-jobs.html' : 'p-onboarding.html') : (layout === 'user' ? 'my.html' : '../../home.html');
  var menu = (MENU[layout] || []).map(function (m) { return '<a href="' + m[2] + '"' + (m[0] === nav ? ' aria-current="page"' : '') + '>' + m[1] + '</a>'; }).join('');
  var right;
  if (layout === 'guest') {
    right = '<a class="gnb__text" href="../../partner.html">업체신가요?</a><span class="gnb__sep"></span><a class="gnb__text" href="login.html">로그인</a><a class="btn btn--sm btn--primary" href="signup.html">가입하기</a>';
  } else {
    var who = partner ? ['D', '업체 D', '업체 계정 · ' + (layout === 'partner-review' ? '심사 중' : '승인')] : ['가', '가을밤밴드', '사용자 계정'];
    var links = partner
      ? (layout === 'partner-review' ? '' : '<a href="supplier.html">' + icon('venue') + '업체 프로필</a><a href="p-post.html">' + icon('edit') + '내 PR 게시글</a><a href="sheet.html?as=partner">' + icon('receipt') + '최종 담당표</a>')
      : '<a href="mypage.html">' + icon('user') + '마이페이지</a><a href="favorites.html">' + icon('heart') + '관심 업체</a><a href="sheet.html">' + icon('receipt') + '최종 담당표</a>';
    right = (layout === 'partner-review' ? '' :
      '<div class="gnb__pop"><button class="icon-btn" type="button" aria-label="알림 2개" data-pop="pop-noti">' + icon('bell') + '<span class="icon-btn__badge">2</span></button>' +
      '<div class="noti-panel" id="pop-noti" hidden><div class="noti-panel__head"><b>알림</b><button class="link" type="button">모두 읽음</button></div><div class="noti-panel__list">' +
      NOTIS[partner ? 'partner' : 'user'].map(notiHTML).join('') + '</div><div class="noti-panel__foot"><a href="notifications.html' + (partner ? '?as=partner' : '') + '">알림 전체 보기</a></div></div></div>') +
      '<div class="gnb__pop"><button class="gnb__user" type="button" data-pop="pop-user"><span class="avatar">' + who[0] + '</span>' + who[1] + icon('down', 'icon--sm') + '</button>' +
      '<div class="dropdown" id="pop-user" hidden><div class="dropdown__head"><b>' + who[1] + '</b>' + who[2] + '</div>' + links + '<hr><a href="notifications.html' + (partner ? '?as=partner' : '') + '">' + icon('bell') + '알림</a><a href="login.html">' + icon('out') + '로그아웃</a></div></div>';
  }

  var sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">' + Object.keys(I).map(function (k) { return '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + I[k] + '</symbol>'; }).join('') + '</svg>';
  body.insertAdjacentHTML('afterbegin', sprite +
    '<div class="sim-banner" role="note">' + icon('info') + '포트폴리오 시뮬레이션 — 실제 거래가 아닙니다</div>' +
    '<header class="gnb"><div class="container gnb__inner"><a class="gnb__logo" href="' + home + '"><img src="' + logo + '" alt="STAGE DUCK">' + (partner ? '<span class="gnb__role">파트너</span>' : '') + '</a>' +
    '<nav class="gnb__menu" aria-label="주 메뉴">' + menu + '</nav><div class="gnb__right">' + right + '</div></div></header>');
  body.insertAdjacentHTML('beforeend', '<footer class="footer"><div class="container"><div class="footer__top"><img src="' + logo + '" alt="STAGE DUCK">' +
    '<nav class="footer__links" aria-label="바닥글"><a href="#">이용약관</a><a href="#"><b>개인정보처리방침</b></a><a href="#">업체 이용약관</a><a href="#">공지사항</a><a href="#">1:1 문의</a></nav></div>' +
    '<p class="footer__biz">사업자 정보 <span class="tag tag--tbd">내용 미정</span><br>STAGE DUCK은 통신판매중개자로서 거래 당사자가 아니에요. © 2026 STAGE DUCK</p></div></footer>');

  /* pages/ 밖에서 쓸 때 (components.html): body data-base="pages/" 로 링크·로고 경로를 맞춘다 */
  var B = body.dataset.base;
  if (B) document.querySelectorAll('.gnb a[href], .gnb img, .footer img, .footer a[href]').forEach(function (el) {
    var k = el.tagName === 'IMG' ? 'src' : 'href', v = el.getAttribute(k);
    if (v && !/^(https?:|#)/.test(v)) el.setAttribute(k, B + v);
  });

  document.querySelectorAll('[data-icon]').forEach(function (el) { el.outerHTML = icon(el.dataset.icon, el.className); });

  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-pop]');
    document.querySelectorAll('.dropdown, .noti-panel').forEach(function (m) { if ((!p || m.id !== p.dataset.pop) && !m.contains(e.target)) m.hidden = true; });
    if (p) { var m = document.getElementById(p.dataset.pop); if (m) m.hidden = !m.hidden; return; }
    var o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); var el = document.getElementById(o.dataset.open); if (el) el.hidden = false; return; }
    if (e.target.closest('[data-close]')) { var ly = e.target.closest('.layer, .chat-float'); if (ly) ly.hidden = true; return; }
    if (e.target.classList.contains('layer') && !e.target.closest('.frame')) e.target.hidden = true;
    var t = e.target.closest('.toggle button');
    if (t) { t.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === t); }); var need = t.closest('[data-need]'); if (need) need.querySelector('.need-body').hidden = t.dataset.value === 'off'; return; }
    var f = e.target.closest('.filters button');
    if (f) f.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === f); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.layer').forEach(function (l) { if (!l.closest('.frame')) l.hidden = true; }); });

  /* 탭: [data-tabs] 안 [role=tab] aria-controls ↔ 패널 */
  document.querySelectorAll('[data-tabs]').forEach(function (tabs) {
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[role="tab"]'); if (!b || b.getAttribute('aria-disabled') === 'true') return;
      tabs.querySelectorAll('[role="tab"]').forEach(function (x) { var on = x === b; x.setAttribute('aria-selected', on); var pn = document.getElementById(x.getAttribute('aria-controls')); if (pn) pn.hidden = !on; });
    });
  });

  /* 사진 넘기기 */
  document.querySelectorAll('.gallery').forEach(function (g) {
    var main = g.querySelector('.gallery__main'), c = g.querySelector('.gallery__count b');
    g.querySelectorAll('.gallery__thumbs button').forEach(function (b, i) {
      b.addEventListener('click', function () { main.style.setProperty('--img', b.style.getPropertyValue('--img')); g.querySelectorAll('.gallery__thumbs button').forEach(function (x) { x.setAttribute('aria-current', x === b); }); if (c) c.textContent = i + 1; });
    });
  });

  document.querySelectorAll('.room__msgs').forEach(function (m) { m.scrollTop = m.scrollHeight; });

  /* 목업 전용: <div class="mock-switch" data-group="g"><button data-value="a"> ↔ [data-when~="g:a"] (주소 ?g=a 로도 고른다) */
  document.querySelectorAll('.mock-switch[data-group]').forEach(function (sw) {
    var g = sw.dataset.group;
    function apply(v) {
      sw.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.value === v); });
      document.querySelectorAll('[data-when]').forEach(function (el) {
        var ts = el.dataset.when.split(' ').filter(function (t) { return t.indexOf(g + ':') === 0; });
        if (ts.length) el.hidden = ts.indexOf(g + ':' + v) < 0;
      });
    }
    sw.addEventListener('click', function (e) { var b = e.target.closest('button[data-value]'); if (b) apply(b.dataset.value); });
    apply(q.get(g) || (sw.querySelector('[aria-pressed="true"]') || sw.querySelector('[data-value]')).dataset.value);
  });
})();
