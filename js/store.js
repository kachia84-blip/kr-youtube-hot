// 저장소 접근 실패 시에도 현재 창의 메모리에서 상태를 유지한다.
(function () {
  'use strict';

  const YT = window.YT = window.YT || {};
  const memory = new Map();
  const cachePrefix = 'yt_cache_';
  const cache = new Map();
  let cacheLoaded = false;

  function read(key, fallback) {
    if (memory.has(key)) return memory.get(key);
    let value = fallback;
    try {
      const saved = JSON.parse(window.localStorage.getItem(key));
      if (Array.isArray(saved)) value = saved;
    } catch (_) {
      // 저장소 접근 실패나 손상된 값은 기본값으로 대체한다.
    }
    memory.set(key, value);
    return value;
  }

  function write(key, value) {
    memory.set(key, value);
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // 메모리에 저장된 최신 상태를 계속 사용한다.
    }
  }

  function removeCache(key) {
    cache.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch (_) {
      // 삭제가 막혀도 현재 창에서는 제거된 상태를 유지한다.
    }
  }

  function oldestCache(except) {
    let oldest = null;
    cache.forEach(function (entry, key) {
      if (key !== except && (oldest === null || entry.t < cache.get(oldest).t)) {
        oldest = key;
      }
    });
    return oldest;
  }

  function loadCache() {
    if (cacheLoaded) return;
    cacheLoaded = true;
    try {
      const storage = window.localStorage;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(cachePrefix)) continue;
        try {
          const entry = JSON.parse(storage.getItem(key));
          if (entry && Number.isFinite(entry.t) &&
              Object.prototype.hasOwnProperty.call(entry, 'v')) {
            cache.set(key, entry);
          }
        } catch (_) {
          // 손상된 캐시 항목은 건너뛴다.
        }
      }
    } catch (_) {
      // 저장소를 읽을 수 없으면 빈 메모리 캐시로 시작한다.
    }
    while (cache.size > 8) removeCache(oldestCache());
  }

  function words() { return read('yt_block_words', []); }
  function channels() { return read('yt_block_channels', []); }
  function normalizeWord(word) { return String(word == null ? '' : word).trim(); }

  YT.store = {
    markSeen: function (id) {
      const seen = read('yt_seen', []);
      if (seen.includes(id)) return;
      write('yt_seen', seen.concat(id).slice(-3000));
    },
    isSeen: function (id) {
      return read('yt_seen', []).includes(id);
    },
    toggleFav: function (row) {
      const rows = read('yt_fav', []);
      const exists = rows.some(item => item.id === row.id);
      const next = rows.filter(item => item.id !== row.id);
      if (!exists) next.unshift(JSON.parse(JSON.stringify(row)));
      write('yt_fav', next);
      return !exists;
    },
    isFav: function (id) {
      return read('yt_fav', []).some(row => row.id === id);
    },
    favRows: function () {
      return JSON.parse(JSON.stringify(read('yt_fav', [])));
    },
    addBlockChannel: function (cid, name) {
      const next = channels().filter(channel => channel.cid !== cid);
      next.push({ cid: cid, name: name });
      write('yt_block_channels', next);
    },
    removeBlockChannel: function (cid) {
      write('yt_block_channels', channels().filter(channel => channel.cid !== cid));
    },
    addBlockWord: function (word) {
      word = normalizeWord(word);
      if (!word || words().some(item => item.toLowerCase() === word.toLowerCase())) return;
      write('yt_block_words', words().concat(word));
    },
    removeBlockWord: function (word) {
      word = normalizeWord(word).toLowerCase();
      write('yt_block_words', words().filter(item => item.toLowerCase() !== word));
    },
    blockList: function () {
      return {
        channels: channels().map(channel => ({ cid: channel.cid, name: channel.name })),
        words: words().slice()
      };
    },
    isBlocked: function (row) {
      if (channels().some(channel => channel.cid === row.cid)) return true;
      const title = String(row.t || '').toLowerCase();
      const channel = String(row.c || '').toLowerCase();
      return words().some(function (word) {
        word = normalizeWord(word).toLowerCase();
        return word !== '' && (title.includes(word) || channel.includes(word));
      });
    },
    cacheGet: function (key, ttlMs) {
      loadCache();
      const storageKey = cachePrefix + key;
      const entry = cache.get(storageKey);
      if (!entry) return null;
      if (Date.now() - entry.t >= ttlMs) {
        removeCache(storageKey);
        return null;
      }
      return entry.v;
    },
    cacheSet: function (key, value) {
      loadCache();
      const storageKey = cachePrefix + key;
      const entry = { t: Date.now(), v: value };
      cache.set(storageKey, entry);
      while (cache.size > 8) removeCache(oldestCache(storageKey));
      let serialized;
      try {
        serialized = JSON.stringify(entry);
      } catch (_) {
        return;
      }
      for (;;) {
        try {
          window.localStorage.setItem(storageKey, serialized);
          return;
        } catch (error) {
          const full = error && (error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014);
          if (!full) return;
          const oldest = oldestCache(storageKey);
          if (oldest === null) {
            // 기존 값이 남아 있는 경우도 제거하고 새 값은 메모리에만 둔다.
            try { window.localStorage.removeItem(storageKey); } catch (_) {}
            return;
          }
          removeCache(oldest);
        }
      }
    }
  };
}());
