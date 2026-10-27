// 컨트롤과 모드 실행을 연결한다. 처음에는 저장된 결과만 복원한다.
(function () {
  'use strict';
  window.YT = window.YT || {};

  function start() {
    const ids = ['tabs', 'period', 'cat', 'type', 'kw', 'ko', 'hideSeen', 'viewToggle', 'blockBtn', 'blockPanel', 'go', 'desc', 'list'];
    const el = {};
    ids.forEach(function (id) { el[id] = document.getElementById(id); });
    let mode = YT.MODES[0].id;
    let view = 'list';
    let busy = false;
    let queued = false;
    let result = null;
    let resultMode = mode;
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('yt_prefs')) || {}; } catch (_) { /* 저장소를 못 쓰면 기본값 사용 */ }
    if (typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};

    el.tabs.innerHTML = YT.MODES.map(function (item) {
      return '<button type="button" data-m="' + YT.util.esc(item.id) + '">' + YT.util.esc(item.n) + '</button>';
    }).join('');
    el.cat.innerHTML = YT.CATS.map(function (item) {
      return '<option value="' + YT.util.esc(item.id) + '">' + YT.util.esc(item.n) + '</option>';
    }).join('');
    if (YT.MODES.some(function (item) { return item.id === prefs.mode; })) mode = prefs.mode;
    if ([1, 3, 7, 30].includes(Number(prefs.days))) el.period.value = String(prefs.days);
    if (YT.CATS.some(function (item) { return item.id === prefs.cat; })) el.cat.value = prefs.cat;
    if (['any', 'long', 'short'].includes(prefs.type)) el.type.value = prefs.type;
    if (typeof prefs.kw === 'string') el.kw.value = prefs.kw;
    if (typeof prefs.ko === 'boolean') el.ko.checked = prefs.ko;
    if (typeof prefs.hideSeen === 'boolean') el.hideSeen.checked = prefs.hideSeen;
    if (prefs.view === 'grid') view = 'grid';

    function query() {
      return { days: Number(el.period.value), cat: el.cat.value, type: el.type.value, kw: el.kw.value.trim() };
    }
    // 입력 중인 검색 조건과 실제로 적용한 조건을 분리한다.
    let applied = query();
    function options() { return Object.assign({}, applied, { ko: el.ko.checked, hideSeen: el.hideSeen.checked }); }
    function resultKey(selectedMode, opts) {
      return 'result|' + JSON.stringify([selectedMode, opts.days, opts.cat, opts.type, opts.kw, opts.ko, opts.hideSeen]);
    }
    function save() {
      const value = Object.assign({}, query(), { mode: mode, ko: el.ko.checked, hideSeen: el.hideSeen.checked, view: view });
      try { localStorage.setItem('yt_prefs', JSON.stringify(value)); } catch (_) { /* 현재 화면의 선택은 메모리에 유지 */ }
    }
    function controls() {
      el.tabs.querySelectorAll('[data-m]').forEach(function (button) {
        const active = button.dataset.m === mode;
        button.classList.toggle('on', active);
        button.setAttribute('aria-pressed', String(active));
      });
      el.desc.textContent = YT.MODES.find(function (item) { return item.id === mode; }).d;
      el.viewToggle.textContent = view === 'list' ? '격자로 보기' : '목록으로 보기';
      el.viewToggle.setAttribute('aria-pressed', String(view === 'grid'));
    }
    function paint() {
      if (result) YT.ui.render(result, { mode: resultMode, view: view });
      else el.list.classList.toggle('grid', view === 'grid');
    }

    async function load(force) {
      if (busy) { queued = true; return; }
      busy = true;
      queued = false;
      el.go.disabled = true;
      el.go.textContent = '불러오는 중…';
      el.list.setAttribute('aria-busy', 'true');
      YT.ui.setMsg('불러오는 중…');
      const requestedMode = mode;
      const requestedOptions = options();
      try {
        const next = await YT.modes.run(requestedMode, requestedOptions, force);
        // 완성된 결과를 저장해 구독자 조회 없이도 다음 시작 때 복원한다.
        YT.store.cacheSet(resultKey(requestedMode, requestedOptions), next);
        if (!queued) {
          result = next;
          resultMode = requestedMode;
          paint();
          YT.ui.setMsg('불러왔어요. 영상을 누르면 유튜브에서 열려요.');
        }
      } catch (error) {
        if (!queued) YT.ui.setMsg('오류: ' + (error && error.message ? error.message : String(error)));
      } finally {
        busy = false;
        el.go.disabled = false;
        el.go.textContent = '불러오기';
        el.list.setAttribute('aria-busy', 'false');
        YT.ui.setQuota();
        if (queued) { queued = false; load(false); }
      }
    }

    YT.ui.init({ onChange: function () { load(false); } });
    YT.ui.renderBlockPanel();
    el.tabs.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-m]');
      if (!button || button.dataset.m === mode) return;
      mode = button.dataset.m;
      controls();
      save();
      load(false);
    });
    ['period', 'cat', 'type', 'kw'].forEach(function (id) {
      el[id].addEventListener(id === 'kw' ? 'input' : 'change', function () {
        save();
        if (!busy) YT.ui.setMsg('검색 조건을 바꿨어요. [불러오기]를 누르면 반영돼요.');
      });
    });
    ['ko', 'hideSeen'].forEach(function (id) {
      el[id].addEventListener('change', function () { save(); load(false); });
    });
    el.go.addEventListener('click', function () { applied = query(); save(); load(true); });
    el.viewToggle.addEventListener('click', function () {
      view = view === 'list' ? 'grid' : 'list';
      controls();
      save();
      paint();
    });
    el.blockBtn.addEventListener('click', function () {
      el.blockPanel.hidden = !el.blockPanel.hidden;
      el.blockBtn.setAttribute('aria-expanded', String(!el.blockPanel.hidden));
      if (!el.blockPanel.hidden) YT.ui.renderBlockPanel();
    });

    controls();
    YT.ui.setQuota();
    const ttl = mode === 'live' || mode === 'overview' ? 5 * 60 * 1000 : YT.CACHE_TTL;
    const cached = YT.store.cacheGet(resultKey(mode, options()), ttl);
    if (cached && ['videos', 'channels', 'overview'].includes(cached.kind)) {
      result = cached;
      resultMode = mode;
      paint();
      YT.ui.setMsg('저장된 결과예요. [불러오기]를 누르면 새로 가져와요.');
    } else {
      YT.ui.setMsg('[불러오기]를 누르세요. 저장된 결과가 없으면 자동으로 요청하지 않아요.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
