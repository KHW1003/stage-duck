/* 채팅 위젯 (layout.js가 불러온다). 로그인한 모든 화면 오른쪽 아래 둥근 버튼 → 화면 위층에 채팅 창. 페이지 이동 없음.
   React: shared/chat/ChatWidget.tsx
   - ChatFab: 안 읽은 수 배지, 열림/닫힘
   - ChatPanel view="list": 머리줄 + 탭(사용자: 단계 / 업체: 상태) + ChatList
   - ChatPanel view="room": 머리줄([뒤로] + 상대) + 탭(대화 | 견적 정보) + Room 또는 RoomInfo
   - 다른 화면에서 열기: useChat().open(roomId) — 알림·견적함·내 공연의 [채팅] 버튼이 부른다 (목업: data-chat="방 id")
   - 열린 상태(창, 방, 탭)는 화면을 옮겨도 이어진다 (목업: sessionStorage)
   - 새 메시지·읽음은 WebSocket으로 새로고침 없이 바뀐다 (AC-F3-08)
   - 비로그인(guest)·심사 중 업체(partner-review)에는 버튼이 없다
   목업 전용 주소: ?chat=list | 방 id (d, e, c, a / ga, bom, ha), &pane=info, ?card=pending | opened | done (업체 D 확인 카드) */
