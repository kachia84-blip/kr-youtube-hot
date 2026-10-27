// 데이터 조회와 캐시: 화면용 필터와 정렬은 모드 모듈에서 처리한다.
window.YT = window.YT || {};
(function () {
  'use strict';

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toRow(item) {
    item = item || {};
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const thumbs = snippet.thumbnails || {};
    const thumb = thumbs.medium || thumbs.default || thumbs.high || {};
    const viewers = (item.liveStreamingDetails || {}).concurrentViewers;
    const hasViewers = (typeof viewers === 'number' || typeof viewers === 'string') &&
      String(viewers).trim() !== '' && Number.isFinite(Number(viewers));
    return {
      id: item.id || null,
      t: snippet.title || null,
      c: snippet.channelTitle || null,
      cid: snippet.channelId || null,
      d: snippet.publishedAt || null,
      v: number(stats.viewCount),
      l: number(stats.likeCount),
      cm: number(stats.commentCount),
      s: YT.util.dur((item.contentDetails || {}).duration),
      th: thumb.url || null,
      live: hasViewers ? Number(viewers) : null
    };
  }

  async function cached(key, ttl, force, load) {
    if (!force) {
      const rows = YT.store.cacheGet(key, ttl);
      if (rows !== null && rows !== undefined) return rows;
    }
    const rows = await load();
    YT.store.cacheSet(key, rows);
    return rows;
  }

  async function searchIds(extra, pages) {
    const params = Object.assign({
      part: 'id', type: 'video', regionCode: 'KR',
      relevanceLanguage: 'ko', maxResults: 50
    }, extra);
    const ids = new Set();
    for (let page = 0; page < pages; page++) {
      const result = await YT.api('search', Object.assign({}, params));
      (result.items || []).forEach(function (item) {
        if (item.id && item.id.videoId) ids.add(item.id.videoId);
      });
      if (!result.nextPageToken) break;
      params.pageToken = result.nextPageToken;
    }
    return Array.from(ids);
  }

  async function details(ids, part) {
    const rows = [];
    for (let i = 0; i < ids.length; i += 50) {
      const result = await YT.api('videos', {
        part: part, id: ids.slice(i, i + 50).join(',')
      });
      rows.push(...(result.items || []).map(toRow));
    }
    return rows;
  }

  async function fetchPool(opts, force) {
    const { days = 7, cat = '', type = 'any', kw = '' } = opts || {};
    const key = ['pool', days, cat, type, kw].join('|');
    return cached(key, YT.CACHE_TTL, force, async function () {
      const params = {
        order: 'viewCount',
        publishedAfter: new Date(Date.now() - Number(days) * 86400000).toISOString()
      };
      if (cat) params.videoCategoryId = cat;
      if (kw) params.q = kw;
      if (type === 'short') params.videoDuration = 'short';
      const ids = await searchIds(params, YT.POOL_PAGES);
      return details(ids, 'snippet,statistics,contentDetails');
    });
  }

  async function fetchChart(opts, force) {
    const { cat = '' } = opts || {};
    return cached(['chart', cat].join('|'), YT.CACHE_TTL, force, async function () {
      const params = {
        part: 'snippet,statistics,contentDetails',
        chart: 'mostPopular', regionCode: 'KR', maxResults: 50
      };
      if (cat) params.videoCategoryId = cat;
      const result = await YT.api('videos', params);
      return (result.items || []).map(toRow);
    });
  }

  async function fetchLive(opts, force) {
    const { cat = '', kw = '' } = opts || {};
    return cached(['live', cat, kw].join('|'), 5 * 60 * 1000, force, async function () {
      const params = { eventType: 'live', order: 'viewCount' };
      if (cat) params.videoCategoryId = cat;
      if (kw) params.q = kw;
      const ids = await searchIds(params, 2);
      const rows = await details(ids, 'snippet,statistics,contentDetails,liveStreamingDetails');
      return rows.filter(function (row) { return row.live !== null; });
    });
  }

  async function attachSubs(rows) {
    const ids = Array.from(new Set(rows.map(function (row) { return row.cid; }).filter(Boolean)));
    const subs = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const result = await YT.api('channels', {
        part: 'statistics', id: ids.slice(i, i + 50).join(',')
      });
      (result.items || []).forEach(function (channel) {
        const stats = channel.statistics || {};
        if (!stats.hiddenSubscriberCount) subs.set(channel.id, number(stats.subscriberCount));
      });
    }
    return rows.map(function (row) {
      const copy = Object.assign({}, row);
      delete copy.sub;
      if (subs.has(copy.cid)) copy.sub = subs.get(copy.cid);
      return copy;
    });
  }

  YT.data = { fetchPool, fetchChart, fetchLive, attachSubs, toRow };
}());
