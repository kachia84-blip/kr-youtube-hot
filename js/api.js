// 유튜브 API 호출과 미국 서부 날짜 기준의 할당량 기록.
(function () {
  'use strict';

  const YT = window.YT = window.YT || {};
  const quotaKey = 'yt_quota';
  let quotaState = null;

  function today() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return part('year') + '-' + part('month') + '-' + part('day');
  }

  function saveQuota() {
    try {
      window.localStorage.setItem(quotaKey, JSON.stringify(quotaState));
    } catch (_) {
      // 저장소를 쓸 수 없어도 메모리의 기록은 유지한다.
    }
  }

  function currentQuota() {
    const day = today();
    if (!quotaState) {
      try {
        const saved = JSON.parse(window.localStorage.getItem(quotaKey));
        if (saved && typeof saved.day === 'string' &&
            Number.isFinite(saved.used) && saved.used >= 0) {
          quotaState = { day: saved.day, used: saved.used };
        }
      } catch (_) {
        // 읽기 실패나 손상된 값은 새 기록으로 대체한다.
      }
    }
    if (!quotaState || quotaState.day !== day) {
      quotaState = { day: day, used: 0 };
      saveQuota();
    }
    return quotaState;
  }

  YT.quota = {
    limit: 10000,
    used: function () { return currentQuota().used; },
    left: function () { return Math.max(0, this.limit - this.used()); },
    text: function () {
      const left = this.left();
      return '오늘 남은 할당량 ' + left.toLocaleString('ko-KR') +
        ' (약 ' + Math.floor(left / 300) + '번)';
    }
  };

  YT.api = async function (path, params) {
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/' + path);
      Object.entries(params || {}).forEach(function (entry) {
        if (entry[1] !== undefined && entry[1] !== null) {
          url.searchParams.set(entry[0], String(entry[1]));
        }
      });
      url.searchParams.set('key', YT.ensureKey());
      const response = await fetch(url.toString());
      const json = await response.json();
      if (!response.ok || (json && json.error)) {
        const error = json && json.error;
        const reasons = error && Array.isArray(error.errors)
          ? error.errors.map(item => item.reason || '').join(' ') : '';
        const message = typeof error === 'string' ? error : error && error.message;
        if (/quota/i.test((message || '') + ' ' + reasons)) {
          throw new Error('오늘 할당량을 다 썼어요. 한국시간 오후 4시쯤 초기화돼요.');
        }
        throw new Error(message || '유튜브 API 요청에 실패했어요. (HTTP ' + response.status + ')');
      }
      currentQuota().used += path === 'search' ? 100 : 1;
      saveQuota();
      return json;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (/quota/i.test(message)) {
        throw new Error('오늘 할당량을 다 썼어요. 한국시간 오후 4시쯤 초기화돼요.');
      }
      throw new Error(message);
    }
  };
}());
