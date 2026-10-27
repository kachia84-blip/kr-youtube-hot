// 화면 표시와 조작만 담당하고 데이터 요청은 앱에 맡긴다.
(function () {
  'use strict';
  window.YT = window.YT || {};
  let onChange = function () {};
  let initialized = false;
  let mode = '';
  let rows = new Map();
  let nextKey = 0;

  function esc(value) { return YT.util.esc(value == null ? '' : value); }
  function fmt(value) { return esc(YT.util.fmt(value)); }
  function url(base, id) { return esc(base + encodeURIComponent(String(id || ''))); }

  function thumbnail(row, channel) {
    const source = /^https?:\/\//i.test(row.th || '') ? row.th : '';
    const image = source ? '<img src="' + esc(source) + '" alt="" loading="lazy" decoding="async">' : '';
    const badge = channel ? '' : row.live != null
      ? '<span class="badge live">LIVE</span>'
      : '<span class="badge">' + esc(YT.util.dtxt(Math.max(0, Math.floor(Number(row.s) || 0)))) + '</span>';
    return '<div class="th">' + image + badge + '</div>';
  }

  function highlight(row, currentMode) {
    if (currentMode === 'speed') return '시간당 ' + fmt(row.sp) + '회';
    if (currentMode === 'viral') return '구독자의 ' + fmt(row.ratio) + '배 · 구독자 ' + fmt(row.sub) + '명';
    if (currentMode === 'live') return '지금 ' + fmt(row.live) + '명 시청';
    if (currentMode === 'likes') return '좋아요 ' + fmt(row.l) + '개';
    if (currentMode === 'comments') return '댓글 ' + fmt(row.cm) + '개';
    return '';
  }

  function video(row, index, currentMode) {
    const key = String(nextKey++);
    rows.set(key, row);
    const seen = YT.store.isSeen(row.id);
    const fav = YT.store.isFav(row.id);
    const date = new Date(row.d);
    const published = Number.isNaN(date.getTime()) ? '게시 시각 알 수 없음'
      : esc(date.toLocaleString('ko-KR')) + ' · ' + esc(YT.util.ago(row.d));
    const emphasis = highlight(row, currentMode);
    return '<article class="item video' + (seen ? ' seen' : '') + '" data-key="' + esc(key) + '">' +
      '<a class="item-link" data-video-key="' + esc(key) + '" href="' + url('https://www.youtube.com/watch?v=', row.id) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="rank">' + esc(index + 1) + '</span>' + thumbnail(row, false) +
      '<div class="body"><h3 class="title">' + esc(row.t) + '</h3>' +
      '<div class="meta">' + esc(row.c) + '</div>' +
      (emphasis ? '<div class="big">' + emphasis + '</div>' : '') +
      '<div class="meta">조회수 ' + fmt(row.v) + '회 · 좋아요 ' + fmt(row.l) + '개 · 댓글 ' + fmt(row.cm) + '개</div>' +
      '<div class="meta">' + published + '</div></div></a>' +
      '<div class="actions"><button type="button" class="fav' + (fav ? ' on' : '') + '" data-action="fav" aria-label="' + (fav ? '별표 해제' : '나중에 볼 목록에 추가') + '" aria-pressed="' + esc(fav) + '">' + (fav ? '★' : '☆') + '</button>' +
      '<button type="button" data-action="block" aria-label="채널 차단" title="채널 차단">🚫</button></div></article>';
  }

  function channel(row, index) {
    let summary = '합산 ' + fmt(row.total) + '회 · 영상 ' + fmt(row.count) + '개';
    if (row.sub != null) summary += ' · 구독자 ' + fmt(row.sub) + '명';
    if (row.ratio != null) summary += ' · 구독자의 ' + fmt(row.ratio) + '배';
    return '<article class="item channel"><a class="item-link" href="' + url('https://www.youtube.com/channel/', row.cid) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="rank">' + esc(index + 1) + '</span>' + thumbnail(row, true) +
      '<div class="body"><h3 class="title">' + esc(row.c) + '</h3><div class="big">' + summary + '</div>' +
      '<div class="meta">' + esc(row.topT) + '</div></div></a></article>';
  }

  function empty() { return '<p class="empty">조건에 맞는 영상이 없어요</p>'; }

  function updateFavorite(id, active) {
    document.querySelectorAll('#list .video[data-key]').forEach(function (item) {
      const row = rows.get(item.dataset.key);
      if (!row || row.id !== id) return;
      const button = item.querySelector('[data-action="fav"]');
      button.textContent = active ? '★' : '☆';
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? '별표 해제' : '나중에 볼 목록에 추가');
    });
  }

  function listClick(event) {
    const button = event.target.closest('button[data-action]');
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      const item = button.closest('[data-key]');
      const row = item && rows.get(item.dataset.key);
      if (!row) return;
      if (button.dataset.action === 'fav') {
        updateFavorite(row.id, YT.store.toggleFav(row));
        if (mode === 'fav') onChange();
      } else if (button.dataset.action === 'block' && row.cid && window.confirm('「' + row.c + '」 채널을 차단할까요?')) {
        YT.store.addBlockChannel(row.cid, row.c);
        renderBlockPanel();
        onChange();
      }
      return;
    }
    const link = event.target.closest('a[data-video-key]');
    if (!link) return;
    const row = rows.get(link.dataset.videoKey);
    if (!row) return;
    YT.store.markSeen(row.id);
    // 안드로이드 브라우저는 유튜브 앱을 바로 호출하고, 실패하면 웹으로 연다.
    if (/Android/i.test(navigator.userAgent) && event.button === 0) {
      const web = 'https://www.youtube.com/watch?v=' + encodeURIComponent(row.id);
      event.preventDefault();
      window.location.href = 'intent://www.youtube.com/watch?v=' + encodeURIComponent(row.id) +
        '#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=' + encodeURIComponent(web) + ';end';
    }
    document.querySelectorAll('#list .video[data-key]').forEach(function (item) {
      const other = rows.get(item.dataset.key);
      if (other && other.id === row.id) item.classList.add('seen');
    });
  }

  function blockClick(event) {
    const button = event.target.closest('button[data-remove]');
    if (!button) return;
    if (button.dataset.remove === 'channel') YT.store.removeBlockChannel(button.dataset.value);
    else YT.store.removeBlockWord(button.dataset.value);
    renderBlockPanel();
    onChange();
  }

  function blockSubmit(event) {
    event.preventDefault();
    const input = document.getElementById('blockWord');
    const word = input.value.trim();
    if (!word) { input.focus(); return; }
    YT.store.addBlockWord(word);
    renderBlockPanel();
    document.getElementById('blockWord').focus();
    onChange();
  }

  function renderBlockPanel() {
    const blocked = YT.store.blockList();
    function entry(label, value, type) {
      return '<li><span>' + esc(label) + '</span><button type="button" data-remove="' + esc(type) + '" data-value="' + esc(value) + '" aria-label="' + esc(label + ' 차단 해제') + '">삭제</button></li>';
    }
    document.getElementById('blockPanel').innerHTML = '<h2>차단 관리</h2><h3>차단한 채널</h3>' +
      (blocked.channels.length ? '<ul class="block-list">' + blocked.channels.map(function (row) { return entry(row.name || row.cid, row.cid, 'channel'); }).join('') + '</ul>' : '<p class="block-empty">차단한 채널이 없어요.</p>') +
      '<h3>차단한 단어</h3>' + (blocked.words.length ? '<ul class="block-list">' + blocked.words.map(function (word) { return entry(word, word, 'word'); }).join('') + '</ul>' : '<p class="block-empty">차단한 단어가 없어요.</p>') +
      '<form class="block-form"><label for="blockWord">차단할 단어</label><input id="blockWord" type="text" placeholder="제목·채널명에 포함된 단어" required><button type="submit">단어 추가</button></form>';
  }

  YT.ui = {
    init: function (options) {
      onChange = options && typeof options.onChange === 'function' ? options.onChange : function () {};
      if (initialized) return;
      initialized = true;
      const list = document.getElementById('list');
      list.addEventListener('click', listClick);
      list.addEventListener('auxclick', function (event) { if (event.button === 1) listClick(event); });
      const panel = document.getElementById('blockPanel');
      panel.addEventListener('click', blockClick);
      panel.addEventListener('submit', blockSubmit);
    },
    setMsg: function (text) { document.getElementById('msg').textContent = text; },
    setQuota: function () { document.getElementById('quota').textContent = YT.quota.text(); },
    render: function (result, options) {
      mode = options.mode;
      rows = new Map();
      nextKey = 0;
      const list = document.getElementById('list');
      list.classList.toggle('grid', options.view === 'grid');
      if (result.kind === 'overview') {
        list.innerHTML = result.sections.length ? result.sections.map(function (section) {
          return '<section class="overview-section"><h2>' + esc(section.title) + '</h2><div class="section-list">' +
            (section.rows.length ? section.rows.map(function (row, index) { return video(row, index, section.id); }).join('') : empty()) + '</div></section>';
        }).join('') : empty();
      } else {
        list.innerHTML = result.rows.length ? result.rows.map(function (row, index) {
          return result.kind === 'channels' ? channel(row, index) : video(row, index, mode);
        }).join('') : empty();
      }
    },
    renderBlockPanel: renderBlockPanel
  };
}());
