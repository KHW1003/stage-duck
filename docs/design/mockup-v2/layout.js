/* 목업 공통 스크립트 (페이지 맨 아래에서 불러온다).
   React 대응:
   - banner/gnb/footer → shared/layout/AppLayout.tsx (<Gnb role/><Footer/>)
   - ICONS → shared/ui/Icon.tsx (24 격자, 선 1.5. DESIGN.md 2.4 아이콘 세트 미정이라 Lucide 모양을 따라 그림)
   - data-open / data-close → Modal·Drawer open 상태, data-pop → 드롭다운
   - 채팅 → chat-widget.js (shared/chat/ChatWidget.tsx). 로그인 화면이면 오른쪽 아래 둥근 버튼으로 뜬다
   - .mock-switch + data-when → 목업 전용 (옮기지 않는다)
   body 속성: data-layout="guest | user | partner | partner-review | admin", data-nav="메뉴 키" */
(function () {
  var SRC = document.currentScript ? document.currentScript.src : '';
  var I = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    talk: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" stroke-width="2.4"/>',
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
    tool: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 0-5-5L13 5Z"/><path d="m3 21 4-4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/>',
    truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38A1 1 0 0 0 17.52 9H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    door: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.01a1 1 0 0 1-1.24.97L5 20V5.56a2 2 0 0 1 1.51-1.94l4-1A2 2 0 0 1 13 4.56Z"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
    parking: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    seat: '<path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0Z"/><path d="M5 18v2M19 18v2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    tree: '<path d="M12 22v-6"/><path d="M5 16h14l-3.5-4.5H17L12 4l-5 7.5h1.5Z"/>',
    warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35a2 2 0 0 1 1.26-1.86l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12M6 14h12"/><path d="M6 22V10h12v12"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    elevator: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 9 3-3 3 3M9 15l3 3 3-3"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    church: '<path d="M10 9h4M12 7v5"/><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="M18 22V5.6a1 1 0 0 0-.5-.8L12 2 6.5 4.8a1 1 0 0 0-.5.8V22"/><path d="m18 7 3.6 2a1 1 0 0 1 .4.8V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.8a1 1 0 0 1 .4-.8L6 7"/>',
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
    guest: [['spaces', '공간 찾기', 'spaces.html'], ['board', 'PR 게시판', 'board.html'], ['how', '이용 방법', '../../mockup/home.html#flow']],
    user: [['my', '내 공연', 'my.html'], ['inbox', '견적함', 'inbox.html'], ['chat', '채팅', '#chat'], ['spaces', '공간 찾기', 'spaces.html'], ['board', 'PR 게시판', 'board.html']],
    partner: [['jobs', '공고 목록', 'p-jobs.html'], ['chat', '채팅', '#chat'], ['tech', '기술 확인', 'p-tech.html'], ['board', 'PR 게시판', 'board.html']],
    'partner-review': [],
    admin: [['review', '업체 심사', 'a-review.html'], ['reports', '신고·제재', 'a-reports.html'], ['posts', '게시글·공간', 'a-posts.html'], ['orders', '거래 이력', 'a-orders.html'], ['demo', '시연 도구', 'a-demo.html']]
  };

  /* 알림 (notifications 테이블 모양: type, payload, read_at) */
  window.NOTIS = {
    user: [
      ['견적·채팅', '업체 D가 <b>견적 내역 확인 카드</b>를 보냈어요', '장비 · 견적서 v2 · 1,350,000원 · 48시간 안에 컨펌', '3분 전', 1, 'chat:d'],
      ['견적·채팅', '업체 E가 <b>견적서</b>를 보냈어요', '장비 · 확인 필요 1개', '1시간 전', 1, 'inbox.html'],
      ['공고', '공연장 단계를 <b>컨펌</b>했어요', '공간 C · 500,000원', '어제', 0, 'my.html'],
      ['공고', '공고를 게시했어요', '가을밤 밴드 공연 · 공연장 업체에게 보여요', '11월 12일', 0, 'my.html']
    ],
    partner: [
      ['견적·채팅', '<b>가을밤밴드</b>님이 채팅을 시작했어요', '장비 · 견적서 v1', '5분 전', 1, 'chat:ga'],
      ['오퍼', '<b>오퍼</b>를 받았어요', '연말 합동 공연 · 응답 기한 47시간', '2시간 전', 1, 'p-jobs.html'],
      ['견적·채팅', '견적서가 <b>컨펌</b>됐어요', '재즈 트리오 공연 · 700,000원', '어제', 0, 'p-jobs.html'],
      ['공고', '사용자가 다른 업체와 진행하기로 했어요', '포크 페스티벌 · 견적서 마감', '11월 11일', 0, 'p-jobs.html']
    ]
  };
  var NOTI_ICON = { '견적·채팅': 'chat', '오퍼': 'offer', '공고': 'ticket', '결제': 'wallet' };
  window.notiHTML = function (n) {
    var to = n[5].indexOf('chat:') === 0 ? '#chat" data-chat="' + n[5].slice(5) : n[5];   /* 채팅 알림은 페이지 이동 대신 채팅 창을 연다 */
    return '<a class="noti' + (n[4] ? ' is-unread' : '') + '" href="' + to + '"><span class="noti__ico">' + icon(NOTI_ICON[n[0]] || 'bell') + '</span><span class="noti__text"><span class="noti__cat">' + n[0] + '</span>' + n[1] + '<small>' + n[2] + '</small></span><span class="noti__time">' + n[3] + '</span></a>';
  };

  var logo = partner ? '../../mockup/logo-partner.svg' : '../../mockup/logo.svg';
  var home = partner ? (layout === 'partner' ? 'p-jobs.html' : 'p-onboarding.html') : (layout === 'user' ? 'my.html' : layout === 'admin' ? 'a-review.html' : '../../mockup/home.html');
  var menu = (MENU[layout] || []).map(function (m) { return '<a href="' + m[2] + '"' + (m[2] === '#chat' ? ' data-chat=""' : '') + (m[0] === nav ? ' aria-current="page"' : '') + '>' + m[1] + '</a>'; }).join('');
  var right;
  if (layout === 'admin') {   /* 관리자: SQLAdmin 화면을 같은 모양으로 (backend/app/admin). 알림·채팅 없음 */
    right = '<span class="tag tag--tbd">테스트 환경</span><div class="gnb__pop"><button class="gnb__user" type="button" data-pop="pop-user"><span class="avatar">관</span>운영자' + icon('down', 'icon--sm') + '</button>' +
      '<div class="dropdown" id="pop-user" hidden><div class="dropdown__head"><b>운영자</b>관리자 계정 · admin@stageduck.test</div><a href="login.html">' + icon('out') + '로그아웃</a></div></div>';
  } else if (layout === 'guest') {
    right = '<a class="gnb__text" href="../../mockup/partner.html">업체신가요?</a><span class="gnb__sep"></span><a class="gnb__text" href="login.html">로그인</a><a class="btn btn--sm btn--primary" href="signup.html">가입하기</a>';
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
    '<header class="gnb"><div class="container gnb__inner"><a class="gnb__logo" href="' + home + '"><img src="' + logo + '" alt="STAGE DUCK">' + (partner ? '<span class="gnb__role">파트너</span>' : layout === 'admin' ? '<span class="gnb__role gnb__role--admin">관리자</span>' : '') + '</a>' +
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
    if (e.target.closest('[data-close]')) { var ly = e.target.closest('.layer'); if (ly) ly.hidden = true; return; }
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

  /* 채팅 위젯 (같은 폴더의 chat-widget.js) */
  if (SRC) { var cw = document.createElement('script'); cw.src = SRC.replace(/layout\.js(\?.*)?$/, 'chat-widget.js'); body.appendChild(cw); }
})();
