// 공용 도구 모듈: 순수 함수만.
window.YT = window.YT || {};
YT.util = {
  esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  fmt: n => { n = +n || 0; return n >= 1e8 ? (n / 1e8).toFixed(1) + '억' : n >= 1e4 ? (n / 1e4).toFixed(1) + '만' : n.toLocaleString(); },
  // ISO8601 길이(PT1H2M3S) → 초. 라이브 등 형식이 다르면 0
  dur: s => {
    const m = String(s || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  },
  dtxt: s => {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  },
  ago: d => {
    const h = (Date.now() - new Date(d)) / 36e5;
    return h < 1 ? Math.round(h * 60) + '분 전' : h < 24 ? Math.round(h) + '시간 전' : Math.floor(h / 24) + '일 전';
  },
  hasHangul: s => /[가-힣]/.test(s || ''),
};