(function () {
  var body = document.body, layout = body.dataset.layout || 'guest';
  var role = layout === 'user' ? 'user' : layout === 'partner' ? 'partner' : null;
  var B = body.dataset.base || '';
  var q = new URLSearchParams(location.search);
  var I = window.icon;

  /* ── 대화 조각 ── */
  var PH = '../../mockup/assets/photos/photo-';   /* 사진 주소는 css/ 기준 (README 참고) */
  function day(t) { return '<span class="room__day">' + t + '</span>'; }
  function sys(t) { return '<span class="room__sys">' + t + '</span>'; }
  function them(t, at) { return '<div class="msg"><p class="msg__b">' + t + '</p><span class="msg__t">' + at + '</span></div>'; }
  function me(t, at, read) { return '<div class="msg msg--me"><p class="msg__b">' + t + '</p><span class="msg__t">' + (read ? '<span class="msg__read">읽음</span>' : '') + at + '</span></div>'; }
  function pass(t) { return '<span class="status status--pass">' + I('pass') + (t || '통과') + '</span>'; }
  function warnS(t) { return '<span class="status status--warn">' + I('warn') + t + '</span>'; }
  function card(head, side, inner, extra, cls) {
    return '<div class="c-card' + (cls ? ' ' + cls : '') + '"><div class="c-card__head"><span>' + head + '</span>' + (side || '') + '</div><div class="c-card__body">' + inner + '</div>' + (extra || '') + '</div>';
  }
  function tot(n) { return '<p class="c-card__total">' + n + '<small>원</small></p>'; }
  function meta(t) { return '<p class="c-card__meta">' + t + '</p>'; }
  function diff(t) { return '<p class="c-card__diff">' + t + '</p>'; }
  var WARN = '<div class="room__warn" role="note">' + I('warn', 'icon--sm') + '<span>플랫폼 밖에서 거래하면 노쇼·사기 때 환불 보호를 받을 수 없어요. 연락처는 결제 후 최종 담당표에서 공개돼요.</span></div>';
  var CLOSED = '마감된 채팅방이에요. 기록은 공연 뒤 1년까지 볼 수 있어요.';
  function sec(title, html) { return '<div class="chat-side__sec"><p class="chat-side__title">' + title + '</p>' + html + '</div>'; }
  function total(n) { return '<p class="sum-total" style="justify-content:flex-start"><b>' + n + '<small>원</small></b></p>'; }
  function rows(list) { return '<dl class="sum-rows">' + list.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>'; }

  /* 업체 D 확인 카드 상태 (confirm_requests: PENDING → 내역서 열람 → CONFIRMED) */
  var cardState = q.get('card') || 'pending';
  var timer = function (t) { return '<span class="timer" style="color:#fff">' + I('clock', 'icon--sm') + t + ' 남음</span>'; };
  var D_CARD = {
    pending: card('견적 내역 확인', timer('47:12'), meta('업체 D · 장비 · 견적서 v2 고정') + tot('1,350,000') + '<p class="mt-4">' + pass('자동 검사 통과') + '</p>', '<div class="c-card__foot"><button type="button">다시 조율</button><a href="' + B + 'quote.html">내역서 보기</a><button type="button" disabled>컨펌</button></div><p class="c-card__why">내역서를 끝까지 보면 컨펌할 수 있어요.</p>', 'c-card--confirm'),
    opened: card('견적 내역 확인', timer('46:58'), meta('업체 D · 장비 · 견적서 v2 고정 · 내역서 확인함') + tot('1,350,000'), '<div class="c-card__foot"><button type="button">다시 조율</button><a href="' + B + 'quote.html">내역서 보기</a><button class="is-primary" type="button" data-open="cw-confirm">컨펌</button></div>', 'c-card--confirm'),
    done: me('내역서 확인했어요. 이대로 진행할게요.', '15:01', 1) + card('컨펌 완료', '<span class="muted">15:02</span>', meta('업체 D · 장비 · 견적서 v2') + tot('1,350,000'), '<div class="c-card__foot"><a class="is-primary" href="' + B + 'next.html">다음 단계로</a></div>', 'c-card--done')
  };
  if (!D_CARD[cardState]) cardState = 'pending';

  /* ── 방 (chat_rooms 1개 = 견적서 1장) ── */
  var ROOMS = {
    user: {
      filterBy: 'stage', tabs: [['all', '전체'], ['공연장', '공연장'], ['장비', '장비'], ['엔지니어', '엔지니어']],
      ctx: '가을밤 밴드 공연 · 11월 28일(토)',
      note: '견적함에서 견적서를 보고 <b>[채팅 시작]</b>을 누르면 그 업체와 대화가 여기에 생겨요. <a href="' + B + 'inbox.html">견적함</a>',
      list: ['d', 'e', 'c', 'a'],
      d: { letter: 'D', name: '업체 D', photo: '1545454675-3531b543be5d', stage: '장비', on: 1, unread: 1, time: '13:24',
        last: '견적 내역 확인 카드를 보냈어요', sub: '견적서 v2 · 1,350,000원 · ' + (cardState === 'done' ? '컨펌' : '조율 중'), doc: 'quote.html',
        msgs: function () {
          return day('11월 13일 (금)') +
            card('견적서 v1', '<span class="tag">이전 버전</span>', tot('1,250,000') + meta('추가 마이크 2 · 밴드 음향 · 설치·철수 · 엔지니어 포함 · 설치 90분'), '', 'c-card--off') +
            sys('가을밤밴드님이 채팅을 시작했어요') +
            them('안녕하세요, 업체 D예요. 공간 C 입실이 15:00이라 그때부터 설치하면 16:30에 끝나요.', '13:10') +
            me('리허설을 16:00으로 당길 수도 있어요. 설치를 더 빨리 끝낼 수 있을까요?', '13:12', 1) +
            them('설치 인원을 한 명 더 붙이면 15:45에 끝나요. 견적서를 고쳐서 다시 보낼게요.', '13:15') +
            '<div class="msg"><span class="msg__photo" role="img" aria-label="업체 D가 보낸 무대 설치 예시 사진" style="--img:url(\'' + PH + '1516450360452-9312f5e86fc7.jpg\')"></span><span class="msg__t">13:16</span></div>' +
            '<div class="msg"><div class="msg__file">' + I('file') + '<div>무대 배치도.pdf<small>412KB</small></div></div><span class="msg__t">13:16</span></div>' +
            card('견적서 v2', pass(), tot('1,350,000') + diff('v1 → v2 · 설치 인원 +1 · 설치 완료 16:30 → 15:45 · +100,000원'), '<div class="c-card__foot"><a href="' + B + 'quote.html">자세히 보기</a></div>') +
            them('급하면 010-0000-0000으로 연락 주셔도 돼요.', '13:20') + WARN + D_CARD[cardState];
        },
        info: function () {
          return sec('이 단계', '<p class="strong">장비 · ' + (cardState === 'done' ? '컨펌' : '조율 중') + '</p><p class="small muted">가을밤 밴드 공연 · 11월 28일(토)</p>') +
            sec('지금 견적서 (v2)', total('1,350,000') + '<p class="small muted">추가 마이크 2 · 밴드 음향 · 설치·철수 · 엔지니어 포함</p><a class="link link--point mt-4" href="' + B + 'quote.html">내역서 보기' + I('right', 'icon--sm') + '</a>') +
            sec('자동 검사', rows([['설치 완료', pass('15:45')], ['공간 반입', pass()], ['엔지니어', warnS('포함')]])) +
            sec('앞 단계', '<p class="desc">공간 C · 입실 15:00 · 기본 마이크 2 · 전원 4구</p>') +
            '<div class="chat-panel__actions"><a class="btn btn--block" href="' + B + 'compare.html">단계별 비교 보기</a></div>';
        } },
      e: { letter: 'E', name: '업체 E', photo: '1511671782779-c97d3d27a1d4', stage: '장비', on: 1, time: '11:40',
        last: '무선 마이크는 확인 후 알려 드릴게요', sub: '견적서 v1 · 980,000원 · 확인 필요 1개', doc: 'quote.html',
        msgs: function () {
          return day('11월 13일 (금)') + card('견적서 v1', warnS('확인 필요 1개'), tot('980,000') + meta('기본형 · 무선 마이크 수량 확인 필요'), '<div class="c-card__foot"><a href="' + B + 'quote.html">자세히 보기</a></div>') +
            sys('가을밤밴드님이 채팅을 시작했어요') +
            me('무선 마이크를 2개 더 쓸 수 있을까요? 보컬이 두 명이에요.', '11:32', 1) +
            them('무선 마이크는 확인 후 알려 드릴게요', '11:40');
        },
        info: function () {
          return sec('이 단계', '<p class="strong">장비 · 채팅 중</p><p class="small muted">가을밤 밴드 공연 · 11월 28일(토)</p>') +
            sec('지금 견적서 (v1)', total('980,000') + '<p class="small muted">기본형</p>') +
            sec('자동 검사', rows([['무선 마이크', warnS('확인 필요')], ['공간 반입', pass()]])) +
            '<div class="chat-panel__actions"><a class="btn btn--block" href="' + B + 'compare.html">단계별 비교 보기</a></div>';
        } },
      c: { letter: 'C', name: '업체 C', photo: '1514320291840-2e0a9bf2a9ae', stage: '공연장', on: 1, time: '어제',
        last: '컨펌 완료', sub: '견적서 v1 · 500,000원 · 컨펌', doc: 'quote.html',
        msgs: function () {
          return day('11월 12일 (목)') + card('견적서 v1', pass(), tot('500,000') + meta('공간 C 대관 · 15:00 입실 · 22:00 퇴실')) +
            sys('가을밤밴드님이 채팅을 시작했어요') +
            them('공간 C는 15:00부터 들어오실 수 있어요. 외부 장비 반입도 돼요.', '10:05') +
            me('좋아요. 이대로 진행할게요.', '10:20', 1) +
            card('컨펌 완료', '<span class="muted">10:22</span>', meta('업체 C · 공연장 · 견적서 v1') + tot('500,000'), '', 'c-card--done');
        },
        info: function () {
          return sec('이 단계', '<p class="strong">공연장 · 컨펌</p><p class="small muted">가을밤 밴드 공연 · 11월 28일(토)</p>') +
            sec('컨펌한 견적서 (v1)', total('500,000') + '<p class="small muted">공간 C 대관 · 15:00 입실 · 22:00 퇴실</p>') +
            '<div class="chat-panel__actions"><a class="btn btn--block" href="' + B + 'my.html">내 공연에서 보기</a></div>';
        } },
      a: { letter: 'A', name: '업체 A', photo: '1501612780327-45045538702b', stage: '공연장', closed: 1, time: '어제',
        last: '다른 업체와 진행하기로 했어요', sub: '견적서 v1 · 4,000,000원 · 마감', locked: CLOSED,
        msgs: function () {
          return day('11월 12일 (목)') + card('견적서 v1', '<span class="tag">마감</span>', tot('4,000,000') + meta('공간 A 대관 · 풀스펙 · 13:00 입실'), '', 'c-card--off') +
            sys('공연장을 업체 C로 정해서 이 견적서는 마감됐어요.');
        },
        info: function () {
          return sec('이 단계', '<p class="strong">공연장 · 마감</p><p class="small muted">다른 업체와 진행하기로 했어요</p>') + sec('견적서 (v1)', total('4,000,000') + '<p class="small muted">공간 A 대관 · 풀스펙</p>');
        } }
    },
    partner: {
      filterBy: 'st', tabs: [['all', '전체'], ['on', '진행 중'], ['wait', '시작 전'], ['closed', '마감']],
      note: '사용자가 견적서를 보고 <b>[채팅 시작]</b>을 누르면 메시지를 보낼 수 있어요.',
      list: ['ga', 'bom', 'ha'],
      ga: { letter: '가', name: '가을밤밴드', stage: '장비', st: 'on', on: 1, unread: 1, time: '13:24',
        last: '내역서 확인했어요. 이대로 진행할게요.', sub: '가을밤 밴드 공연 · 11월 28일(토) · 이용 0 · 반려 0', doc: 'p-quote.html',
        msgs: function () {
          return day('11월 13일 (금)') + sys('가을밤밴드님이 채팅을 시작했어요') +
            me('안녕하세요, 업체 D예요. 공간 C 입실이 15:00이라 그때부터 설치하면 16:30에 끝나요.', '13:10', 1) +
            them('리허설을 16:00으로 당길 수도 있어요. 설치를 더 빨리 끝낼 수 있을까요?', '13:12') +
            me('설치 인원을 한 명 더 붙이면 15:45에 끝나요. 견적서를 고쳐서 다시 보낼게요.', '13:15', 1) +
            card('견적서 v2 · 보냄', pass(), tot('1,350,000') + diff('v1 → v2 · 설치 인원 +1 · +100,000원')) +
            card('견적 내역 확인 · 보냄', timer('47:12'), meta('견적서 v2 고정 · 사용자가 내역서를 열었어요') + tot('1,350,000'), '<p class="c-card__why">사용자가 컨펌하면 알림이 와요. 견적서를 고치면 이 카드는 무효가 돼요.</p>', 'c-card--confirm') +
            them('내역서 확인했어요. 이대로 진행할게요.', '13:24');
        },
        info: function () {
          return sec('이 공고', '<p class="strong">가을밤 밴드 공연</p><p class="small muted">11월 28일(토) · 리허설 17:00 · 관객 80명</p><a class="link link--point mt-4" href="' + B + 'p-job.html">공고 상세' + I('right', 'icon--sm') + '</a>') +
            sec('앞 단계', '<p class="desc">공간 C · 입실 15:00 · 외부 장비 반입 가능</p>') +
            sec('내 견적서', total('1,350,000') + '<p class="small muted">기본형 · v2</p>') +
            '<div class="chat-panel__actions"><a class="btn btn--block" href="' + B + 'p-quote.html">' + I('edit', 'icon--sm') + '견적서 고치기</a><button class="btn btn--primary btn--block" type="button" disabled>견적 내역 확인 보내기</button><p class="field__hint">대기 중인 카드가 있어요. 만료되거나 사용자가 다시 조율을 누르면 새로 보낼 수 있어요.</p></div>';
        } },
      bom: { letter: '봄', name: '봄날', stage: '장비', st: 'wait', on: 1, time: '어제',
        last: '견적서를 보냈어요 · 채팅 시작 전', sub: '겨울 어쿠스틱 공연 · 채팅 시작 전', doc: 'p-quote.html', locked: '사용자가 채팅을 시작하면 메시지를 보낼 수 있어요.',
        msgs: function () { return day('11월 12일 (목)') + card('견적서 v1 · 보냄', pass(), tot('900,000') + meta('겨울 어쿠스틱 공연 · 장비 단계')); },
        info: function () { return sec('이 공고', '<p class="strong">겨울 어쿠스틱 공연</p><p class="small muted">장비 단계</p>') + sec('내 견적서', total('900,000') + '<p class="small muted">v1 · 채팅 시작 전에는 고칠 수 있어요</p>'); } },
      ha: { letter: '하', name: '하모니', stage: '장비', st: 'closed', closed: 1, time: '11월 11일',
        last: '다른 업체와 진행하기로 했어요', sub: '포크 페스티벌 · 마감', locked: CLOSED,
        msgs: function () { return day('11월 11일 (수)') + me('모니터 4대까지 가능해요.', '10:02', 1) + sys('사용자가 다른 업체와 진행하기로 했어요. 이 견적서는 마감됐어요.'); },
        info: function () { return sec('이 공고', '<p class="strong">포크 페스티벌</p><p class="small muted">견적서 마감</p>'); } }
    }
  };

  /* ── 그리기 ── */
  function avatar(r) {
    return r.photo ? '<span class="avatar" style="--img:url(\'' + PH + r.photo + '.jpg\')" role="img" aria-label="' + r.name + ' 사진">' + r.letter + '</span>' : '<span class="avatar">' + r.letter + '</span>';
  }
  function tag(r) { return '<span class="tag' + (r.on && !r.closed ? ' tag--point' : '') + '">' + r.stage + '</span>'; }
  function tabs(list, cur, attr) {
    return '<div class="tab-bar chat-panel__tabs"><div class="tabs" role="tablist">' + list.map(function (t) {
      return '<button type="button" role="tab" aria-selected="' + (t[0] === cur) + '" ' + attr + '="' + t[0] + '">' + t[1] + (t[2] != null ? ' <em>' + t[2] + '</em>' : '') + '</button>';
    }).join('') + '</div></div>';
  }
  function render(p) {
    var R = ROOMS[p.dataset.role], s = p.dataset, live = !p.classList.contains('chat-panel--static'), html;
    var close = live ? '<button class="icon-btn" type="button" data-cw-close aria-label="채팅 닫기">' + I('x') + '</button>' : '';
    if (s.view === 'room' && R[s.room]) {
      var r = R[s.room], pane = s.pane || 'talk';
      html = '<div class="chat-panel__bar chat-panel__bar--room"><button class="icon-btn" type="button" data-cw-back aria-label="목록으로">' + I('left') + '</button>' +
        '<div class="chat-panel__who">' + avatar(r) + '<div><b>' + r.name + ' ' + tag(r) + '</b><small>' + r.sub + '</small></div></div>' +
        (r.doc ? '<a class="icon-btn" href="' + B + r.doc + '" aria-label="' + (p.dataset.role === 'user' ? '내역서' : '견적서') + '">' + I('doc') + '</a>' : '') +
        '<button class="icon-btn" type="button" data-open="cw-report" aria-label="신고">' + I('flag') + '</button>' + close + '</div>' +
        tabs([['talk', '대화'], ['info', '견적 정보']], pane, 'data-cw-pane') +
        '<div class="chat-panel__body">' + (pane === 'info' ? '<div class="chat-panel__scroll">' + r.info() + '</div>'
          : '<div class="room__msgs">' + r.msgs() + '</div>' + (r.locked ? '<div class="composer composer--locked">' + I('lock', 'icon--sm') + r.locked + '</div>'
            : '<div class="composer"><button class="icon-btn" type="button" aria-label="사진 보내기">' + I('image') + '</button><button class="icon-btn" type="button" aria-label="파일 보내기">' + I('clip') + '</button><textarea rows="1" placeholder="메시지를 입력하세요" aria-label="메시지"></textarea><button class="btn btn--primary" type="button" aria-label="보내기">' + I('send', 'icon--sm') + '</button></div>')) + '</div>';
    } else {
      var f = s.filter || 'all', key = R.filterBy;
      var items = R.list.filter(function (id) { return f === 'all' || R[id][key] === f; });
      var unread = R.list.reduce(function (n, id) { return n + (R[id].unread || 0); }, 0);
      html = '<div class="chat-panel__bar"><p class="chat-panel__title">채팅<small>' + (unread ? '안 읽음 ' + unread : '모두 읽음') + '</small></p>' +
        close + '</div>' +
        tabs(R.tabs.map(function (t) { return [t[0], t[1], R.list.filter(function (id) { return t[0] === 'all' || R[id][key] === t[0]; }).length]; }), f, 'data-cw-filter') +
        (R.ctx ? '<div class="chat-panel__ctx">' + I('calendar') + '<select class="select" aria-label="공연"><option>' + R.ctx + '</option></select></div>' : '') +
        '<div class="chat-panel__body"><div class="chat-panel__scroll">' +
        (items.length ? items.map(function (id) {
          var r = R[id];
          return '<button class="chat-item' + (r.unread ? ' is-unread' : '') + (r.closed ? ' is-closed' : '') + '" type="button" data-cw-room="' + id + '">' + avatar(r) +
            '<span style="min-width:0"><span class="chat-item__name">' + r.name + ' ' + tag(r) + '</span><span class="chat-item__last" style="display:block">' + r.last + '</span></span>' +
            '<span class="chat-item__side">' + r.time + (r.unread ? '<span class="count">' + r.unread + '</span>' : '') + '</span></button>';
        }).join('') : '<div class="chat-panel__empty">' + I('chat') + '<b>' + R.tabs.filter(function (t) { return t[0] === f; })[0][1] + ' 채팅이 아직 없어요</b><p>' + (key === 'stage' ? '앞 단계를 컨펌하면 이 단계 업체의 견적서를 받을 수 있어요.' : '여기에 해당하는 대화가 없어요.') + '</p></div>') +
        '<p class="chat-panel__note">' + I('info') + '<span>' + R.note + '</span></p></div></div>';
    }
    p.innerHTML = html;
    var m = p.querySelector('.room__msgs'); if (m) m.scrollTop = m.scrollHeight;
  }

  /* ── 살아 있는 위젯 ── */
  var fab, panel, KEY = 'sd-chat-' + role;
  function save() { if (!panel) return; try { sessionStorage.setItem(KEY, JSON.stringify({ open: !panel.hidden, view: panel.dataset.view, room: panel.dataset.room, pane: panel.dataset.pane, filter: panel.dataset.filter, read: readIds })); } catch (e) {} }
  var readIds = [];
  function markRead(id) {
    var R = ROOMS[role]; if (!R[id] || !R[id].unread) return;
    R[id].unread = 0; if (readIds.indexOf(id) < 0) readIds.push(id); badge();
  }
  function badge() {
    var R = ROOMS[role], n = R.list.reduce(function (k, id) { return k + (R[id].unread || 0); }, 0), b = fab.querySelector('.chat-fab__badge');
    if (b) b.remove();
    if (n) fab.insertAdjacentHTML('beforeend', '<span class="chat-fab__badge">' + n + '</span>');
    fab.setAttribute('aria-label', '채팅 ' + (fab.getAttribute('aria-expanded') === 'true' ? '닫기' : '열기') + (n ? ' · 안 읽은 대화 ' + n + '개' : ''));
  }
  function setOpen(on, pop) {
    panel.hidden = !on; panel.classList.toggle('is-pop', !!pop); fab.setAttribute('aria-expanded', on); badge();
    if (on) { if (panel.dataset.view === 'room') markRead(panel.dataset.room); render(panel); }
    save();
  }
  window.openChat = function (id) {   /* React: useChat().open(roomId) */
    if (!panel) return;
    if (id && ROOMS[role][id]) { panel.dataset.view = 'room'; panel.dataset.room = id; panel.dataset.pane = 'talk'; } else { panel.dataset.view = 'list'; }
    setOpen(true, true);
  };

  if (role) {
    body.classList.add('has-chat');
    body.insertAdjacentHTML('beforeend',
      '<button class="chat-fab" id="chat-fab" type="button" aria-expanded="false" aria-controls="chat-panel">' + I('talk', 'chat-fab__open') + I('x', 'chat-fab__close') + '</button>' +
      '<section class="chat-panel" id="chat-panel" role="dialog" aria-label="채팅" data-role="' + role + '" data-view="list" hidden></section>' +
      (role === 'user' ? '<div class="layer" id="cw-confirm" hidden><div class="modal"><div class="modal__head"><h2>컨펌</h2><button class="icon-btn" type="button" data-close aria-label="닫기">' + I('x') + '</button></div>' +
        '<div class="modal__body"><p class="modal__lead">업체 D 견적서 v2를 컨펌할까요?</p><p>같은 장비 단계의 다른 견적서는 자동으로 마감돼요.</p>' +
        '<table class="info-table mt-16"><tr><th>단계</th><td>장비</td></tr><tr><th>견적서</th><td>v2 · 11월 13일 13:18</td></tr><tr><th>금액</th><td class="num strong">1,350,000원</td></tr><tr><th>자동 검사</th><td>' + pass() + '</td></tr></table>' +
        '<p class="field__hint mt-12">결제는 모든 단계를 정한 뒤 통합 청구서로 한 번에 해요.</p></div>' +
        '<div class="modal__foot"><button class="btn" type="button" data-close>취소</button><a class="btn btn--primary" href="' + B + 'next.html">컨펌</a></div></div></div>' : '') +
      '<div class="layer" id="cw-report" hidden><div class="modal"><div class="modal__head"><h2>신고하기</h2><button class="icon-btn" type="button" data-close aria-label="닫기">' + I('x') + '</button></div>' +
        '<div class="modal__body"><p class="modal__lead">이 채팅방을 신고할까요?</p><p>관리자가 대화를 확인한 뒤 경고를 줄 수 있어요. 경고 3회면 이용이 정지돼요.</p><div class="stack mt-16" style="--gap:8px"><label class="check"><input type="radio" name="cw-r" checked>외부 거래 유도</label><label class="check"><input type="radio" name="cw-r">욕설·불쾌한 말</label><label class="check"><input type="radio" name="cw-r">기타</label></div><textarea class="textarea mt-12" aria-label="내용"></textarea></div>' +
        '<div class="modal__foot"><button class="btn" type="button" data-close>취소</button><button class="btn btn--primary" type="button" data-close>신고하기</button></div></div></div>');
    fab = document.getElementById('chat-fab'); panel = document.getElementById('chat-panel');

    var st = {}; try { st = JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) {}
    (st.read || []).forEach(markRead);
    ['view', 'room', 'pane', 'filter'].forEach(function (k) { if (st[k]) panel.dataset[k] = st[k]; });
    var want = q.get('chat');
    if (want) { panel.dataset.view = want === 'list' ? 'list' : 'room'; if (want !== 'list') panel.dataset.room = want; panel.dataset.pane = q.get('pane') || 'talk'; }
    badge();
    if (want || st.open) setOpen(true);

    fab.addEventListener('click', function () { setOpen(panel.hidden, true); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden && !document.querySelector('.layer:not([hidden])')) { setOpen(false); fab.focus(); } }, true);   /* layout.js가 팝업을 닫기 전에 본다 */
  }

  /* 시안 페이지용 멈춘 창: <div data-chat-demo="user|partner" data-view="list|room" data-room="d" data-pane="talk|info" data-filter="all"> */
  document.querySelectorAll('[data-chat-demo]').forEach(function (el) {
    var p = document.createElement('section');
    p.className = 'chat-panel chat-panel--static'; p.setAttribute('aria-label', '채팅 창 예시');
    p.dataset.role = el.dataset.chatDemo; ['view', 'room', 'pane', 'filter'].forEach(function (k) { if (el.dataset[k]) p.dataset[k] = el.dataset[k]; });
    el.replaceWith(p); render(p);
  });

  /* 창 안 동작 (살아 있는 창과 멈춘 창 모두) + 다른 화면의 [채팅] 버튼 */
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-chat]');
    if (o && panel) { e.preventDefault(); document.querySelectorAll('.noti-panel, .dropdown, .layer').forEach(function (m) { if (!m.closest('.frame')) m.hidden = true; }); openChat(o.dataset.chat); return; }
    var p = e.target.closest('.chat-panel'); if (!p) return;
    var t;
    if (e.target.closest('[data-cw-close]')) { setOpen(false); return; }
    if ((t = e.target.closest('[data-cw-room]'))) { p.dataset.view = 'room'; p.dataset.room = t.dataset.cwRoom; p.dataset.pane = 'talk'; if (p === panel) markRead(t.dataset.cwRoom); }
    else if (e.target.closest('[data-cw-back]')) p.dataset.view = 'list';
    else if ((t = e.target.closest('[data-cw-filter]'))) p.dataset.filter = t.dataset.cwFilter;
    else if ((t = e.target.closest('[data-cw-pane]'))) p.dataset.pane = t.dataset.cwPane;
    else return;
    render(p); if (p === panel) save();
  });
})();
