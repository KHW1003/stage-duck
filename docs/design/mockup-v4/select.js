/* 고르기 칸(.select)의 펼친 목록을 브라우저 기본 대신 우리 스타일로 보여 준다 (목업 전용, layout.js가 불러옴).
   React: shared/ui/Select.tsx (button + listbox). 값은 원래 <select>에 그대로 넣고 change 이벤트를 보낸다.
   마우스: 칸을 누르면 목록. 키보드: 칸에서 Enter·Space·↓ → 목록, ↑↓ 이동, Enter 고르기, Esc 닫기. */
(function () {
  var box = null, sel = null, idx = -1;

  function close(focus) {
    if (!box) return;
    box.remove(); box = null;
    if (sel) { sel.classList.remove('is-open'); sel.setAttribute('aria-expanded', 'false'); if (focus) sel.focus(); }
    sel = null; idx = -1;
  }
  function mark(i) {
    var items = box.querySelectorAll('.sel-list__opt');
    if (!items.length) return;
    idx = Math.max(0, Math.min(items.length - 1, i));
    items.forEach(function (el, k) { el.classList.toggle('is-active', k === idx); });
    items[idx].scrollIntoView({ block: 'nearest' });
  }
  function pick(el) {
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    var s = sel; s.selectedIndex = +el.dataset.i;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }
  function open(s) {
    close(false);
    sel = s; s.classList.add('is-open'); s.setAttribute('aria-expanded', 'true');
    box = document.createElement('div'); box.className = 'sel-list'; box.setAttribute('role', 'listbox');
    box.innerHTML = Array.prototype.map.call(s.options, function (o, i) {
      return '<div class="sel-list__opt' + (i === s.selectedIndex ? ' is-selected' : '') + '" role="option" data-i="' + i + '" aria-selected="' + (i === s.selectedIndex) + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '>' + o.textContent + '</div>';
    }).join('');
    document.body.appendChild(box);
    var r = s.getBoundingClientRect(), h = box.offsetHeight, below = window.innerHeight - r.bottom;
    box.style.minWidth = r.width + 'px';
    box.style.left = Math.min(r.left, window.innerWidth - box.offsetWidth - 8) + 'px';
    box.style.top = (below < h + 12 && r.top > below ? r.top - h - 6 : r.bottom + 6) + 'px';
    mark(s.selectedIndex);
  }

  document.addEventListener('mousedown', function (e) {
    var s = e.target.closest && e.target.closest('select.select');
    if (s && !s.disabled && !s.multiple) { e.preventDefault(); s.focus(); if (sel === s) close(false); else open(s); return; }
    if (box && !box.contains(e.target)) close(false);
  }, true);
  document.addEventListener('click', function (e) { if (box && box.contains(e.target)) pick(e.target.closest('.sel-list__opt')); });
  document.addEventListener('mouseover', function (e) {
    var o = box && e.target.closest && e.target.closest('.sel-list__opt');
    if (o) mark(+o.dataset.i);
  });
  document.addEventListener('keydown', function (e) {
    var s = e.target.closest && e.target.closest('select.select');
    if (!box) {
      if (s && !s.disabled && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || (e.key === 'ArrowDown' && e.altKey))) { e.preventDefault(); open(s); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(idx - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(box.querySelectorAll('.sel-list__opt')[idx]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
  }, true);
  window.addEventListener('resize', function () { close(false); });
  document.addEventListener('scroll', function (e) { if (box && !box.contains(e.target)) close(false); }, true);
})();
