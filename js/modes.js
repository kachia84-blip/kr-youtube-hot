// 모드별 필터, 점수 계산과 순위 집계. 캐시와 저장된 원본은 변경하지 않는다.
window.YT = window.YT || {};
(function () {
  'use strict';

  function withSpeed(rows, now) {
    return rows.map(function (row) {
      const elapsed = (now - Date.parse(row.d)) / 3600000;
      const hours = Number.isFinite(elapsed) ? Math.max(elapsed, 0.5) : 0.5;
      return Object.assign({}, row, { sp: row.v / hours });
    });
  }

  function filterRows(rows, opts) {
    return rows.filter(function (row) {
      if (opts.type === 'short' && !(row.s <= YT.SHORT_MAX)) return false;
      if (opts.type === 'long' && !(row.s > YT.SHORT_MAX || row.live != null)) return false;
      if (opts.ko && !YT.util.hasHangul((row.t || '') + (row.c || ''))) return false;
      if (YT.store.isBlocked(row)) return false;
      return !opts.hideSeen || !YT.store.isSeen(row.id);
    });
  }

  function ranked(rows, key, limit) {
    return rows.slice().sort(function (a, b) { return b[key] - a[key]; }).slice(0, limit);
  }

  async function viralRows(rows) {
    return (await YT.data.attachSubs(rows))
      .filter(function (row) { return row.sub >= 1000; })
      .map(function (row) { return Object.assign({}, row, { ratio: row.v / row.sub }); });
  }

  function groupChannels(rows) {
    const groups = new Map();
    rows.forEach(function (row) {
      let group = groups.get(row.cid);
      if (!group) {
        group = {
          row: {
            cid: row.cid, c: row.c, total: 0, count: 0,
            topId: row.id, topT: row.t, th: row.th
          },
          topViews: row.v
        };
        groups.set(row.cid, group);
      }
      group.row.total += row.v;
      group.row.count++;
      if (row.v > group.topViews) {
        group.topViews = row.v;
        Object.assign(group.row, { c: row.c, topId: row.id, topT: row.t, th: row.th });
      }
    });
    return Array.from(groups.values(), function (group) { return group.row; });
  }

  async function overview(opts, force, now) {
    const rows = withSpeed(filterRows(await YT.data.fetchPool(opts, force), opts), now);
    const viral = await viralRows(rows);
    // 라이브 조회 실패만 허용하고 나머지 조회 오류는 호출자에게 전달한다.
    let live;
    try {
      live = await YT.data.fetchLive(opts, force);
    } catch (error) {
      live = [];
    }
    live = withSpeed(filterRows(live, opts), now);
    const limit = Math.min(5, YT.TOP_N);
    return {
      kind: 'overview',
      sections: [
        { id: 'views', title: '조회수순', rows: ranked(rows, 'v', limit) },
        { id: 'speed', title: '시간당 조회수', rows: ranked(rows, 'sp', limit) },
        { id: 'viral', title: '떡상', rows: ranked(viral, 'ratio', limit) },
        { id: 'live', title: '라이브', rows: ranked(live, 'live', limit) }
      ]
    };
  }

  async function run(modeId, opts, force) {
    opts = opts || {};
    const mode = YT.MODES.find(function (item) { return item.id === modeId; });
    if (!mode) throw new Error('알 수 없는 모드예요: ' + modeId);
    const now = Date.now();
    if (mode.src === 'overview') return overview(opts, force, now);

    // 즐겨찾기는 저장 순서를 유지하고 본 영상 숨기기만 적용한다.
    if (mode.src === 'store') {
      const saved = YT.store.favRows().filter(function (row) {
        return !opts.hideSeen || !YT.store.isSeen(row.id);
      });
      return { kind: 'videos', rows: withSpeed(saved, now).slice(0, YT.TOP_N) };
    }

    let source;
    if (mode.src === 'chart') source = await YT.data.fetchChart(opts, force);
    else if (mode.src === 'live') source = await YT.data.fetchLive(opts, force);
    else source = await YT.data.fetchPool(opts, force);
    let rows = withSpeed(filterRows(source, opts), now);

    if (modeId === 'channels' || modeId === 'rising') {
      let channels = groupChannels(rows);
      let key = 'total';
      if (modeId === 'rising') {
        // 채널당 한 객체로 구독자 조회 함수를 재사용한다.
        channels = (await YT.data.attachSubs(channels))
          .filter(function (channel) { return channel.sub >= 1000; })
          .map(function (channel) {
            return Object.assign({}, channel, { ratio: channel.total / channel.sub });
          });
        key = 'ratio';
      }
      return { kind: 'channels', rows: ranked(channels, key, YT.TOP_N) };
    }

    if (modeId === 'viral') rows = await viralRows(rows);
    const key = {
      views: 'v', speed: 'sp', viral: 'ratio', likes: 'l', comments: 'cm', live: 'live'
    }[modeId];
    return {
      kind: 'videos',
      rows: key ? ranked(rows, key, YT.TOP_N) : rows.slice(0, YT.TOP_N)
    };
  }

  YT.modes = { run };
}());
