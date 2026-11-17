/* 이야기 따라가기 (목업 전용, React로 옮기지 않는다). layout.js가 불러온다.
   HTML만으로 진행 순서를 눌러 보는 도구: 화면 아래 가운데 띠에 "지금 누구의 몇 번째 장면인지, 여기서 무엇을 누르는지"를 보여 주고
   [이전] [다음]으로 정해 둔 순서대로 넘어간다. 시작: story.html, 또는 주소 끝에 ?story=번호.
   띠 없이 화면 안의 진짜 버튼을 눌러도 다음 장면이면 띠가 이어진다 (sessionStorage).
   값은 docs/guides/시연_예시값.md (공간 C 500,000 + 장비 D 1,350,000 = 1,850,000 + 이용료 92,500 = 1,942,500원). */
(function () {
  /* [장, 누구, 화면(pages/ 기준), 장면 제목, 이야기, 여기서 누를 것] */
  var S = [
    ['1. 가입하고 공간 둘러보기', '사용자', 'signup.html', '가입', '밴드 \"가을밤밴드\"가 11월 28일 토요일 공연을 준비하려고 가입해요.', '가입 유형 \"공연을 준비해요\" → [가입하기]'],
    ['1. 가입하고 공간 둘러보기', '사용자', 'login.html', '로그인', '가입한 이메일로 로그인해요. 로그인하면 내 공연 목록으로 가요.', '[로그인]'],
    ['1. 가입하고 공간 둘러보기', '사용자', 'spaces.html', '공간 찾기', '요청서를 쓰기 전에 광주에서 관객 80명이 들어갈 공간을 둘러봐요.', '공간 C 카드'],
    ['1. 가입하고 공간 둘러보기', '사용자', 'space.html', '공간 상세', '공간 C는 15:00에 들어갈 수 있고 외부 장비 반입이 돼요. 요청서를 쓰기로 해요.', '[요청서 쓰기]'],
    ['2. 요청서 올리기', '사용자', 'request-1.html', '요청서 STEP1', '공연 이름, 날짜(공연 14일 전까지만), 시간, 관객 수를 적어요.', '[다음] 필요한 것'],
    ['2. 요청서 올리기', '사용자', 'request-2.html', '요청서 STEP2', '공연장·장비·엔지니어 중 필요한 것을 고르고 단계마다 추가 요청을 적어 게시해요.', '[게시하기]'],
    ['2. 요청서 올리기', '사용자', 'done.html?kind=request', '요청서 게시 완료', '공연장 업체부터 공고가 보여요. 완료 화면이 다음에 할 일을 알려 줘요.', '[내 공연 보기]'],
    ['2. 요청서 올리기', '사용자', 'my.html', '내 공연 목록', '공연마다 섭외가 어디까지 왔는지 한 줄로 보여요. 가을밤 밴드 공연은 공연장 단계가 열렸어요.', '[공연 보기]'],
    ['3. 업체가 견적서 보내기', '업체 D', 'p-onboarding.html?step=biz', '입점 신청', '장비 업체 D는 계정을 만들고 사업자 정보를 냈어요. 관리자 확인을 기다려요.', '[신청하기]'],
    ['3. 업체가 견적서 보내기', '관리자', 'a-review.html', '업체 심사', '관리자가 서류를 확인하고 승인해요. 승인돼야 공고를 보고 견적서를 보낼 수 있어요.', '[승인]'],
    ['3. 업체가 견적서 보내기', '업체 D', 'p-jobs.html', '공고 목록', '공연장이 업체 C로 정해지자 장비 단계가 열려서 업체 D에게 공고가 보여요.', '가을밤 밴드 공연'],
    ['3. 업체가 견적서 보내기', '업체 D', 'p-job.html', '공고 상세', '앞 단계에서 정해진 공간 C 조건(입실 15:00)을 보고 견적을 잡아요.', '[견적서 쓰기]'],
    ['3. 업체가 견적서 보내기', '업체 D', 'p-quote.html', '견적서 작성', '항목·설치 시간·업체할인을 적으면 서버가 합계와 자동 검사를 알려 줘요. 1,350,000원으로 보내요.', '[견적서 보내기]'],
    ['3. 업체가 견적서 보내기', '업체 D', 'done.html?kind=quote&as=partner', '견적서 보냄', '견적서가 사용자의 견적함에 도착했어요.', '[공고 목록]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'my.html', '내 공연 목록', '\"업체 D가 최종 견적을 보냈어요\" 알림이 맨 위 공연에 떠 있어요.', '[공연 보기]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'performance.html', '공연 상세', '공연장은 업체 C로 정함(500,000원). 장비 단계를 펼치면 업체 D·E 견적서가 나란히 보여요.', '[단계별 비교] 또는 [채팅에서 정하기]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'inbox-list.html', '견적함', '공연이 여러 개면 견적함에서 공연별로 받은 견적과 최근 소식을 한눈에 봐요.', '가을밤 밴드 공연'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'inbox.html', '공연별 견적함', '장비 단계 견적서 2장을 자동 검사 결과와 함께 봐요.', '[단계별 비교]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'compare.html', '단계별 견적 비교', '같은 기준으로 나란히 비교해요. 업체 D가 설치 시간도 맞고 엔지니어도 포함이에요.', '업체 D [채팅]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'performance.html?chat=d', '채팅', '오른쪽 아래 채팅 창에서 업체 D와 조율해요. 업체 D가 견적서 v2와 최종 견적을 보내요.', '카드의 [내역서 보기]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'quote.html', '내역서', '내역서를 끝까지 봐야 정할 수 있어요. 항목, 업체할인, 자동 검사 결과를 확인해요.', '[이 업체로 정하기]'],
    ['4. 견적 비교하고 이 업체로 정하기', '사용자', 'next.html?case=gear', '다음 단계로', '업체 D 견적서에 엔지니어가 포함돼 있어서 엔지니어 단계를 건너뛸지 물어봐요.', '[건너뛰기]'],
    ['5. 결제하고 공연 준비하기', '사용자', 'invoice.html', '통합 청구서', '업체 금액 1,850,000원 + 플랫폼 이용료 92,500원 = 1,942,500원. 공연 5일 전 0시까지 결제해야 해요.', '[결제하기]'],
    ['5. 결제하고 공연 준비하기', '사용자', 'pay.html', '테스트 결제', '테스트 결제라 실제로 청구되지 않아요. 결제 직전에 서버가 단계와 견적서 버전을 다시 확인해요.', '[결제하기]'],
    ['5. 결제하고 공연 준비하기', '사용자', 'done.html?kind=pay', '결제 완료', '섭외가 확정됐어요. 결제금은 공연이 끝날 때까지 STAGE DUCK이 보관해요.', '[최종 담당표 보기]'],
    ['5. 결제하고 공연 준비하기', '사용자', 'sheet.html', '최종 담당표', '결제 뒤에야 업체 연락처가 공개돼요. 당일 일정과 담당 범위를 한 장으로 봐요.', '내용 확인'],
    ['5. 결제하고 공연 준비하기', '업체 D', 'p-tech.html', '기술 확인', '공연 전에 업체끼리 전원 위치, 반입 동선 같은 항목을 확인해요.', '[답변 저장]'],
    ['6. 함께 묻고 나누기', '사용자', 'community.html', '커뮤니티', '공연 준비하면서 궁금한 걸 다른 사용자·업체에게 물어봐요. 업체 홍보는 PR 게시판에서 해요.', '[글쓰기]'],
    ['6. 함께 묻고 나누기', '사용자', 'community-write.html', '글쓰기', '글 보기와 같은 모양에 바로 써요. 전화번호·외부 링크는 쓸 수 없어요.', '[올리기]'],
    ['6. 함께 묻고 나누기', '사용자', 'community-post.html', '글 보기·댓글', '업체 D가 댓글을 달면 알림이 와요. 답글은 한 단계까지, 도움 돼요·저장·링크 공유를 할 수 있어요.', '[공유]'],
    ['6. 함께 묻고 나누기', '사용자', 'inquiry-write.html', '1:1 문의', '취소 규칙이 헷갈려서 운영자에게 물어봐요. 화면 캡처를 붙일 수 있어요.', '[문의 보내기]'],
    ['6. 함께 묻고 나누기', '관리자', 'a-cs.html', '문의 답변·공지', '관리자가 답하면 사용자에게 알림이 가요. 공지사항도 여기서 올려요.', '[답변 저장]'],
    ['7. 만약에: 취소와 신고', '사용자', 'cancel.html?when=d1', '공연 취소', '공연 하루 전에 취소하면 업체 금액의 70%(1,295,000원)가 위약금이고 555,000원을 돌려받아요.', '[취소하기]'],
    ['7. 만약에: 취소와 신고', '관리자', 'a-reports.html', '신고·제재', '채팅에서 전화번호를 준 업체가 신고됐어요. 관리자가 대화를 확인하고 경고를 줘요. 3회면 정지예요.', '[경고]'],
    ['7. 만약에: 취소와 신고', '관리자', 'a-orders.html?case=cancel', '거래 이력', '관리자는 공연마다 결정·결제·취소 기록을 시간순으로 봐요. 대신 처리하지는 않아요.', '-']
  ];
  window.STORY = S;

  var q = new URLSearchParams(location.search);
  var inPages = /\/pages\/[^/]*$/.test(location.pathname);
  var P = inPages ? '' : 'pages/';
  function url(i) { var h = S[i][2]; return P + h + (h.indexOf('?') < 0 ? '?' : '&') + 'story=' + (i + 1); }
  function file(h) { return h.split('?')[0]; }
  var KEY = 'sd-story';
  function get() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { v == null ? sessionStorage.removeItem(KEY) : sessionStorage.setItem(KEY, v); } catch (e) {} }

  /* 목록 화면 (story.html) */
  var list = document.getElementById('story-list');
  if (list) {
    var html = '', chap = '';
    S.forEach(function (s, i) {
      if (s[0] !== chap) { if (chap) html += '</ol></section>'; chap = s[0]; html += '<section class="story-chap"><h2>' + chap + '</h2><ol>'; }
      html += '<li><a href="' + url(i) + '"><span class="story-no">' + (i + 1) + '</span><span class="story-who" data-who="' + s[1] + '">' + s[1] + '</span><span class="story-what"><b>' + s[3] + '</b>' + s[4] + '</span><span class="story-do">' + s[5] + '</span></a></li>';
    });
    list.innerHTML = html + '</ol></section>';
    set(null);
    return;
  }

  /* 지금 몇 번째 장면인지: 주소의 ?story= 가 먼저, 없으면 이어 보던 장면의 다음 것 중 이 화면과 같은 것 */
  var here = location.pathname.split('/').pop(), i = -1, n = parseInt(q.get('story'), 10);
  if (n >= 1 && n <= S.length) i = n - 1;
  else {
    var last = parseInt(get(), 10);
    if (last >= 0) for (var k = last + 1; k < Math.min(S.length, last + 4); k++) if (file(S[k][2]) === here) { i = k; break; }
    if (i < 0 && last >= 0 && file(S[last][2]) === here) i = last;
  }
  if (i < 0 || !inPages) return;
  set(i);

  var s = S[i], prev = i > 0 ? url(i - 1) : null, next = i < S.length - 1 ? url(i + 1) : null;
  document.body.classList.add('has-story');
  document.body.insertAdjacentHTML('beforeend',
    '<aside class="story-bar" aria-label="이야기 따라가기">' +
    '<div class="story-bar__top"><span class="story-bar__chap">' + s[0] + '</span><span class="story-bar__count">' + (i + 1) + ' / ' + S.length + '</span>' +
    '<a href="../story.html">목록</a><button type="button" data-story-end aria-label="이야기 끝내기">끝내기</button></div>' +
    '<p class="story-bar__say"><span class="story-who" data-who="' + s[1] + '">' + s[1] + '</span>' + s[4] + '</p>' +
    '<div class="story-bar__foot"><span class="story-bar__do">여기서: ' + s[5] + '</span>' +
    (prev ? '<a class="story-bar__btn" href="' + prev + '">이전</a>' : '') +
    (next ? '<a class="story-bar__btn story-bar__btn--next" href="' + next + '">다음: ' + S[i + 1][3] + '</a>' : '<a class="story-bar__btn story-bar__btn--next" href="../story.html">처음으로</a>') + '</div></aside>');
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-story-end]')) { set(null); document.querySelector('.story-bar').remove(); document.body.classList.remove('has-story'); }
  });
})();
